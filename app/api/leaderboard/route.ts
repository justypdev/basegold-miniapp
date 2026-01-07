import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { verifyMessage, createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { base } from 'viem/chains';

// ============ REDIS CLIENT ============

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN!,
});

// ============ CONSTANTS ============

const INSTANT_BURN = '0xF9dc5A103C5B09bfe71cF1Badcce362827b34BFE' as `0x${string}`;
const MIN_BURNS_FOR_LEADERBOARD = 1;
const LEADERBOARD_KEY = 'leaderboard:points';
const MAX_LEADERBOARD_SIZE = 100;
const SESSION_TIMEOUT = 60000;

// ============ TYPES ============

interface Session {
  sessionId: string;
  address: string;
  deviceInfo: string;
  createdAt: number;
  lastHeartbeat: number;
  ip?: string;
}

interface LeaderboardEntry {
  address: string;
  name: string;
  gold: number;
  totalClicks: number;
  burnCount: number;
  totalBurned: number;
  timestamp: number;
  verified: boolean;
}

interface SubmitRequest {
  address: string;
  signature: string;
  name: string;
  gold: number;
  totalClicks: number;
  timestamp: number;
  sessionId: string;
}

// ============ VIEM CLIENT ============

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// ============ VERIFY ON-CHAIN BURNS ============

async function getOnChainBurnData(address: string): Promise<{ burnCount: number; totalBurned: number }> {
  try {
    const logs = await publicClient.getLogs({
      address: INSTANT_BURN,
      event: parseAbiItem('event InstantBurn(address indexed buyer, uint256 ethAmount, uint256 bgBurned, uint256 timestamp, uint256 totalBurnedLifetime)'),
      args: { buyer: address as `0x${string}` },
      fromBlock: 'earliest',
      toBlock: 'latest',
    });

    let totalBurned = 0;
    logs.forEach((log: any) => {
      const bgBurned = Number(formatUnits(log.args.bgBurned || 0n, 18));
      totalBurned += bgBurned;
    });

    return {
      burnCount: logs.length,
      totalBurned,
    };
  } catch (error) {
    console.error('Error fetching on-chain burns:', error);
    return { burnCount: 0, totalBurned: 0 };
  }
}

// ============ GET - Fetch Leaderboard ============

export async function GET(request: NextRequest) {
  try {
    const leaderboard = await redis.get<LeaderboardEntry[]>(LEADERBOARD_KEY) || [];
    
    const sorted = leaderboard
      .filter(e => Date.now() - e.timestamp < 30 * 24 * 60 * 60 * 1000)
      .sort((a, b) => b.gold - a.gold)
      .slice(0, 50);

    return NextResponse.json({ leaderboard: sorted });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

// ============ POST - Submit Score ============

export async function POST(request: NextRequest) {
  try {
    const body: SubmitRequest = await request.json();
    const { address, signature, name, gold, totalClicks, timestamp, sessionId } = body;

    const normalizedAddress = address?.toLowerCase();
    if (!normalizedAddress || !/^0x[a-f0-9]{40}$/i.test(normalizedAddress)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    // ============ VALIDATE SESSION ============
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required', kicked: true }, { status: 401 });
    }

    const session = await redis.get<Session>(`session:${normalizedAddress}`);
    
    if (!session) {
      return NextResponse.json({ 
        error: 'No active session', 
        kicked: true,
        reason: 'no_session'
      }, { status: 401 });
    }

    if (session.sessionId !== sessionId) {
      return NextResponse.json({ 
        error: 'Session invalidated - another device is playing', 
        kicked: true,
        reason: 'different_session'
      }, { status: 401 });
    }

    const sanitizedName = (name || '').trim().slice(0, 20) || `${address.slice(0, 6)}...${address.slice(-4)}`;

    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Timestamp expired' }, { status: 400 });
    }

    const expectedMessage = `BaseGold Leaderboard\nAddress: ${address}\nGold: ${gold}\nClicks: ${totalClicks}\nTimestamp: ${timestamp}`;
    
    let isValidSignature = false;
    try {
      isValidSignature = await verifyMessage({
        address: address as `0x${string}`,
        message: expectedMessage,
        signature: signature as `0x${string}`,
      });
    } catch (e) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    if (!isValidSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const onChainData = await getOnChainBurnData(address);
    
    if (onChainData.burnCount < MIN_BURNS_FOR_LEADERBOARD) {
      return NextResponse.json({ 
        error: `Minimum ${MIN_BURNS_FOR_LEADERBOARD} burn(s) required`, 
        currentBurns: onChainData.burnCount 
      }, { status: 400 });
    }

    const savedGame = await redis.get<any>(`game:${normalizedAddress}`);
    
    if (savedGame && Math.abs(savedGame.gold - gold) / Math.max(savedGame.gold, 1) > 0.2) {
      console.warn(`Gold mismatch for ${normalizedAddress}: submitted ${gold}, saved ${savedGame.gold}`);
    }

    let leaderboard = await redis.get<LeaderboardEntry[]>(LEADERBOARD_KEY) || [];

    const newEntry: LeaderboardEntry = {
      address: normalizedAddress,
      name: sanitizedName,
      gold: savedGame ? savedGame.gold : gold,
      totalClicks: savedGame ? savedGame.totalClicks : totalClicks,
      burnCount: onChainData.burnCount,
      totalBurned: onChainData.totalBurned,
      timestamp: Date.now(),
      verified: true,
    };

    const existingIndex = leaderboard.findIndex(e => e.address.toLowerCase() === normalizedAddress);
    
    if (existingIndex >= 0) {
      if (newEntry.gold > leaderboard[existingIndex].gold) {
        leaderboard[existingIndex] = newEntry;
      } else {
        return NextResponse.json({ 
          success: true, 
          message: 'Score not updated (existing score is higher)',
          currentRank: existingIndex + 1,
        });
      }
    } else {
      leaderboard.push(newEntry);
    }

    leaderboard = leaderboard
      .filter(e => Date.now() - e.timestamp < 30 * 24 * 60 * 60 * 1000)
      .sort((a, b) => b.gold - a.gold)
      .slice(0, MAX_LEADERBOARD_SIZE);

    await redis.set(LEADERBOARD_KEY, leaderboard);

    const newRank = leaderboard.findIndex(e => e.address === normalizedAddress) + 1;

    return NextResponse.json({ 
      success: true, 
      message: 'Score submitted successfully',
      rank: newRank,
      entry: newEntry,
    });

  } catch (error) {
    console.error('Error submitting score:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  }
}

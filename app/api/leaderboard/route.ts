import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, formatUnits, fallback } from 'viem';
import { base } from 'viem/chains';

// ============ REDIS CLIENT ============

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN!,
});

// ============ CONSTANTS ============

const INSTANT_BURN = '0xF9dc5A103C5B09bfe71cF1Badcce362827b34BFE' as `0x${string}`;
const MIN_BURNS_FOR_LEADERBOARD = 1;
const LEADERBOARD_KEY = 'leaderboard:points:s2'; // Season 2 leaderboard
const MAX_LEADERBOARD_SIZE = 100;
const SESSION_TIMEOUT = 60000;

// ============ ANTI-CHEAT VALIDATION ============

// Maximum theoretical gold per second at max upgrades + all shop items
// This helps detect obviously tampered scores
const MAX_GOLD_PER_SECOND_THEORETICAL = 50000; // Very generous cap
const MAX_GOLD_PER_CLICK_THEORETICAL = 10000;
const MAX_CLICKS_PER_SECOND = 20;

function validateGoldPlausibility(
  gold: number, 
  totalClicks: number, 
  sessionDurationMinutes: number,
  burnCount: number
): { valid: boolean; reason?: string; suspicionScore: number } {
  let suspicionScore = 0;
  
  // Calculate maximum possible gold
  const maxClickGold = totalClicks * MAX_GOLD_PER_CLICK_THEORETICAL;
  const maxPassiveGold = sessionDurationMinutes * 60 * MAX_GOLD_PER_SECOND_THEORETICAL;
  const maxPossibleGold = maxClickGold + maxPassiveGold;
  
  // If gold exceeds theoretical maximum, it's definitely tampered
  if (gold > maxPossibleGold * 1.5) {
    return { 
      valid: false, 
      reason: 'Gold exceeds theoretical maximum',
      suspicionScore: 100
    };
  }
  
  // Check clicks per minute rate
  const clicksPerMinute = totalClicks / Math.max(sessionDurationMinutes, 1);
  if (clicksPerMinute > MAX_CLICKS_PER_SECOND * 60) {
    suspicionScore += 30;
  }
  
  // Check gold to click ratio (unreasonably high = suspicious)
  const goldPerClick = gold / Math.max(totalClicks, 1);
  if (goldPerClick > MAX_GOLD_PER_CLICK_THEORETICAL * 2) {
    suspicionScore += 20;
  }
  
  // Players with more burns are more trusted
  if (burnCount >= 5) suspicionScore -= 10;
  if (burnCount >= 10) suspicionScore -= 10;
  
  return { 
    valid: true, 
    suspicionScore: Math.max(0, suspicionScore)
  };
}

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
  // Anti-cheat fields
  suspicionScore?: number;
  sessionDuration?: number;
}

interface SubmitRequest {
  address: string;
  signature: string;
  message: string;
  name: string;
  gold: number;
  totalClicks: number;
  timestamp: number;
  sessionId: string;
  // Anti-cheat metadata
  sessionDuration?: number; // minutes
  antiCheatFlags?: number;
}

// ============ VIEM CLIENT WITH FALLBACK ============

const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://mainnet.base.org'),
    http('https://base.llamarpc.com'),
    http('https://base-mainnet.public.blastapi.io'),
    http('https://1rpc.io/base'),
  ]),
});

// ============ VERIFY ON-CHAIN BURNS ============

async function getOnChainBurnData(address: string): Promise<{ burnCount: number; totalBurned: number }> {
  try {
    console.log('Fetching on-chain burns for:', address.substring(0, 10));
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

    console.log('On-chain burn data:', { burnCount: logs.length, totalBurned });
    return {
      burnCount: logs.length,
      totalBurned,
    };
  } catch (error) {
    console.error('Error fetching on-chain burns:', error);
    // Return -1 to indicate error vs actual 0 burns
    return { burnCount: -1, totalBurned: 0 };
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
    const { address, signature, message, name, gold, totalClicks, timestamp, sessionId } = body;

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

    // Validate message format (basic check)
    if (!message || !message.includes('BaseGold Leaderboard')) {
      console.error('Invalid message format:', { message: message?.substring(0, 100) });
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
    }
    
    console.log('Verifying signature for:', { 
      address: address.substring(0, 10), 
      messageStart: message.substring(0, 50),
      sigStart: signature.substring(0, 30)
    });
    
    let isValidSignature = false;
    try {
      // Use publicClient.verifyMessage which supports BOTH EOA and Smart Wallet (EIP-1271) signatures
      isValidSignature = await publicClient.verifyMessage({
        address: address as `0x${string}`,
        message: message,
        signature: signature as `0x${string}`,
      });
      console.log('Signature verification result:', isValidSignature);
    } catch (e: any) {
      console.error('Signature verification error:', e.message || e);
      return NextResponse.json({ error: 'Signature verification failed', details: e.message }, { status: 401 });
    }

    if (!isValidSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const onChainData = await getOnChainBurnData(address);
    
    // Check if RPC failed
    if (onChainData.burnCount === -1) {
      return NextResponse.json({ 
        error: 'Failed to verify on-chain burns. Please try again.', 
        rpcError: true 
      }, { status: 503 });
    }
    
    if (onChainData.burnCount < MIN_BURNS_FOR_LEADERBOARD) {
      return NextResponse.json({ 
        error: `Minimum ${MIN_BURNS_FOR_LEADERBOARD} burn(s) required`, 
        currentBurns: onChainData.burnCount 
      }, { status: 400 });
    }

    const savedGame = await redis.get<any>(`game:${normalizedAddress}`);
    
    // Use saved game data if available (more trusted than client-submitted)
    const finalGold = savedGame ? savedGame.gold : gold;
    const finalClicks = savedGame ? savedGame.totalClicks : totalClicks;
    
    // Get session duration from saved game or estimate
    const sessionDuration = savedGame?.sessionDuration || body.sessionDuration || 60;
    
    // ============ ANTI-CHEAT VALIDATION ============
    const antiCheatResult = validateGoldPlausibility(
      finalGold,
      finalClicks,
      sessionDuration,
      onChainData.burnCount
    );
    
    if (!antiCheatResult.valid) {
      console.warn(`Anti-cheat rejection for ${normalizedAddress}: ${antiCheatResult.reason}`);
      return NextResponse.json({ 
        error: 'Score validation failed', 
        reason: antiCheatResult.reason 
      }, { status: 400 });
    }
    
    // Log suspicious but valid scores
    if (antiCheatResult.suspicionScore > 30) {
      console.warn(`Suspicious score for ${normalizedAddress}: suspicion=${antiCheatResult.suspicionScore}, gold=${finalGold}`);
    }

    let leaderboard = await redis.get<LeaderboardEntry[]>(LEADERBOARD_KEY) || [];

    const newEntry: LeaderboardEntry = {
      address: normalizedAddress,
      name: sanitizedName,
      gold: finalGold,
      totalClicks: finalClicks,
      burnCount: onChainData.burnCount,
      totalBurned: onChainData.totalBurned,
      timestamp: Date.now(),
      verified: true,
      suspicionScore: antiCheatResult.suspicionScore,
      sessionDuration: sessionDuration,
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

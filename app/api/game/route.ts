import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { verifyMessage } from 'viem';

// ============ REDIS CLIENT ============

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!,
});

// ============ ANTI-CHEAT CONSTANTS ============

const MAX_GOLD_PER_SECOND = 10000; // Maximum possible gold/sec with all upgrades
const MAX_CLICKS_PER_SECOND = 20;
const MAX_OFFLINE_HOURS = 8;
const MAX_GOLD_PER_CLICK = 500; // Maximum possible with all upgrades + boosts
const SESSION_TIMEOUT = 60000; // 60 seconds

// ============ TYPES ============

interface Session {
  sessionId: string;
  address: string;
  deviceInfo: string;
  createdAt: number;
  lastHeartbeat: number;
  ip?: string;
}

interface GameState {
  gold: number;
  totalClicks: number;
  upgrades: Record<string, { cost: number; owned: number; multiplier: number; perClick: number; perSec: number }>;
  appliedInstantGold: string[];
  lastSaved: number;
  goldPerSecond: number;
  // Anti-cheat metadata
  totalPlayTime: number;
  sessionStart: number;
  lastClickTimestamp: number;
  clicksThisSession: number;
}

interface SaveRequest {
  address: string;
  signature: string;
  message: string;
  gameState: GameState;
  timestamp: number;
  sessionId: string; // Required for save
}

// ============ VALIDATION HELPERS ============

function validateGameState(newState: GameState, oldState: GameState | null, timeDelta: number): { valid: boolean; reason?: string } {
  // Check for negative values
  if (newState.gold < 0 || newState.totalClicks < 0) {
    return { valid: false, reason: 'Negative values detected' };
  }

  // If no previous state, just do basic validation
  if (!oldState) {
    // New player - make sure they're not starting with millions
    if (newState.gold > 1000) {
      return { valid: false, reason: 'New player starting with too much gold' };
    }
    return { valid: true };
  }

  // Calculate maximum possible gold gain
  const maxGoldFromClicks = (newState.totalClicks - oldState.totalClicks) * MAX_GOLD_PER_CLICK;
  const maxGoldFromPassive = (timeDelta / 1000) * MAX_GOLD_PER_SECOND;
  const maxPossibleGold = oldState.gold + maxGoldFromClicks + maxGoldFromPassive;

  // Allow 20% tolerance for timing issues
  if (newState.gold > maxPossibleGold * 1.2) {
    return { valid: false, reason: `Gold gain too high: ${newState.gold} > ${maxPossibleGold}` };
  }

  // Check click rate
  const clickDelta = newState.totalClicks - oldState.totalClicks;
  const secondsDelta = timeDelta / 1000;
  if (secondsDelta > 0 && clickDelta / secondsDelta > MAX_CLICKS_PER_SECOND * 1.5) {
    return { valid: false, reason: `Click rate too high: ${clickDelta / secondsDelta} CPS` };
  }

  // Check for time manipulation (clock set backwards)
  if (newState.lastSaved < oldState.lastSaved - 60000) {
    return { valid: false, reason: 'Time manipulation detected' };
  }

  return { valid: true };
}

// ============ GET - Load Game State ============

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address')?.toLowerCase();

    if (!address || !/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const gameState = await redis.get<GameState>(`game:${address}`);
    
    if (!gameState) {
      return NextResponse.json({ gameState: null, message: 'No saved game found' });
    }

    // Calculate offline earnings
    const now = Date.now();
    const timeSinceLastSave = now - gameState.lastSaved;
    const maxOfflineTime = MAX_OFFLINE_HOURS * 60 * 60 * 1000;
    const offlineTime = Math.min(timeSinceLastSave, maxOfflineTime);
    
    let offlineGold = 0;
    if (gameState.goldPerSecond > 0 && offlineTime > 60000) { // At least 1 minute
      offlineGold = Math.floor((offlineTime / 1000) * gameState.goldPerSecond);
    }

    return NextResponse.json({
      gameState,
      offlineGold,
      offlineMinutes: Math.floor(offlineTime / 60000),
    });

  } catch (error) {
    console.error('Error loading game:', error);
    return NextResponse.json({ error: 'Failed to load game' }, { status: 500 });
  }
}

// ============ POST - Save Game State ============

export async function POST(request: NextRequest) {
  try {
    const body: SaveRequest = await request.json();
    const { address, signature, message, gameState, timestamp, sessionId } = body;

    // Validate address format
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

    // Check session isn't stale
    if (Date.now() - session.lastHeartbeat > SESSION_TIMEOUT * 2) {
      return NextResponse.json({ 
        error: 'Session expired', 
        kicked: true,
        reason: 'session_expired'
      }, { status: 401 });
    }

    // ============ VERIFY SIGNATURE ============
    const expectedMessage = `BaseGold Save\nAddress: ${address}\nTimestamp: ${timestamp}`;
    if (message !== expectedMessage) {
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
    }

    // Check timestamp is recent (within 5 minutes)
    if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Timestamp expired' }, { status: 400 });
    }

    // Verify wallet signature
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

    // Get existing state for validation
    const existingState = await redis.get<GameState>(`game:${normalizedAddress}`);
    const timeDelta = existingState ? gameState.lastSaved - existingState.lastSaved : 0;

    // Validate game state changes
    const validation = validateGameState(gameState, existingState, timeDelta);
    if (!validation.valid) {
      console.warn(`Anti-cheat triggered for ${normalizedAddress}: ${validation.reason}`);
      return NextResponse.json({ 
        error: 'Invalid game state', 
        reason: validation.reason,
        flagged: true 
      }, { status: 400 });
    }

    // Save to KV
    await redis.set(`game:${normalizedAddress}`, gameState);

    return NextResponse.json({ 
      success: true, 
      message: 'Game saved successfully' 
    });

  } catch (error) {
    console.error('Error saving game:', error);
    return NextResponse.json({ error: 'Failed to save game' }, { status: 500 });
  }
}

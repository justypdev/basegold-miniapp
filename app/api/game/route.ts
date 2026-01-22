import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN!,
});

// ============ SEASON CONFIG ============
const CURRENT_SEASON = 's2'; // Change this to reset all player data
const GAME_KEY_PREFIX = `game:${CURRENT_SEASON}:`; // e.g., game:s2:0x123...

const MAX_OFFLINE_HOURS = 8;
const SESSION_TIMEOUT = 60000;
const MIN_SAVE_INTERVAL = 5000; // Minimum 5 seconds between saves
const MAX_GOLD_INCREASE_PER_SECOND = 100000; // Sanity check for gold increase

interface Session {
  sessionId: string;
  address: string;
  lastHeartbeat: number;
}

interface GameState {
  gold: number;
  totalClicks: number;
  upgrades: any;
  appliedInstantGold: string[];
  lastSaved: number;
  goldPerSecond: number;
  sessionDuration?: number; // Track session duration for anti-cheat
}

// ============ GET - Load Game State ============

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address')?.toLowerCase();

    if (!address || !/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const gameState = await redis.get<GameState>(`${GAME_KEY_PREFIX}${address}`);
    
    if (!gameState) {
      return NextResponse.json({ gameState: null, message: 'No saved game found' });
    }

    const now = Date.now();
    const timeSinceLastSave = now - gameState.lastSaved;
    const maxOfflineTime = MAX_OFFLINE_HOURS * 60 * 60 * 1000;
    const offlineTime = Math.min(timeSinceLastSave, maxOfflineTime);
    
    let offlineGold = 0;
    if (gameState.goldPerSecond > 0 && offlineTime > 60000) {
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
    const body = await request.json();
    const { address, gameState, sessionId } = body;

    const normalizedAddress = address?.toLowerCase();
    if (!normalizedAddress || !/^0x[a-f0-9]{40}$/i.test(normalizedAddress)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    // Validate session
    if (!sessionId) {
      return NextResponse.json({ error: 'Session required', kicked: true }, { status: 401 });
    }

    const session = await redis.get<Session>(`session:${normalizedAddress}`);
    
    if (!session) {
      return NextResponse.json({ error: 'No session', kicked: true }, { status: 401 });
    }

    if (session.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Session invalid', kicked: true }, { status: 401 });
    }

    // ============ ANTI-TAMPERING VALIDATION ============
    
    // Get previous save to compare
    const previousSave = await redis.get<GameState>(`${GAME_KEY_PREFIX}${normalizedAddress}`);
    const now = Date.now();
    
    if (previousSave) {
      const timeSinceLastSave = now - previousSave.lastSaved;
      
      // Rate limit: Don't allow saves faster than MIN_SAVE_INTERVAL
      if (timeSinceLastSave < MIN_SAVE_INTERVAL) {
        return NextResponse.json({ error: 'Saving too fast', rateLimited: true }, { status: 429 });
      }
      
      // Sanity check: Gold shouldn't increase faster than theoretically possible
      const goldIncrease = (gameState.gold || 0) - (previousSave.gold || 0);
      const secondsElapsed = Math.max(timeSinceLastSave / 1000, 1);
      const goldPerSecondRate = goldIncrease / secondsElapsed;
      
      if (goldIncrease > 0 && goldPerSecondRate > MAX_GOLD_INCREASE_PER_SECOND) {
        console.warn(`Suspicious gold increase for ${normalizedAddress}: ${goldPerSecondRate}/sec`);
        // Don't reject, but cap the gold increase
        gameState.gold = previousSave.gold + Math.floor(MAX_GOLD_INCREASE_PER_SECOND * secondsElapsed);
      }
      
      // Track session duration
      gameState.sessionDuration = (previousSave.sessionDuration || 0) + Math.floor(timeSinceLastSave / 60000);
    }

    // Save game state
    await redis.set(`${GAME_KEY_PREFIX}${normalizedAddress}`, {
      ...gameState,
      lastSaved: now,
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error saving game:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

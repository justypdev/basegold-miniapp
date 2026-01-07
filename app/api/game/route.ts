import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL || process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN!,
});

const MAX_OFFLINE_HOURS = 8;
const SESSION_TIMEOUT = 60000;

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

    // Save game state
    await redis.set(`game:${normalizedAddress}`, {
      ...gameState,
      lastSaved: Date.now(),
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error saving game:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

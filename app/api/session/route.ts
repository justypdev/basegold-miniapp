import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!,
});

const SESSION_EXPIRY = 60 * 60 * 24;
const SESSION_TIMEOUT = 60000;

interface Session {
  sessionId: string;
  address: string;
  deviceInfo: string;
  createdAt: number;
  lastHeartbeat: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, address, sessionId, deviceInfo } = body;

    const normalizedAddress = address?.toLowerCase();
    if (!normalizedAddress || !/^0x[a-f0-9]{40}$/i.test(normalizedAddress)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    if (action === 'create' || action === 'takeover') {
      const existingSession = await redis.get<Session>(`session:${normalizedAddress}`);
      
      if (action === 'create' && existingSession) {
        const timeSinceHeartbeat = Date.now() - existingSession.lastHeartbeat;
        if (timeSinceHeartbeat < SESSION_TIMEOUT) {
          return NextResponse.json({
            conflict: true,
            existingSession: {
              deviceInfo: existingSession.deviceInfo,
              createdAt: existingSession.createdAt,
              lastHeartbeat: existingSession.lastHeartbeat,
            },
          });
        }
      }

      const newSessionId = uuidv4();
      await redis.set(`session:${normalizedAddress}`, {
        sessionId: newSessionId,
        address: normalizedAddress,
        deviceInfo: deviceInfo || 'Unknown',
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
      }, { ex: SESSION_EXPIRY });

      return NextResponse.json({ success: true, sessionId: newSessionId });
    }

    if (action === 'heartbeat') {
      const session = await redis.get<Session>(`session:${normalizedAddress}`);
      if (!session) return NextResponse.json({ kicked: true }, { status: 401 });
      if (session.sessionId !== sessionId) return NextResponse.json({ kicked: true }, { status: 401 });
      
      session.lastHeartbeat = Date.now();
      await redis.set(`session:${normalizedAddress}`, session, { ex: SESSION_EXPIRY });
      return NextResponse.json({ success: true });
    }

    if (action === 'end') {
      await redis.del(`session:${normalizedAddress}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

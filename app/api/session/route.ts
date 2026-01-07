import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import { v4 as uuidv4 } from 'uuid';

// ============ REDIS CLIENT ============

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!,
});

// ============ CONSTANTS ============

const SESSION_EXPIRY = 60 * 60 * 24;
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

// ============ HELPER: Verify Signature ============

async function verifyWalletSignature(address: string, message: string, signature: string): Promise<boolean> {
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

// ============ POST - Create/Validate Session ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, address, signature, message, sessionId, deviceInfo, timestamp } = body;

    const normalizedAddress = address?.toLowerCase();
    if (!normalizedAddress || !/^0x[a-f0-9]{40}$/i.test(normalizedAddress)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';

    // ============ CREATE NEW SESSION ============
    if (action === 'create') {
      const expectedMessage = `BaseGold Session\nAddress: ${address}\nTimestamp: ${timestamp}`;
      
      if (message !== expectedMessage) {
        console.log('Message mismatch:', { received: message, expected: expectedMessage });
        return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
      }

      if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        return NextResponse.json({ error: 'Timestamp expired' }, { status: 400 });
      }

      const isValid = await verifyWalletSignature(address, expectedMessage, signature);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }

      const existingSession = await redis.get<Session>(`session:${normalizedAddress}`);
      
      if (existingSession) {
        const timeSinceHeartbeat = Date.now() - existingSession.lastHeartbeat;
        if (timeSinceHeartbeat < SESSION_TIMEOUT) {
          return NextResponse.json({
            conflict: true,
            existingSession: {
              deviceInfo: existingSession.deviceInfo,
              createdAt: existingSession.createdAt,
              lastHeartbeat: existingSession.lastHeartbeat,
            },
            message: 'Another device is currently playing with this wallet',
          });
        }
      }

      const newSessionId = uuidv4();
      const newSession: Session = {
        sessionId: newSessionId,
        address: normalizedAddress,
        deviceInfo: deviceInfo || 'Unknown device',
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
        ip,
      };

      await redis.set(`session:${normalizedAddress}`, newSession, { ex: SESSION_EXPIRY });

      return NextResponse.json({
        success: true,
        sessionId: newSessionId,
        message: 'Session created',
      });
    }

    // ============ FORCE TAKEOVER SESSION ============
    if (action === 'takeover') {
      const expectedMessage = `BaseGold Takeover\nAddress: ${address}\nTimestamp: ${timestamp}`;
      
      if (message !== expectedMessage) {
        return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
      }

      if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        return NextResponse.json({ error: 'Timestamp expired' }, { status: 400 });
      }

      const isValid = await verifyWalletSignature(address, expectedMessage, signature);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }

      const newSessionId = uuidv4();
      const newSession: Session = {
        sessionId: newSessionId,
        address: normalizedAddress,
        deviceInfo: deviceInfo || 'Unknown device',
        createdAt: Date.now(),
        lastHeartbeat: Date.now(),
        ip,
      };

      await redis.set(`session:${normalizedAddress}`, newSession, { ex: SESSION_EXPIRY });

      return NextResponse.json({
        success: true,
        sessionId: newSessionId,
        message: 'Session taken over',
      });
    }

    // ============ HEARTBEAT ============
    if (action === 'heartbeat') {
      if (!sessionId) {
        return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
      }

      const existingSession = await redis.get<Session>(`session:${normalizedAddress}`);

      if (!existingSession) {
        return NextResponse.json({ error: 'Session not found', kicked: true, reason: 'no_session' }, { status: 401 });
      }

      if (existingSession.sessionId !== sessionId) {
        return NextResponse.json({ error: 'Session invalidated', kicked: true, reason: 'different_session' }, { status: 401 });
      }

      existingSession.lastHeartbeat = Date.now();
      await redis.set(`session:${normalizedAddress}`, existingSession, { ex: SESSION_EXPIRY });

      return NextResponse.json({ success: true });
    }

    // ============ VALIDATE SESSION ============
    if (action === 'validate') {
      if (!sessionId) {
        return NextResponse.json({ valid: false, reason: 'No session ID' });
      }

      const existingSession = await redis.get<Session>(`session:${normalizedAddress}`);

      if (!existingSession || existingSession.sessionId !== sessionId) {
        return NextResponse.json({ valid: false, kicked: true });
      }

      return NextResponse.json({ valid: true });
    }

    // ============ END SESSION ============
    if (action === 'end') {
      if (sessionId) {
        const existingSession = await redis.get<Session>(`session:${normalizedAddress}`);
        if (existingSession && existingSession.sessionId === sessionId) {
          await redis.del(`session:${normalizedAddress}`);
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ error: 'Session operation failed' }, { status: 500 });
  }
}

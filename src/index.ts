/**
 * Standalone Socket.IO server (Bun runtime)
 * Uses @socket.io/bun-engine for native Bun WebSocket support
 */

import { Server as Engine } from '@socket.io/bun-engine';
import { Server as SocketIOServer } from 'socket.io';
import type { WebSocketEvents, SocketData } from './types';
import { verifyToken, type VerifyTokenParams } from './auth';
import { checkConnectionAttempt, getAttemptCount, clearConnectionAttempts } from './rate-limit';
import { registerSupportHandlers } from './handlers/support';
import { registerProfileHandlers } from './handlers/profile';
import { handleBroadcastRequest } from './broadcast';

const PORT = Number(process.env.PORT) || 3002;
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) || [];

// --- Parse cookies helper ---
function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

// --- Engine.IO (Bun native) ---
const corsOrigin =
  CORS_ORIGINS.length > 0 ? CORS_ORIGINS : process.env.NODE_ENV === 'development' ? true : false;

const engine = new Engine({
  path: '/socket.io/',
  pingTimeout: 20000,
  pingInterval: 25000,
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  },
});

// --- Socket.IO bound to native engine ---
const io = new SocketIOServer<
  WebSocketEvents,
  WebSocketEvents,
  Record<string, never>,
  SocketData
>();
io.bind(engine);

// --- Auth middleware ---
io.use(async (socket, next) => {
  try {
    const clientIP =
      socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      socket.handshake.headers['x-real-ip']?.toString() ||
      socket.handshake.address ||
      'unknown';

    const token = socket.handshake.auth?.token;

    if (!token) {
      const blocked = checkConnectionAttempt(clientIP, 'no-token');
      if (blocked) return next(new Error(blocked));
      if (getAttemptCount(clientIP, 'no-token') >= 3) {
        console.warn(`[ws] Multiple no-token attempts from ${clientIP}`);
      }
      return next(new Error('Authentication required'));
    }

    // Parse cookies for session validation
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(typeof cookieHeader === 'string' ? cookieHeader : undefined);
    const sessionId = cookies['session_id'] || '';
    const tokenFromCookie = cookies['token'] || '';

    const params: VerifyTokenParams = {
      token,
      sessionId,
      tokenFromCookie,
      ip: clientIP,
      userAgent: socket.handshake.headers['user-agent'] || 'unknown',
    };

    const user = await verifyToken(params);

    if (!user) {
      const blocked = checkConnectionAttempt(clientIP, 'invalid-token');
      if (blocked) return next(new Error(blocked));
      if (getAttemptCount(clientIP, 'invalid-token') >= 3) {
        console.warn(`[ws] Multiple invalid-token attempts from ${clientIP}`);
      }
      return next(new Error('Invalid token'));
    }

    clearConnectionAttempts(clientIP);

    socket.data.user = user;
    socket.data.userId = user.id;
    socket.data.isSupport = user.isSupport;

    next();
  } catch (error) {
    console.error('[ws] Auth error:', error instanceof Error ? error.message : error);
    next(new Error('Authentication failed'));
  }
});

// --- Connection handler ---
io.on('connection', (socket) => {
  console.log(`[ws] Connected: ${socket.id} (user: ${socket.data.userId})`);

  registerSupportHandlers(socket);
  registerProfileHandlers(socket);

  socket.on('disconnect', (reason) => {
    console.log(`[ws] Disconnected: ${socket.id} (${reason})`);
  });

  socket.on('error', (error) => {
    if (
      !error.message?.includes('transport close') &&
      !error.message?.includes('transport error')
    ) {
      console.error(`[ws] Socket error: ${error.message}`);
    }
  });
});

// --- Bun.serve with engine handler + REST routes ---
const engineHandler = engine.handler();

export default {
  port: PORT,
  async fetch(req: Request, server: unknown) {
    const url = new URL(req.url);

    // Health check
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', connections: (engine as any).clientsCount }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Broadcast REST API
    if (req.method === 'POST' && url.pathname.startsWith('/broadcast/')) {
      return handleBroadcastRequest(req, url.pathname, io);
    }

    // Delegate to engine (Socket.IO transport)
    return engineHandler.fetch(req, server as any);
  },
  websocket: engineHandler.websocket,
};

console.log(`[ws] Socket.IO server running on port ${PORT}`);

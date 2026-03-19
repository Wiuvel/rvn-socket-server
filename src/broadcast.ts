/**
 * REST API handler for broadcast requests from rvn-web
 */

import type { Server } from 'socket.io';
import type { Server as Engine } from '@rvncom/socket-bun-engine';
import type {
  WebSocketEvents,
  SocketData,
  BroadcastMessagePayload,
  BroadcastTicketUpdatePayload,
  BroadcastTicketAssignedPayload,
  BroadcastMessageReadPayload,
  BroadcastCommentPayload,
  BroadcastSystemPayload,
} from './types';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';
const MAX_BODY_SIZE = 1_048_576; // 1 MB

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleBroadcastRequest(
  req: Request,
  pathname: string,
  io: Server<WebSocketEvents, WebSocketEvents, Record<string, never>, SocketData>,
  engine: Engine,
): Promise<Response> {
  // Verify internal API key
  if (!INTERNAL_API_KEY || req.headers.get('x-internal-api-key') !== INTERNAL_API_KEY) {
    return unauthorized();
  }

  // Body size limit
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return badRequest('Payload too large');
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  switch (pathname) {
    case '/broadcast/support/message': {
      const data = body as BroadcastMessagePayload;
      if (!data.ticketId || !data.message) return badRequest('Missing ticketId or message');
      io.to(`ticket:${data.ticketId}`).emit('support:message:new', data);
      return ok();
    }

    case '/broadcast/support/ticket-update': {
      const data = body as BroadcastTicketUpdatePayload;
      if (!data.ticketId || !data.ticket) return badRequest('Missing ticketId or ticket');
      io.to(`ticket:${data.ticketId}`).emit('support:ticket:updated', data);
      return ok();
    }

    case '/broadcast/support/ticket-assigned': {
      const data = body as BroadcastTicketAssignedPayload;
      if (!data.ticketId) return badRequest('Missing ticketId');
      io.to(`ticket:${data.ticketId}`).emit('support:ticket:assigned', data);
      return ok();
    }

    case '/broadcast/support/message-read': {
      const data = body as BroadcastMessageReadPayload;
      if (!data.ticketId || !data.messageIds) return badRequest('Missing ticketId or messageIds');
      io.to(`ticket:${data.ticketId}`).emit('support:message:read', data);
      return ok();
    }

    case '/broadcast/profile/comment': {
      const data = body as BroadcastCommentPayload;
      if (!data.profileId || !data.comment) return badRequest('Missing profileId or comment');
      io.to(`profile:${data.profileId}`).emit('profile:comment:new', data);
      return ok();
    }

    case '/broadcast/system': {
      const data = body as BroadcastSystemPayload;
      if (!data.message) return badRequest('Missing message');
      // Leverage 1.0.4 zero-copy broadcast:
      // '4' is Engine.IO message (added by engine), '2' is Socket.IO event.
      // The resulting engine payload should be '2["system:notification",{"message":"..."}]'
      // which engine will frame as '42["system:notification",{"message":"..."}]'
      const packet = '2' + JSON.stringify(['system:notification', data]);
      engine.broadcast(packet);
      return ok();
    }

    default:
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
  }
}

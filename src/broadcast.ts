/**
 * REST API handler for broadcast requests from rvn-web
 */

import type { Server } from 'socket.io';
import type {
  WebSocketEvents,
  SocketData,
  BroadcastMessagePayload,
  BroadcastTicketUpdatePayload,
  BroadcastTicketAssignedPayload,
  BroadcastMessageReadPayload,
  BroadcastCommentPayload,
} from './types';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

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
): Promise<Response> {
  // Verify internal API key
  if (req.headers.get('x-internal-api-key') !== INTERNAL_API_KEY) {
    return unauthorized();
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

    default:
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
  }
}

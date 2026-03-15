/**
 * Support ticket WebSocket handlers
 */

import type { Socket } from 'socket.io';
import type { WebSocketEvents, SocketData } from '../types';
import { verifyTicketAccess } from '../auth';
import { checkTypingRateLimit, cleanupSocketRateLimits } from '../rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerSupportHandlers(
  socket: Socket<WebSocketEvents, WebSocketEvents, Record<string, never>, SocketData>,
): void {
  const { userId, isSupport, user } = socket.data;

  socket.on('support:join', async (data) => {
    const { ticketId } = data;
    if (!ticketId || !UUID_RE.test(ticketId)) {
      socket.emit('support:error', { message: 'Invalid ticket ID', code: 'INVALID_TICKET_ID' });
      return;
    }

    const allowed = await verifyTicketAccess(ticketId, userId, isSupport);
    if (!allowed) {
      socket.emit('support:error', { message: 'Access denied', code: 'ACCESS_DENIED' });
      return;
    }

    socket.join(`ticket:${ticketId}`);
  });

  socket.on('support:leave', (data) => {
    const { ticketId } = data;
    if (!ticketId || !UUID_RE.test(ticketId)) return;
    socket.leave(`ticket:${ticketId}`);
  });

  socket.on('support:typing', (data) => {
    const { ticketId, isTyping } = data;
    if (!ticketId || typeof isTyping !== 'boolean' || !userId) return;
    if (!UUID_RE.test(ticketId)) return;

    const room = `ticket:${ticketId}`;
    if (!socket.rooms.has(room)) return;
    if (!checkTypingRateLimit(socket.id, ticketId, userId)) return;

    socket.to(room).emit('support:typing:status', {
      ticketId,
      userId,
      username: user?.username || '',
      isTyping,
    });
  });

  socket.on('disconnect', () => {
    cleanupSocketRateLimits(socket.id);
  });
}

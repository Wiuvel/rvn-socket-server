/**
 * Profile comments WebSocket handlers
 */

import type { Socket } from 'socket.io';
import type { WebSocketEvents, SocketData } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerProfileHandlers(
  socket: Socket<WebSocketEvents, WebSocketEvents, Record<string, never>, SocketData>,
): void {
  socket.on('profile:join', (data) => {
    const { profileId } = data;
    if (!profileId || !UUID_RE.test(profileId)) return;
    socket.join(`profile:${profileId}`);
  });

  socket.on('profile:leave', (data) => {
    const { profileId } = data;
    if (!profileId || !UUID_RE.test(profileId)) return;
    socket.leave(`profile:${profileId}`);
  });
}

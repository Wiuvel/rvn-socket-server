import { describe, it, expect } from 'bun:test';

// Must set before importing broadcast module (reads env at load time)
process.env.INTERNAL_API_KEY = 'test-key';

const { handleBroadcastRequest } = await import('../src/broadcast');

// Minimal mock of Socket.IO server
function createMockIO() {
  const emitted: Array<{ event: string; data: unknown; room: string }> = [];
  const io = {
    to(room: string) {
      return {
        emit(event: string, data: unknown) {
          emitted.push({ event, data, room });
        },
      };
    },
  };
  const engine = {
    broadcast(data: string) {
      emitted.push({ event: 'engine.broadcast', data, room: 'all' });
    },
  };
  return { io: io as any, engine: engine as any, emitted };
}

function makeRequest(pathname: string, body: unknown, apiKey = 'test-key') {
  return new Request(`http://localhost${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
}

describe('handleBroadcastRequest', () => {
  it('rejects unauthorized requests', async () => {
    const { io, engine } = createMockIO();
    const req = makeRequest('/broadcast/support/message', {}, 'wrong-key');
    const res = await handleBroadcastRequest(req, '/broadcast/support/message', io, engine);
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON', async () => {
    const { io, engine } = createMockIO();
    const req = new Request('http://localhost/broadcast/support/message', {
      method: 'POST',
      headers: { 'x-internal-api-key': 'test-key' },
      body: 'not-json',
    });
    const res = await handleBroadcastRequest(req, '/broadcast/support/message', io, engine);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON');
  });

  it('broadcasts support:message:new', async () => {
    const { io, engine, emitted } = createMockIO();
    const payload = {
      ticketId: 'abc-123',
      message: { id: 'm1', ticket_id: 'abc-123', message_text: 'hello' },
    };
    const req = makeRequest('/broadcast/support/message', payload);
    const res = await handleBroadcastRequest(req, '/broadcast/support/message', io, engine);
    expect(res.status).toBe(200);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.room).toBe('ticket:abc-123');
    expect(emitted[0]!.event).toBe('support:message:new');
  });

  it('validates required fields for support/message', async () => {
    const { io, engine } = createMockIO();
    const req = makeRequest('/broadcast/support/message', { ticketId: 'abc' });
    const res = await handleBroadcastRequest(req, '/broadcast/support/message', io, engine);
    expect(res.status).toBe(400);
  });

  it('broadcasts support:ticket:updated', async () => {
    const { io, engine, emitted } = createMockIO();
    const payload = {
      ticketId: 'tid-1',
      ticket: { id: 'tid-1', status: 'open', updated_at: '2025-01-01' },
    };
    const req = makeRequest('/broadcast/support/ticket-update', payload);
    const res = await handleBroadcastRequest(req, '/broadcast/support/ticket-update', io, engine);
    expect(res.status).toBe(200);
    expect(emitted[0]!.event).toBe('support:ticket:updated');
  });

  it('broadcasts support:ticket:assigned', async () => {
    const { io, engine, emitted } = createMockIO();
    const payload = { ticketId: 'tid-2', assignedTo: 'user-1', assignedUser: null };
    const req = makeRequest('/broadcast/support/ticket-assigned', payload);
    const res = await handleBroadcastRequest(req, '/broadcast/support/ticket-assigned', io, engine);
    expect(res.status).toBe(200);
    expect(emitted[0]!.event).toBe('support:ticket:assigned');
  });

  it('broadcasts support:message:read', async () => {
    const { io, engine, emitted } = createMockIO();
    const payload = { ticketId: 'tid-3', messageIds: ['m1', 'm2'], readBy: 'user' };
    const req = makeRequest('/broadcast/support/message-read', payload);
    const res = await handleBroadcastRequest(req, '/broadcast/support/message-read', io, engine);
    expect(res.status).toBe(200);
    expect(emitted[0]!.event).toBe('support:message:read');
  });

  it('broadcasts profile:comment:new', async () => {
    const { io, engine, emitted } = createMockIO();
    const payload = {
      profileId: 'prof-1',
      comment: { id: 'c1', profile_id: 'prof-1', content: 'nice' },
    };
    const req = makeRequest('/broadcast/profile/comment', payload);
    const res = await handleBroadcastRequest(req, '/broadcast/profile/comment', io, engine);
    expect(res.status).toBe(200);
    expect(emitted[0]!.room).toBe('profile:prof-1');
    expect(emitted[0]!.event).toBe('profile:comment:new');
  });

  it('broadcasts system:notification via engine zero-copy', async () => {
    const { io, engine, emitted } = createMockIO();
    const payload = { message: 'Server going down', type: 'warning' };
    const req = makeRequest('/broadcast/system', payload);
    const res = await handleBroadcastRequest(req, '/broadcast/system', io, engine);
    expect(res.status).toBe(200);
    expect(emitted[0]!.event).toBe('engine.broadcast');
    expect(emitted[0]!.data).toBe('2["system:notification",{"message":"Server going down","type":"warning"}]');
  });

  it('returns 404 for unknown broadcast route', async () => {
    const { io, engine } = createMockIO();
    const req = makeRequest('/broadcast/unknown', {});
    const res = await handleBroadcastRequest(req, '/broadcast/unknown', io, engine);
    expect(res.status).toBe(404);
  });
});

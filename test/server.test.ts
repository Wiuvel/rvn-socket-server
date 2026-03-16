import { describe, it, expect, afterAll } from 'bun:test';

// Import the server default export to start it
const PORT = 13579;
process.env.PORT = String(PORT);
process.env.INTERNAL_API_KEY = 'test-key';

// Dynamic import so env vars are set first
const serverModule = await import('../src/index');
const server = Bun.serve({ ...serverModule.default, port: PORT });

afterAll(() => {
  server.stop(true);
});

const BASE = `http://localhost:${PORT}`;

describe('Health endpoint', () => {
  it('returns status ok with connections count', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(typeof data.connections).toBe('number');
  });
});

describe('Broadcast auth', () => {
  it('rejects without API key', async () => {
    const res = await fetch(`${BASE}/broadcast/support/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: 'test', message: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts with valid API key', async () => {
    const res = await fetch(`${BASE}/broadcast/support/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': 'test-key',
      },
      body: JSON.stringify({
        ticketId: 'test-id',
        message: { id: 'm1', ticket_id: 'test-id', message_text: 'hi' },
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe('Socket.IO engine', () => {
  it('responds to engine.io handshake', async () => {
    const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Engine.IO open packet starts with '0' (packet type)
    expect(text.startsWith('0')).toBe(true);
    const payload = JSON.parse(text.slice(1));
    expect(payload.sid).toBeDefined();
    expect(payload.upgrades).toContain('websocket');
  });

  it('rejects unsupported protocol version', async () => {
    const res = await fetch(`${BASE}/socket.io/?EIO=3&transport=polling`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe('Unsupported protocol version');
  });

  it('rejects unknown transport', async () => {
    const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=fake`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe('Transport unknown');
  });

  it('rejects unknown session ID', async () => {
    const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling&sid=nonexistent`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe('Session ID unknown');
  });
});

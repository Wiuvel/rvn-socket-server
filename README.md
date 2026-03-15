# WebSocket Server

Standalone real-time WebSocket server built on [Socket.IO](https://socket.io/) with [Bun](https://bun.sh/) runtime and native Bun WebSocket support via [`@socket.io/bun-engine`](https://github.com/socketio/bun-engine).

## Features

- Native Bun WebSocket transport (no Node.js compatibility layer)
- Token-based authentication via external auth service callback
- In-memory token & access caching to minimize auth overhead
- IP-based rate limiting for connection attempts
- REST broadcast API for service-to-service event delivery
- Room-based access control (support tickets, profile comments)

## Setup

```bash
bun install
cp .env.example .env.local
```

Edit `.env.local` with your configuration (see `.env.example` for all options).

## Usage

```bash
# Development (auto-reload)
bun dev

# Production
bun start
```

## API

### Health Check

```
GET /health
→ { "status": "ok", "connections": 42 }
```

### Broadcast (internal, requires `x-internal-api-key` header)

| Endpoint | Description |
|---|---|
| `POST /broadcast/support/message` | New support message |
| `POST /broadcast/support/ticket-update` | Ticket status change |
| `POST /broadcast/support/ticket-assigned` | Ticket assignment |
| `POST /broadcast/support/message-read` | Messages marked as read |
| `POST /broadcast/profile/comment` | New profile comment |

### Socket.IO Events

**Client → Server:**
- `support:join` / `support:leave` — join/leave ticket room
- `support:typing` — typing indicator (rate-limited)
- `profile:join` / `profile:leave` — join/leave profile room

**Server → Client:**
- `support:message:new` — new message in ticket
- `support:ticket:updated` — ticket status changed
- `support:ticket:assigned` — ticket assigned
- `support:typing:status` — typing indicator broadcast
- `support:message:read` — messages read
- `support:error` — error notification
- `profile:comment:new` — new profile comment

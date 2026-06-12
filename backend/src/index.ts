import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createHealthController } from './controllers/healthController';
import { registerSocketHandlers } from './socket/socketHandler';
import type { RoomManager } from './rooms/RoomManager';

const PORT = Number(process.env.PORT) || 3001;

/**
 * CLIENT_ORIGIN: comma-separated list of allowed origins, e.g.
 *   CLIENT_ORIGIN=https://fightcam.vercel.app,http://localhost:5173
 * Defaults to "*" for painless local development.
 */
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOrigin = allowedOrigins.includes('*') ? '*' : allowedOrigins;

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

let roomManager: RoomManager | null = null;
const health = createHealthController(() => roomManager);
app.get('/', health);
app.get('/health', health);

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  // Keep payloads tiny: clients only send derived actions, never raw landmarks.
  maxHttpBufferSize: 1e4,
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

roomManager = registerSocketHandlers(io);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[fightcam] server listening on :${PORT} (origins: ${allowedOrigins.join(', ')})`);
});

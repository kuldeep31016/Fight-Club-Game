import { io, type Socket } from 'socket.io-client';

const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:3001';

let socket: Socket | null = null;

/**
 * One shared socket for the whole app. socket.io handles reconnection with
 * exponential backoff; the GameRoom provider re-claims the player's seat
 * after every reconnect via the rejoin-room event.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

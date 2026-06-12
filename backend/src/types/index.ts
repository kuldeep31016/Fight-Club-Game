import type { Socket } from 'socket.io';
import type { MovementAction } from '@fightcam/shared';

/** Server-side representation of a player inside a room. */
export interface ServerPlayer {
  id: string; // stable player id (survives reconnects)
  socketId: string | null; // current socket, null while disconnected
  nickname: string;
  slot: 0 | 1;
  ready: boolean;
  calibrated: boolean;
  connected: boolean;
  wantsRematch: boolean;
  disconnectTimer: NodeJS.Timeout | null;
}

/** Mutable per-fighter combat state owned exclusively by the server. */
export interface ServerFighter {
  playerId: string;
  x: number;
  facing: 1 | -1;
  health: number;
  movement: MovementAction;
  lastPunchAt: number;
  punchActiveUntil: number;
  stunnedUntil: number;
  ko: boolean;
}

export type AppSocket = Socket;

import type { Server, Socket } from 'socket.io';
import {
  EVENTS,
  GAME,
  type CreateRoomPayload,
  type JoinRoomPayload,
  type MovementUpdatePayload,
  type RejoinRoomPayload,
  type RoomErrorPayload,
} from '@fightcam/shared';
import { RoomManager } from '../rooms/RoomManager';

interface SocketSession {
  playerId: string;
  roomCode: string;
}

/** socket.id -> session. Lets us resolve which room/player a socket belongs to. */
const sessions = new Map<string, SocketSession>();

function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const nickname = raw.trim().slice(0, GAME.MAX_NICKNAME_LENGTH);
  return nickname.length >= 1 ? nickname : null;
}

function emitError(socket: Socket, code: RoomErrorPayload['code'], message: string): void {
  socket.emit(EVENTS.ROOM_ERROR, { code, message } satisfies RoomErrorPayload);
}

export function registerSocketHandlers(io: Server): RoomManager {
  const roomManager = new RoomManager(io);

  io.on('connection', (socket: Socket) => {
    /* ----------------------------- Lobby ----------------------------- */

    socket.on(EVENTS.CREATE_ROOM, (payload: CreateRoomPayload) => {
      const nickname = sanitizeNickname(payload?.nickname);
      if (!nickname) return emitError(socket, 'INVALID_NICKNAME', 'Enter a nickname (1-16 characters).');

      const room = roomManager.createRoom();
      const player = room.addPlayer(socket.id, nickname);

      sessions.set(socket.id, { playerId: player.id, roomCode: room.code });
      socket.join(room.code);

      socket.emit(EVENTS.ROOM_CREATED, {
        roomCode: room.code,
        playerId: player.id,
        slot: player.slot,
        lobby: room.lobbyState(),
      });
      room.broadcastLobby();
    });

    socket.on(EVENTS.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const nickname = sanitizeNickname(payload?.nickname);
      if (!nickname) return emitError(socket, 'INVALID_NICKNAME', 'Enter a nickname (1-16 characters).');

      const code = typeof payload?.roomCode === 'string' ? payload.roomCode.toUpperCase().trim() : '';
      const room = roomManager.getRoom(code);
      if (!room) return emitError(socket, 'ROOM_NOT_FOUND', `Room ${code || ''} does not exist or has expired.`);
      if (room.isFull()) return emitError(socket, 'ROOM_FULL', 'That room already has two fighters.');
      if (room.getPhase() !== 'LOBBY') {
        return emitError(socket, 'MATCH_IN_PROGRESS', 'A match is already running in that room.');
      }

      const player = room.addPlayer(socket.id, nickname);
      sessions.set(socket.id, { playerId: player.id, roomCode: room.code });
      socket.join(room.code);

      socket.emit(EVENTS.ROOM_JOINED, {
        roomCode: room.code,
        playerId: player.id,
        slot: player.slot,
        lobby: room.lobbyState(),
      });
      room.broadcastLobby();
    });

    socket.on(EVENTS.REJOIN_ROOM, (payload: RejoinRoomPayload) => {
      const { playerId, roomCode } = payload ?? {};
      if (typeof playerId !== 'string' || typeof roomCode !== 'string') {
        return emitError(socket, 'UNKNOWN', 'Invalid rejoin request.');
      }
      const room = roomManager.getRoom(roomCode);
      if (!room || !room.hasPlayer(playerId)) {
        return emitError(socket, 'ROOM_NOT_FOUND', 'Your previous room is no longer available.');
      }

      const player = room.handleReconnect(playerId, socket.id);
      if (!player) return emitError(socket, 'UNKNOWN', 'Could not restore your seat.');

      sessions.set(socket.id, { playerId, roomCode: room.code });
      socket.join(room.code);

      socket.emit(EVENTS.ROOM_JOINED, {
        roomCode: room.code,
        playerId: player.id,
        slot: player.slot,
        lobby: room.lobbyState(),
      });
      // Catch the rejoining client up with the live match state, if any.
      const snapshot = room.currentSnapshot();
      if (snapshot) socket.emit(EVENTS.STATE_UPDATE, snapshot);
    });

    socket.on(EVENTS.LEAVE_ROOM, () => {
      const session = sessions.get(socket.id);
      if (!session) return;
      const room = roomManager.getRoom(session.roomCode);
      sessions.delete(socket.id);
      socket.leave(session.roomCode);
      if (!room) return;
      if (room.getPhase() === 'FIGHTING' || room.getPhase() === 'COUNTDOWN' || room.getPhase() === 'PAUSED') {
        room.handleDisconnect(session.playerId);
      } else {
        room.removePlayer(session.playerId);
      }
      if (room.isEmpty()) roomManager.destroyRoom(room.code);
    });

    /* ----------------------------- Flow ------------------------------ */

    socket.on(EVENTS.PLAYER_READY, () => {
      const ctx = resolve(socket.id, roomManager);
      ctx?.room.setReady(ctx.playerId);
    });

    socket.on(EVENTS.CALIBRATION_COMPLETE, () => {
      const ctx = resolve(socket.id, roomManager);
      ctx?.room.setCalibrated(ctx.playerId);
    });

    socket.on(EVENTS.PLAY_AGAIN, () => {
      const ctx = resolve(socket.id, roomManager);
      ctx?.room.requestRematch(ctx.playerId);
    });

    socket.on(EVENTS.RETURN_TO_LOBBY, () => {
      const ctx = resolve(socket.id, roomManager);
      ctx?.room.returnToLobby(ctx.playerId);
    });

    /* --------------------------- Gameplay ---------------------------- */
    // Clients only ever send intents. Validation lives in GameEngine.

    socket.on(EVENTS.MOVEMENT_UPDATE, (payload: MovementUpdatePayload) => {
      const ctx = resolve(socket.id, roomManager);
      if (!ctx || typeof payload?.action !== 'string') return;
      ctx.room.movement(ctx.playerId, payload.action);
    });

    socket.on(EVENTS.PUNCH, () => {
      const ctx = resolve(socket.id, roomManager);
      ctx?.room.punch(ctx.playerId);
    });

    /* -------------------------- Disconnects -------------------------- */

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);
      if (!session) return;
      const room = roomManager.getRoom(session.roomCode);
      room?.handleDisconnect(session.playerId);
    });
  });

  return roomManager;
}

function resolve(socketId: string, roomManager: RoomManager) {
  const session = sessions.get(socketId);
  if (!session) return null;
  const room = roomManager.getRoom(session.roomCode);
  if (!room) return null;
  return { room, playerId: session.playerId };
}

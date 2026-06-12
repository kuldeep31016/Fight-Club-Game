import type { Server } from 'socket.io';
import { GAME } from '@fightcam/shared';
import { Room } from './Room';

/** Unambiguous alphabet: no 0/O, 1/I/L to keep codes easy to read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * RoomManager owns every live room: creation, lookup and expiration.
 * Idle rooms (no activity for ROOM_IDLE_TTL_MS) are swept every minute.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweepTimer: NodeJS.Timeout;

  constructor(private io: Server) {
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    this.sweepTimer.unref?.();
  }

  createRoom(): Room {
    let code = this.generateCode();
    while (this.rooms.has(code)) code = this.generateCode();
    const room = new Room(code, this.io);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  /** Find the room a (possibly reconnecting) player belongs to. */
  findRoomByPlayer(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.hasPlayer(playerId)) return room;
    }
    return undefined;
  }

  destroyRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
  }

  roomCount(): number {
    return this.rooms.size;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivityAt > GAME.ROOM_IDLE_TTL_MS;
      if (idle || room.isEmpty()) {
        this.destroyRoom(code);
      }
    }
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < GAME.ROOM_CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }
}

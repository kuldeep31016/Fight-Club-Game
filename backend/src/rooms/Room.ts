import { randomUUID } from 'crypto';
import type { Server } from 'socket.io';
import {
  EVENTS,
  GAME,
  type LobbyState,
  type MatchEndPayload,
  type MovementAction,
  type PlayerInfo,
  type RoomPhase,
} from '@fightcam/shared';
import { GameEngine } from '../game/GameEngine';
import type { ServerPlayer } from '../types';

/**
 * A Room holds up to two players and orchestrates the flow:
 * LOBBY -> CALIBRATION -> COUNTDOWN -> FIGHTING -> ENDED (-> rematch).
 * All combat is delegated to its GameEngine.
 */
export class Room {
  readonly code: string;
  private io: Server;
  private players = new Map<string, ServerPlayer>();
  private engine: GameEngine | null = null;
  private phase: RoomPhase = 'LOBBY';
  lastActivityAt = Date.now();

  constructor(code: string, io: Server) {
    this.code = code;
    this.io = io;
  }

  /* ------------------------------------------------------------------ */
  /* Membership                                                          */
  /* ------------------------------------------------------------------ */

  isFull(): boolean {
    return this.players.size >= 2;
  }

  isEmpty(): boolean {
    return [...this.players.values()].every((p) => !p.connected);
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  addPlayer(socketId: string, nickname: string): ServerPlayer {
    const slot = ([...this.players.values()].some((p) => p.slot === 0) ? 1 : 0) as 0 | 1;
    const player: ServerPlayer = {
      id: randomUUID(),
      socketId,
      nickname,
      slot,
      ready: false,
      calibrated: false,
      connected: true,
      wantsRematch: false,
      disconnectTimer: null,
    };
    this.players.set(player.id, player);
    this.touch();
    return player;
  }

  getPlayer(playerId: string): ServerPlayer | undefined {
    return this.players.get(playerId);
  }

  getPlayerBySocket(socketId: string): ServerPlayer | undefined {
    return [...this.players.values()].find((p) => p.socketId === socketId);
  }

  getOpponent(playerId: string): ServerPlayer | undefined {
    return [...this.players.values()].find((p) => p.id !== playerId);
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (player?.disconnectTimer) clearTimeout(player.disconnectTimer);
    this.players.delete(playerId);
    this.touch();
    this.broadcastLobby();
  }

  /* ------------------------------------------------------------------ */
  /* Flow                                                                */
  /* ------------------------------------------------------------------ */

  setReady(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'LOBBY') return;
    player.ready = true;
    this.touch();
    this.broadcastLobby();

    const everyoneReady =
      this.players.size === 2 && [...this.players.values()].every((p) => p.ready && p.connected);
    if (everyoneReady) {
      this.phase = 'CALIBRATION';
      this.io.to(this.code).emit(EVENTS.CALIBRATION_PHASE, {});
      this.broadcastLobby();
    }
  }

  setCalibrated(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'CALIBRATION') return;
    player.calibrated = true;
    this.touch();
    this.broadcastLobby();

    const everyoneCalibrated =
      this.players.size === 2 &&
      [...this.players.values()].every((p) => p.calibrated && p.connected);
    if (everyoneCalibrated) this.startMatch();
  }

  private startMatch(): void {
    this.phase = 'COUNTDOWN';
    const enginePlayers = [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      slot: p.slot,
    }));

    this.engine?.dispose();
    this.engine = new GameEngine(
      enginePlayers,
      (event, payload) => this.io.to(this.code).emit(event, payload),
      (result) => this.handleMatchEnd(result),
    );
    this.engine.startCountdown();
    this.syncPhaseFromEngine();
  }

  requestRematch(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'ENDED') return;
    player.wantsRematch = true;
    this.touch();
    this.broadcastLobby();

    const both =
      this.players.size === 2 &&
      [...this.players.values()].every((p) => p.wantsRematch && p.connected);
    if (both) {
      for (const p of this.players.values()) p.wantsRematch = false;
      this.startMatch();
    }
  }

  returnToLobby(playerId: string): void {
    if (!this.players.has(playerId)) return;
    if (this.engine?.isActive()) return; // cannot bail to lobby mid-match
    this.phase = 'LOBBY';
    for (const p of this.players.values()) {
      p.ready = false;
      p.calibrated = false;
      p.wantsRematch = false;
    }
    this.touch();
    this.broadcastLobby();
  }

  /* ------------------------------------------------------------------ */
  /* Gameplay passthrough                                                */
  /* ------------------------------------------------------------------ */

  movement(playerId: string, action: MovementAction): void {
    this.touch();
    this.engine?.setMovement(playerId, action);
  }

  punch(playerId: string): void {
    this.touch();
    this.engine?.punch(playerId);
  }

  /* ------------------------------------------------------------------ */
  /* Disconnect / reconnect                                              */
  /* ------------------------------------------------------------------ */

  handleDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    this.touch();

    this.io.to(this.code).emit(EVENTS.PLAYER_DISCONNECTED, {
      playerId: player.id,
      nickname: player.nickname,
    });

    if (this.engine?.isActive()) {
      // Pause the fight and give the player a grace window to come back.
      this.engine.pause();
      this.phase = 'PAUSED';
      this.io.to(this.code).emit(EVENTS.MATCH_PAUSED, {
        playerId: player.id,
        nickname: player.nickname,
        graceMs: GAME.RECONNECT_GRACE_MS,
      });

      player.disconnectTimer = setTimeout(() => {
        // Grace expired mid-match: opponent wins automatically.
        if (!player.connected && this.engine?.isActive()) {
          this.engine.forfeit(player.id, 'DISCONNECT');
        }
        this.players.delete(player.id);
        this.broadcastLobby();
      }, GAME.RECONNECT_GRACE_MS);
    } else {
      // Not in a match: drop them after the grace window if they never return.
      player.disconnectTimer = setTimeout(() => {
        if (!player.connected) {
          this.players.delete(player.id);
          if (this.phase !== 'ENDED') this.phase = 'LOBBY';
          this.broadcastLobby();
        }
      }, GAME.RECONNECT_GRACE_MS);
    }
    this.broadcastLobby();
  }

  handleReconnect(playerId: string, socketId: string): ServerPlayer | undefined {
    const player = this.players.get(playerId);
    if (!player) return undefined;

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    player.connected = true;
    player.socketId = socketId;
    this.touch();

    this.io.to(this.code).emit(EVENTS.PLAYER_RECONNECTED, {
      playerId: player.id,
      nickname: player.nickname,
    });

    if (this.phase === 'PAUSED' && this.engine) {
      const everyoneBack = [...this.players.values()].every((p) => p.connected);
      if (everyoneBack) {
        this.io.to(this.code).emit(EVENTS.MATCH_RESUMED, {});
        this.engine.resume();
        this.syncPhaseFromEngine();
      }
    }
    this.broadcastLobby();
    return player;
  }

  /* ------------------------------------------------------------------ */
  /* State helpers                                                       */
  /* ------------------------------------------------------------------ */

  private handleMatchEnd(_result: MatchEndPayload): void {
    this.phase = 'ENDED';
    this.broadcastLobby();
  }

  private syncPhaseFromEngine(): void {
    if (this.engine) this.phase = this.engine.getPhase();
  }

  lobbyState(): LobbyState {
    const players: PlayerInfo[] = [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        slot: p.slot,
        connected: p.connected,
        ready: p.ready,
        calibrated: p.calibrated,
      }));
    return { roomCode: this.code, phase: this.phase, players };
  }

  broadcastLobby(): void {
    this.io.to(this.code).emit(EVENTS.LOBBY_UPDATE, this.lobbyState());
  }

  currentSnapshot() {
    return this.engine?.snapshot() ?? null;
  }

  getPhase(): RoomPhase {
    return this.phase;
  }

  dispose(): void {
    for (const p of this.players.values()) {
      if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
    }
    this.engine?.dispose();
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }
}

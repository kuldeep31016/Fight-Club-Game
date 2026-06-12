import {
  EVENTS,
  GAME,
  type FighterState,
  type GameSnapshot,
  type MatchEndPayload,
  type MovementAction,
  type RoomPhase,
} from '@fightcam/shared';
import type { ServerFighter } from '../types';

interface EnginePlayer {
  id: string;
  nickname: string;
  slot: 0 | 1;
}

type Broadcast = (event: string, payload: unknown) => void;
type MatchEndHook = (result: MatchEndPayload) => void;

/**
 * GameEngine is the single source of truth for a match.
 *
 * Clients only ever send intents (MOVE_FORWARD / MOVE_BACKWARD / IDLE / PUNCH).
 * Positions, ranges, cooldowns, stun, damage, health and the winner are all
 * computed here. Nothing a client sends can directly mutate health.
 */
export class GameEngine {
  private fighters = new Map<string, ServerFighter>();
  private players: EnginePlayer[];
  private broadcast: Broadcast;
  private onMatchEnd: MatchEndHook;

  private phase: RoomPhase = 'COUNTDOWN';
  private tickTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private lastTickAt = 0;

  constructor(players: EnginePlayer[], broadcast: Broadcast, onMatchEnd: MatchEndHook) {
    this.players = players;
    this.broadcast = broadcast;
    this.onMatchEnd = onMatchEnd;
    this.resetFighters();
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  startCountdown(): void {
    this.phase = 'COUNTDOWN';
    this.resetFighters();
    this.emitSnapshot();

    let secondsLeft = GAME.COUNTDOWN_SECONDS;
    this.broadcast(EVENTS.MATCH_COUNTDOWN, { secondsLeft });

    this.countdownTimer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        this.broadcast(EVENTS.MATCH_COUNTDOWN, { secondsLeft });
        return;
      }
      this.clearTimer('countdown');
      this.startFight();
    }, 1000);
  }

  private startFight(): void {
    this.phase = 'FIGHTING';
    this.lastTickAt = Date.now();
    this.broadcast(EVENTS.MATCH_START, { startedAt: Date.now() });

    this.tickTimer = setInterval(() => this.tick(), 1000 / GAME.TICK_RATE);
    this.snapshotTimer = setInterval(() => this.emitSnapshot(), 1000 / GAME.SNAPSHOT_RATE);
  }

  pause(): void {
    if (this.phase !== 'FIGHTING' && this.phase !== 'COUNTDOWN') return;
    this.clearTimer('countdown');
    this.clearTimer('tick');
    this.clearTimer('snapshot');
    this.phase = 'PAUSED';
    // Freeze movement intents so nobody slides while paused.
    for (const f of this.fighters.values()) f.movement = 'IDLE';
    this.emitSnapshot();
  }

  resume(): void {
    if (this.phase !== 'PAUSED') return;
    // Resume through a fresh countdown so both players can get set again.
    this.startCountdown();
  }

  /** Hard-stop a match (disconnect forfeit). Winner is decided by the room. */
  forfeit(loserId: string, reason: MatchEndPayload['reason']): void {
    const winner = this.players.find((p) => p.id !== loserId);
    const loser = this.players.find((p) => p.id === loserId);
    if (!winner || !loser) return;
    this.endMatch(winner, loser, reason);
  }

  dispose(): void {
    this.clearTimer('countdown');
    this.clearTimer('tick');
    this.clearTimer('snapshot');
  }

  isActive(): boolean {
    return this.phase === 'FIGHTING' || this.phase === 'COUNTDOWN' || this.phase === 'PAUSED';
  }

  getPhase(): RoomPhase {
    return this.phase;
  }

  /* ------------------------------------------------------------------ */
  /* Client intents                                                      */
  /* ------------------------------------------------------------------ */

  setMovement(playerId: string, action: MovementAction): void {
    if (this.phase !== 'FIGHTING') return;
    const fighter = this.fighters.get(playerId);
    if (!fighter || fighter.ko) return;
    if (action !== 'MOVE_FORWARD' && action !== 'MOVE_BACKWARD' && action !== 'IDLE') return;
    fighter.movement = action;
  }

  /**
   * Validates a punch. A punch only lands when:
   *  - the match is live
   *  - the attacker's server-side cooldown has expired
   *  - the attacker is not stunned or KO'd
   *  - the opponent is within PUNCH_RANGE
   */
  punch(playerId: string): void {
    if (this.phase !== 'FIGHTING') return;

    const attacker = this.fighters.get(playerId);
    const victim = this.getOpponent(playerId);
    if (!attacker || !victim || attacker.ko || victim.ko) return;

    const now = Date.now();
    if (now - attacker.lastPunchAt < GAME.PUNCH_COOLDOWN_MS) return; // cooldown not expired
    if (now < attacker.stunnedUntil) return; // cannot punch while stunned

    attacker.lastPunchAt = now;
    attacker.punchActiveUntil = now + GAME.PUNCH_ACTIVE_MS;

    const landed = Math.abs(attacker.x - victim.x) <= GAME.PUNCH_RANGE;

    this.broadcast(EVENTS.PUNCH_THROWN, { playerId, landed });

    if (!landed) return;

    // --- Hit resolution (server only) ---
    victim.health = Math.max(0, victim.health - 1);
    victim.stunnedUntil = now + GAME.HIT_STUN_MS;
    victim.movement = 'IDLE';
    // Knock the victim back, respecting arena bounds.
    const knockDir = victim.x >= attacker.x ? 1 : -1;
    victim.x = this.clampX(victim.x + knockDir * GAME.KNOCKBACK);

    this.broadcast(EVENTS.PLAYER_HIT, {
      attackerId: playerId,
      victimId: victim.playerId,
      victimHealth: victim.health,
    });
    this.broadcast(EVENTS.HEALTH_UPDATE, { health: this.healthMap() });

    if (victim.health <= 0) {
      victim.ko = true;
      const winner = this.players.find((p) => p.id === playerId)!;
      const loser = this.players.find((p) => p.id === victim.playerId)!;
      // Give the snapshot loop one beat to deliver the KO pose, then end.
      setTimeout(() => this.endMatch(winner, loser, 'KO'), 60);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Simulation                                                          */
  /* ------------------------------------------------------------------ */

  private tick(): void {
    const now = Date.now();
    const dt = Math.min((now - this.lastTickAt) / 1000, 0.1);
    this.lastTickAt = now;

    const [a, b] = this.players.map((p) => this.fighters.get(p.id)!);

    for (const fighter of [a, b]) {
      if (fighter.ko || now < fighter.stunnedUntil) continue;
      if (fighter.movement === 'IDLE') continue;

      const dir = fighter.movement === 'MOVE_FORWARD' ? fighter.facing : -fighter.facing;
      fighter.x = this.clampX(fighter.x + dir * GAME.MOVE_SPEED * dt);
    }

    // Enforce minimum gap so fighters never pass through each other.
    const left = a.x <= b.x ? a : b;
    const right = left === a ? b : a;
    if (right.x - left.x < GAME.MIN_GAP) {
      const mid = (left.x + right.x) / 2;
      left.x = this.clampX(mid - GAME.MIN_GAP / 2);
      right.x = this.clampX(mid + GAME.MIN_GAP / 2);
    }
  }

  private endMatch(
    winner: EnginePlayer,
    loser: EnginePlayer,
    reason: MatchEndPayload['reason'],
  ): void {
    if (this.phase === 'ENDED') return;
    this.phase = 'ENDED';
    this.clearTimer('countdown');
    this.clearTimer('tick');
    this.clearTimer('snapshot');
    this.emitSnapshot();

    const result: MatchEndPayload = {
      winnerId: winner.id,
      winnerNickname: winner.nickname,
      loserId: loser.id,
      loserNickname: loser.nickname,
      reason,
    };
    this.broadcast(EVENTS.MATCH_END, result);
    this.onMatchEnd(result);
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  private resetFighters(): void {
    for (const player of this.players) {
      this.fighters.set(player.id, {
        playerId: player.id,
        x: player.slot === 0 ? GAME.SPAWN_P1_X : GAME.SPAWN_P2_X,
        facing: player.slot === 0 ? 1 : -1,
        health: GAME.MAX_HEALTH,
        movement: 'IDLE',
        lastPunchAt: 0,
        punchActiveUntil: 0,
        stunnedUntil: 0,
        ko: false,
      });
    }
  }

  private emitSnapshot(): void {
    this.broadcast(EVENTS.STATE_UPDATE, this.snapshot());
  }

  snapshot(): GameSnapshot {
    const now = Date.now();
    const fighters: FighterState[] = this.players.map((p) => {
      const f = this.fighters.get(p.id)!;
      return {
        id: p.id,
        nickname: p.nickname,
        slot: p.slot,
        x: f.x,
        facing: f.facing,
        health: f.health,
        punching: now < f.punchActiveUntil,
        stunned: now < f.stunnedUntil,
        ko: f.ko,
      };
    });
    return { phase: this.phase, fighters, serverTime: now };
  }

  private healthMap(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, f] of this.fighters) out[id] = f.health;
    return out;
  }

  private getOpponent(playerId: string): ServerFighter | undefined {
    const other = this.players.find((p) => p.id !== playerId);
    return other ? this.fighters.get(other.id) : undefined;
  }

  private clampX(x: number): number {
    return Math.min(GAME.ARENA_MAX_X, Math.max(GAME.ARENA_MIN_X, x));
  }

  private clearTimer(which: 'countdown' | 'tick' | 'snapshot'): void {
    const map = {
      countdown: () => {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      },
      tick: () => {
        if (this.tickTimer) clearInterval(this.tickTimer);
        this.tickTimer = null;
      },
      snapshot: () => {
        if (this.snapshotTimer) clearInterval(this.snapshotTimer);
        this.snapshotTimer = null;
      },
    };
    map[which]();
  }
}

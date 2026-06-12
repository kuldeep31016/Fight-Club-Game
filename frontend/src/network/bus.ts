import type {
  GameSnapshot,
  MatchEndPayload,
  PlayerHitPayload,
  PunchThrownPayload,
} from '@fightcam/shared';

export interface BusEvents {
  snapshot: GameSnapshot;
  'punch-thrown': PunchThrownPayload;
  'player-hit': PlayerHitPayload;
  'match-start': undefined;
  'match-end': MatchEndPayload;
  countdown: number;
  'local-action': string; // what the vision pipeline detected, for the HUD badge
}

type Handler<T> = (payload: T) => void;

/**
 * Minimal typed pub/sub. React, the socket layer, the audio engine and the
 * Phaser scene all talk through this instead of holding references to each
 * other.
 */
class GameBus {
  private handlers = new Map<keyof BusEvents, Set<Handler<never>>>();

  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<BusEvents[K]>)(payload));
  }
}

export const gameBus = new GameBus();

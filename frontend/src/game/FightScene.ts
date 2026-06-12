import Phaser from 'phaser';
import { GAME, type GameSnapshot, type PlayerHitPayload } from '@fightcam/shared';
import { gameBus } from '../network/bus';
import { Fighter } from './Fighter';

export const SCENE_WIDTH = 960;
export const SCENE_HEIGHT = 540;
const FLOOR_Y = 470;

/**
 * Pure renderer: the scene never simulates combat. It consumes authoritative
 * snapshots from the server (via the game bus), interpolates fighter
 * positions for smoothness and plays juice (shake, flash, POW bursts).
 */
export class FightScene extends Phaser.Scene {
  private fighters = new Map<string, Fighter>();
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super('FightScene');
  }

  create(): void {
    this.drawDojo();

    this.unsubscribers.push(
      gameBus.on('snapshot', (snap) => this.applySnapshot(snap)),
      gameBus.on('player-hit', (hit) => this.onHit(hit)),
      gameBus.on('match-end', () => this.cameras.main.flash(400, 242, 179, 61)),
    );

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribers.forEach((u) => u());
      this.unsubscribers = [];
    });
  }

  override update(_time: number, delta: number): void {
    for (const fighter of this.fighters.values()) fighter.tick(delta);
  }

  /* ------------------------------------------------------------------ */

  private applySnapshot(snap: GameSnapshot): void {
    for (const state of snap.fighters) {
      let fighter = this.fighters.get(state.id);
      if (!fighter) {
        fighter = new Fighter(
          this,
          state.id,
          state.nickname,
          state.slot,
          this.arenaToPx(state.x),
          FLOOR_Y,
        );
        this.fighters.set(state.id, fighter);
      }
      fighter.applyState({ ...state, x: this.arenaToPx(state.x) });
    }

    // Drop fighters that are no longer in the match (e.g. replaced room).
    const liveIds = new Set(snap.fighters.map((f) => f.id));
    for (const [id, fighter] of this.fighters) {
      if (!liveIds.has(id)) {
        fighter.destroy();
        this.fighters.delete(id);
      }
    }
  }

  private onHit(hit: PlayerHitPayload): void {
    const victim = this.fighters.get(hit.victimId);
    const attacker = this.fighters.get(hit.attackerId);
    victim?.playHit();
    this.cameras.main.shake(140, 0.012);

    if (victim && attacker) {
      const midX = (victim.x + attacker.x) / 2;
      this.powBurst(midX, FLOOR_Y - 130);
    }
  }

  /** Comic-style POW! burst at the point of impact. */
  private powBurst(x: number, y: number): void {
    const star = this.add.star(x, y, 8, 14, 34, 0xf2b33d).setDepth(20);
    const word = this.add
      .text(x, y, 'POW!', {
        fontFamily: '"Bungee", sans-serif',
        fontSize: '26px',
        color: '#1c1410',
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setAngle(Phaser.Math.Between(-12, 12));

    this.tweens.add({
      targets: [star, word],
      scale: { from: 0.4, to: 1.15 },
      alpha: { from: 1, to: 0 },
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => {
        star.destroy();
        word.destroy();
      },
    });
  }

  private arenaToPx(x: number): number {
    return (x / GAME.ARENA_WIDTH) * SCENE_WIDTH;
  }

  /* ------------------------------------------------------------------ */
  /* Arena art (procedural dojo)                                         */
  /* ------------------------------------------------------------------ */

  private drawDojo(): void {
    const g = this.add.graphics();

    // Wall
    g.fillGradientStyle(0x241b14, 0x241b14, 0x171109, 0x171109, 1);
    g.fillRect(0, 0, SCENE_WIDTH, FLOOR_Y);

    // Wall panels
    g.lineStyle(3, 0x100b06, 1);
    for (let x = 0; x <= SCENE_WIDTH; x += 120) {
      g.lineBetween(x, 60, x, FLOOR_Y);
    }
    g.lineBetween(0, 60, SCENE_WIDTH, 60);

    // Spotlight pools
    const light = this.add.graphics();
    light.fillStyle(0xf2b33d, 0.06);
    light.fillEllipse(SCENE_WIDTH / 2, FLOOR_Y, 760, 220);
    light.fillStyle(0xf2b33d, 0.05);
    light.fillEllipse(SCENE_WIDTH / 2, 90, 500, 160);

    // Hanging dojo banner
    const bannerX = SCENE_WIDTH / 2;
    g.fillStyle(0xe6392b, 1);
    g.fillRect(bannerX - 50, 70, 100, 150);
    g.fillStyle(0x100b06, 1);
    g.fillTriangle(bannerX - 50, 220, bannerX + 50, 220, bannerX, 250);
    this.add
      .text(bannerX, 130, '拳', { fontSize: '56px', color: '#f5efe6' })
      .setOrigin(0.5);

    // Wooden floor
    g.fillStyle(0x6e4a2a, 1);
    g.fillRect(0, FLOOR_Y, SCENE_WIDTH, SCENE_HEIGHT - FLOOR_Y);
    g.fillStyle(0x5d3d21, 1);
    for (let x = 0; x < SCENE_WIDTH; x += 80) {
      g.fillRect(x, FLOOR_Y, 40, SCENE_HEIGHT - FLOOR_Y);
    }
    g.lineStyle(4, 0x3c2613, 1);
    g.lineBetween(0, FLOOR_Y, SCENE_WIDTH, FLOOR_Y);

    // Center line marker
    g.lineStyle(2, 0xf2b33d, 0.35);
    g.lineBetween(SCENE_WIDTH / 2, FLOOR_Y + 6, SCENE_WIDTH / 2, SCENE_HEIGHT - 8);
  }
}

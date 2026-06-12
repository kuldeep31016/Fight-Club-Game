import Phaser from 'phaser';
import type { FighterState } from '@fightcam/shared';

export interface FighterPalette {
  trunks: number;
  gloves: number;
  skin: number;
  band: number;
}

export const PALETTES: Record<0 | 1, FighterPalette> = {
  0: { trunks: 0xe6392b, gloves: 0xb3271c, skin: 0xf0c08c, band: 0xf2b33d }, // red corner
  1: { trunks: 0x3e7cb1, gloves: 0x2b5d8a, skin: 0xc98a5b, band: 0xf5efe6 }, // blue corner
};

/**
 * A cartoon boxer drawn entirely from Phaser primitives — original art, no
 * external or copyrighted assets. The container origin is at the fighter's
 * feet so positioning maps directly to the arena floor.
 */
export class Fighter extends Phaser.GameObjects.Container {
  readonly playerId: string;
  facing: 1 | -1;

  private torso: Phaser.GameObjects.Rectangle;
  private trunks: Phaser.GameObjects.Rectangle;
  private head: Phaser.GameObjects.Arc;
  private band: Phaser.GameObjects.Rectangle;
  private eyeL: Phaser.GameObjects.Arc;
  private eyeR: Phaser.GameObjects.Arc;
  private frontGlove: Phaser.GameObjects.Arc;
  private rearGlove: Phaser.GameObjects.Arc;
  private legL: Phaser.GameObjects.Rectangle;
  private legR: Phaser.GameObjects.Rectangle;
  private shadow: Phaser.GameObjects.Ellipse;
  private flash: Phaser.GameObjects.Arc;
  private nameTag: Phaser.GameObjects.Text;

  private body_: Phaser.GameObjects.Container; // everything that bobs/falls
  targetX: number;
  private walking = false;
  private wasPunching = false;
  private wasKo = false;
  private bobTime = Math.random() * 10;

  constructor(
    scene: Phaser.Scene,
    playerId: string,
    nickname: string,
    slot: 0 | 1,
    x: number,
    y: number,
  ) {
    super(scene, x, y);
    this.playerId = playerId;
    this.facing = slot === 0 ? 1 : -1;
    this.targetX = x;
    const p = PALETTES[slot];

    this.shadow = scene.add.ellipse(0, 4, 110, 22, 0x000000, 0.35);

    this.body_ = scene.add.container(0, 0);

    this.legL = scene.add.rectangle(-14, -28, 16, 56, 0x2a2118).setOrigin(0.5, 0);
    this.legR = scene.add.rectangle(14, -28, 16, 56, 0x2a2118).setOrigin(0.5, 0);

    this.trunks = scene.add.rectangle(0, -76, 58, 34, p.trunks).setOrigin(0.5, 0);
    this.torso = scene.add.rectangle(0, -132, 62, 58, p.skin).setOrigin(0.5, 0);

    this.head = scene.add.circle(0, -156, 26, p.skin);
    this.band = scene.add.rectangle(0, -166, 52, 9, p.band);
    this.eyeL = scene.add.circle(this.facing * 8 - 6, -160, 3.2, 0x1c1410);
    this.eyeR = scene.add.circle(this.facing * 8 + 6, -160, 3.2, 0x1c1410);

    this.rearGlove = scene.add.circle(-this.facing * 26, -118, 17, p.gloves);
    this.frontGlove = scene.add.circle(this.facing * 34, -110, 19, p.gloves);

    this.flash = scene.add.circle(0, -110, 70, 0xff3322, 0).setBlendMode(Phaser.BlendModes.ADD);

    this.body_.add([
      this.legL,
      this.legR,
      this.trunks,
      this.torso,
      this.rearGlove,
      this.head,
      this.band,
      this.eyeL,
      this.eyeR,
      this.frontGlove,
      this.flash,
    ]);

    this.nameTag = scene.add
      .text(0, -208, nickname.toUpperCase(), {
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: '15px',
        color: '#f5efe6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add([this.shadow, this.body_, this.nameTag]);
    scene.add.existing(this);
  }

  /** Applies the latest authoritative state from the server. */
  applyState(state: FighterState): void {
    this.targetX = state.x;
    this.walking = Math.abs(this.targetX - this.x) > 2;

    if (state.punching && !this.wasPunching) this.playPunch();
    this.wasPunching = state.punching;

    if (state.ko && !this.wasKo) this.playKO();
    if (!state.ko && this.wasKo) this.resetPose();
    this.wasKo = state.ko;
  }

  /** Frame update: interpolate toward the server position + idle bob. */
  tick(dtMs: number): void {
    const dt = dtMs / 1000;
    this.x += (this.targetX - this.x) * Math.min(1, dt * 14);

    if (this.wasKo) return;

    this.bobTime += dt * (this.walking ? 11 : 4);
    const bob = Math.sin(this.bobTime) * (this.walking ? 4 : 2);
    this.body_.y = bob;
    this.body_.angle = this.walking ? Math.sin(this.bobTime) * 2.5 : 0;
  }

  playPunch(): void {
    const ext = this.facing * 88;
    this.scene.tweens.add({
      targets: this.frontGlove,
      x: ext,
      y: -118,
      scale: 1.25,
      duration: 90,
      ease: 'Cubic.easeOut',
      yoyo: true,
      onYoyo: () => this.frontGlove.setScale(1),
    });
    this.scene.tweens.add({
      targets: this.body_,
      angle: this.facing * 6,
      duration: 90,
      yoyo: true,
    });
  }

  playHit(): void {
    this.scene.tweens.add({
      targets: this.flash,
      fillAlpha: { from: 0.7, to: 0 },
      duration: 260,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.body_,
      x: { from: -this.facing * 10, to: 0 },
      duration: 200,
      ease: 'Bounce.easeOut',
    });
  }

  playKO(): void {
    this.scene.tweens.add({
      targets: this.body_,
      angle: -this.facing * 88,
      y: -8,
      duration: 550,
      ease: 'Bounce.easeOut',
    });
    this.eyeL.setScale(1.6);
    this.eyeR.setScale(1.6);
  }

  resetPose(): void {
    this.scene.tweens.killTweensOf(this.body_);
    this.scene.tweens.killTweensOf(this.frontGlove);
    this.body_.setAngle(0);
    this.body_.y = 0;
    this.body_.x = 0;
    this.frontGlove.setPosition(this.facing * 34, -110).setScale(1);
    this.eyeL.setScale(1);
    this.eyeR.setScale(1);
    this.flash.fillAlpha = 0;
  }
}

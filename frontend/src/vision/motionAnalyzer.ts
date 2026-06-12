import { MOTION, type MovementAction } from '@fightcam/shared';
import type { CalibrationResult, KeypointMap } from '../types';

interface WristSample {
  x: number;
  y: number;
  t: number;
}

export interface MotionFrame {
  punched: boolean;
  movement: MovementAction;
  movementChanged: boolean;
}

const HISTORY_MS = 350;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Converts raw pose keypoints into game actions.
 *
 * PUNCH — a wrist must simultaneously:
 *   1. move fast (speed normalized by shoulder width, so it is distance-from-
 *      camera invariant),
 *   2. be extended well away from its own shoulder (filters out face
 *      scratching and small gestures),
 *   3. respect a client-side cooldown (the server enforces its own too).
 *
 * MOVEMENT — body depth is estimated from apparent shoulder width relative
 * to the calibration baseline. The ratio is EMA-smoothed and passed through
 * a hysteresis band so the fighter does not jitter between states.
 */
export class MotionAnalyzer {
  private baseline: CalibrationResult;
  private wristHistory: Record<'left_wrist' | 'right_wrist', WristSample[]> = {
    left_wrist: [],
    right_wrist: [],
  };
  private smoothedWidth: number;
  private movement: MovementAction = 'IDLE';
  private lastPunchAt = 0;

  constructor(baseline: CalibrationResult) {
    this.baseline = baseline;
    this.smoothedWidth = baseline.shoulderWidth;
  }

  update(kp: KeypointMap, t: number): MotionFrame {
    const punched = this.detectPunch(kp, t);
    const { movement, movementChanged } = this.detectMovement(kp);
    return { punched, movement, movementChanged };
  }

  /* ----------------------------- Punch ------------------------------ */

  private detectPunch(kp: KeypointMap, t: number): boolean {
    const ls = kp['left_shoulder'];
    const rs = kp['right_shoulder'];
    if (!ls || !rs || ls.score < MOTION.MIN_KEYPOINT_SCORE || rs.score < MOTION.MIN_KEYPOINT_SCORE) {
      return false;
    }
    const shoulderWidth = Math.max(20, dist(ls.x, ls.y, rs.x, rs.y));

    if (t - this.lastPunchAt < MOTION.PUNCH_CLIENT_COOLDOWN_MS) {
      this.pushHistory(kp, t);
      return false;
    }

    let punched = false;
    for (const side of ['left_wrist', 'right_wrist'] as const) {
      const wrist = kp[side];
      const shoulder = side === 'left_wrist' ? ls : rs;
      if (!wrist || wrist.score < MOTION.MIN_KEYPOINT_SCORE) continue;

      const history = this.wristHistory[side];
      // Compare against a sample ~100-200ms old for a stable velocity estimate.
      const ref = history.find((s) => t - s.t >= 100 && t - s.t <= 260);
      if (ref) {
        const dt = (t - ref.t) / 1000;
        const speed = dist(wrist.x, wrist.y, ref.x, ref.y) / dt / shoulderWidth;
        const extension = dist(wrist.x, wrist.y, shoulder.x, shoulder.y) / shoulderWidth;

        if (speed >= MOTION.PUNCH_SPEED_THRESHOLD && extension >= MOTION.PUNCH_EXTENSION_THRESHOLD) {
          punched = true;
          this.lastPunchAt = t;
          break;
        }
      }
    }

    this.pushHistory(kp, t);
    return punched;
  }

  private pushHistory(kp: KeypointMap, t: number): void {
    for (const side of ['left_wrist', 'right_wrist'] as const) {
      const wrist = kp[side];
      const history = this.wristHistory[side];
      if (wrist && wrist.score >= MOTION.MIN_KEYPOINT_SCORE) {
        history.push({ x: wrist.x, y: wrist.y, t });
      }
      while (history.length > 0 && t - history[0].t > HISTORY_MS) history.shift();
    }
  }

  /* ---------------------------- Movement ---------------------------- */

  private detectMovement(kp: KeypointMap): { movement: MovementAction; movementChanged: boolean } {
    const ls = kp['left_shoulder'];
    const rs = kp['right_shoulder'];
    if (!ls || !rs || ls.score < MOTION.MIN_KEYPOINT_SCORE || rs.score < MOTION.MIN_KEYPOINT_SCORE) {
      // Lost tracking: fail safe to IDLE so the fighter never runs away.
      return this.transition('IDLE');
    }

    const width = dist(ls.x, ls.y, rs.x, rs.y);
    this.smoothedWidth =
      this.smoothedWidth * (1 - MOTION.SMOOTHING_ALPHA) + width * MOTION.SMOOTHING_ALPHA;

    const ratio = this.smoothedWidth / this.baseline.shoulderWidth;

    // Hysteresis: harder to enter a state than to stay in it.
    let next: MovementAction = this.movement;
    switch (this.movement) {
      case 'IDLE':
        if (ratio >= MOTION.FORWARD_ENTER_RATIO) next = 'MOVE_FORWARD';
        else if (ratio <= MOTION.BACKWARD_ENTER_RATIO) next = 'MOVE_BACKWARD';
        break;
      case 'MOVE_FORWARD':
        if (ratio < MOTION.FORWARD_EXIT_RATIO) next = 'IDLE';
        break;
      case 'MOVE_BACKWARD':
        if (ratio > MOTION.BACKWARD_EXIT_RATIO) next = 'IDLE';
        break;
    }
    return this.transition(next);
  }

  private transition(next: MovementAction): { movement: MovementAction; movementChanged: boolean } {
    const changed = next !== this.movement;
    this.movement = next;
    return { movement: next, movementChanged: changed };
  }
}

/* -------------------------------------------------------------------- */
/* Calibration                                                           */
/* -------------------------------------------------------------------- */

const REQUIRED_KEYPOINTS = [
  'nose',
  'left_shoulder',
  'right_shoulder',
  'left_hip',
  'right_hip',
  'left_wrist',
  'right_wrist',
] as const;

/**
 * Collects valid frames while the player stands naturally and produces the
 * baseline used for depth estimation. A frame only counts when the whole
 * upper body (nose, shoulders, hips, wrists) is confidently visible.
 */
export class CalibrationCollector {
  private widths: number[] = [];
  private centersX: number[] = [];
  private centersY: number[] = [];

  /** Returns progress in [0, 1]. */
  addFrame(kp: KeypointMap): number {
    const visible = REQUIRED_KEYPOINTS.every(
      (name) => (kp[name]?.score ?? 0) >= MOTION.MIN_KEYPOINT_SCORE,
    );
    if (visible) {
      const ls = kp['left_shoulder']!;
      const rs = kp['right_shoulder']!;
      const lh = kp['left_hip']!;
      const rh = kp['right_hip']!;
      this.widths.push(dist(ls.x, ls.y, rs.x, rs.y));
      this.centersX.push((ls.x + rs.x + lh.x + rh.x) / 4);
      this.centersY.push((ls.y + rs.y + lh.y + rh.y) / 4);
    }
    return Math.min(1, this.widths.length / MOTION.CALIBRATION_FRAMES);
  }

  isComplete(): boolean {
    return this.widths.length >= MOTION.CALIBRATION_FRAMES;
  }

  result(): CalibrationResult {
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    return {
      shoulderWidth: avg(this.widths),
      centerX: avg(this.centersX),
      centerY: avg(this.centersY),
    };
  }

  reset(): void {
    this.widths = [];
    this.centersX = [];
    this.centersY = [];
  }
}

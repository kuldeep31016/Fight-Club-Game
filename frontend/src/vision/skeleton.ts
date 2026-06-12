import { MOTION } from '@fightcam/shared';
import type { KeypointMap } from '../types';

/** Bone pairs for the MoveNet keypoint set. */
const BONES: Array<[string, string]> = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

/**
 * Draws the pose skeleton on top of a (mirrored) video canvas.
 * `scale` maps native video pixels to canvas pixels; `width` is the canvas
 * width used to mirror x so the overlay matches the mirrored video.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: KeypointMap,
  scale: number,
  width: number,
): void {
  const mx = (x: number) => width - x * scale;
  const my = (y: number) => y * scale;

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(242, 179, 61, 0.9)';
  ctx.fillStyle = 'rgba(230, 57, 43, 0.95)';

  for (const [a, b] of BONES) {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ka || !kb) continue;
    if (ka.score < MOTION.MIN_KEYPOINT_SCORE || kb.score < MOTION.MIN_KEYPOINT_SCORE) continue;
    ctx.beginPath();
    ctx.moveTo(mx(ka.x), my(ka.y));
    ctx.lineTo(mx(kb.x), my(kb.y));
    ctx.stroke();
  }

  for (const kp of Object.values(keypoints)) {
    if (!kp || kp.score < MOTION.MIN_KEYPOINT_SCORE) continue;
    ctx.beginPath();
    ctx.arc(mx(kp.x), my(kp.y), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

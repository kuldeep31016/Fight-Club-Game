import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { MOTION } from '@fightcam/shared';
import type { Keypoint, KeypointMap } from '../types';

export type PoseListener = (keypoints: KeypointMap, timestamp: number) => void;

export const VIDEO_WIDTH = 640;
export const VIDEO_HEIGHT = 480;

/**
 * Singleton that owns the webcam stream, the MoveNet detector and the
 * detection loop. It stays alive across screen changes (calibration ->
 * game) so the camera and model never reload mid-flow.
 *
 * Raw landmarks NEVER leave this module towards the network — listeners
 * derive compact actions (PUNCH / MOVE_FORWARD / ...) and only those are
 * sent to the server.
 */
class PoseEngine {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private detector: poseDetection.PoseDetector | null = null;
  private listeners = new Set<PoseListener>();
  private running = false;
  private rafId = 0;
  private lastInferenceAt = 0;
  latestKeypoints: KeypointMap = {};

  isRunning(): boolean {
    return this.running;
  }

  getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  /** Requests the webcam and loads MoveNet. Throws a friendly Error on failure. */
  async start(): Promise<void> {
    if (this.running) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support webcam access. Try Chrome, Edge or Firefox.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === 'NotAllowedError') {
        throw new Error('Camera permission denied. Allow camera access in your browser and retry.');
      }
      if (e?.name === 'NotFoundError') {
        throw new Error('No camera found. Plug in a webcam and retry.');
      }
      throw new Error('Could not start the camera. Close other apps using it and retry.');
    }

    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    await tf.setBackend('webgl');
    await tf.ready();

    this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    });

    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.detector?.dispose();
    this.detector = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
    this.latestKeypoints = {};
  }

  onPose(listener: PoseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The loop runs on requestAnimationFrame but inference is throttled to
   * MOTION.POSE_FPS — pose estimation is the most expensive thing on the
   * page and 20 Hz is plenty for punch/step detection.
   */
  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    if (now - this.lastInferenceAt < 1000 / MOTION.POSE_FPS) return;
    this.lastInferenceAt = now;
    void this.infer(now);
  };

  private async infer(timestamp: number): Promise<void> {
    if (!this.detector || !this.video || this.video.readyState < 2) return;
    try {
      const poses = await this.detector.estimatePoses(this.video, {
        maxPoses: 1,
        flipHorizontal: false,
      });
      const pose = poses[0];
      if (!pose) return;

      const map: KeypointMap = {};
      for (const kp of pose.keypoints) {
        if (!kp.name) continue;
        map[kp.name] = {
          x: kp.x,
          y: kp.y,
          score: kp.score ?? 0,
          name: kp.name,
        } satisfies Keypoint;
      }
      this.latestKeypoints = map;
      this.listeners.forEach((l) => l(map, timestamp));
    } catch {
      // A single failed inference is not fatal; the next frame retries.
    }
  }
}

export const poseEngine = new PoseEngine();

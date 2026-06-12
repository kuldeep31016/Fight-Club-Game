// Stub used to satisfy optional imports from @tensorflow-models/pose-detection
// (@mediapipe/pose and the WebGPU backend). FightCam runs MoveNet on the WebGL
// backend, so these symbols are never read at runtime — exporting inert
// placeholders lets esbuild/rollup resolve the static imports without bundling
// packages we deliberately don't install.

// @mediapipe/pose
export const Pose = undefined;

// @tensorflow/tfjs-backend-webgpu
export const webgpu_util = undefined;
export const WebGPUBackend = undefined;

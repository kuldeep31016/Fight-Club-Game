/**
 * All gameplay tuning lives here. The server is authoritative, but the
 * client imports the same values so rendering (arena size, ranges)
 * always matches the simulation.
 */
export const GAME = {
  /** Logical arena coordinates. The client maps these to pixels. */
  ARENA_WIDTH: 1000,
  ARENA_MIN_X: 110,
  ARENA_MAX_X: 890,
  SPAWN_P1_X: 330,
  SPAWN_P2_X: 670,

  /** Movement */
  MOVE_SPEED: 230, // arena units per second
  MIN_GAP: 95, // fighters can never overlap closer than this

  /** Combat */
  MAX_HEALTH: 3,
  PUNCH_RANGE: 175, // max distance between fighters for a punch to land
  PUNCH_COOLDOWN_MS: 500,
  PUNCH_ACTIVE_MS: 220, // window during which the punch animation is "live"
  HIT_STUN_MS: 600, // hit player cannot move or punch during stun
  KNOCKBACK: 55,

  /** Simulation */
  TICK_RATE: 20, // server ticks per second
  SNAPSHOT_RATE: 15, // state broadcasts per second

  /** Flow */
  COUNTDOWN_SECONDS: 3,
  RECONNECT_GRACE_MS: 10_000,
  ROOM_IDLE_TTL_MS: 10 * 60 * 1000,

  /** Lobby */
  ROOM_CODE_LENGTH: 6,
  MAX_NICKNAME_LENGTH: 16,
} as const;

/** Client-side motion detection tuning (kept here so it is documented in one place). */
export const MOTION = {
  POSE_FPS: 20, // pose estimations per second
  MIN_KEYPOINT_SCORE: 0.3,
  /** Punch: wrist speed in shoulder-widths per second */
  PUNCH_SPEED_THRESHOLD: 3.6,
  /** Punch: wrist must extend this many shoulder-widths from its shoulder */
  PUNCH_EXTENSION_THRESHOLD: 0.95,
  PUNCH_CLIENT_COOLDOWN_MS: 500,
  /** Depth movement: smoothed shoulder-width ratio vs calibration baseline */
  FORWARD_ENTER_RATIO: 1.12,
  FORWARD_EXIT_RATIO: 1.07,
  BACKWARD_ENTER_RATIO: 0.88,
  BACKWARD_EXIT_RATIO: 0.93,
  SMOOTHING_ALPHA: 0.25, // EMA factor for shoulder-width smoothing
  CALIBRATION_FRAMES: 40, // ~2 seconds of valid frames
} as const;

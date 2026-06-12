import type {
  GameSnapshot,
  LobbyState,
  MatchEndPayload,
} from '@fightcam/shared';

/** Which top-level screen the app is showing. */
export type Screen = 'MENU' | 'LOBBY' | 'CALIBRATION' | 'GAME';

/** A single pose keypoint in video pixel space. */
export interface Keypoint {
  x: number;
  y: number;
  score: number;
  name: string;
}

export type KeypointMap = Partial<Record<string, Keypoint>>;

export interface CalibrationResult {
  shoulderWidth: number;
  centerX: number;
  centerY: number;
}

export interface RoomClientState {
  screen: Screen;
  socketConnected: boolean;
  nickname: string;
  playerId: string | null;
  roomCode: string | null;
  slot: 0 | 1 | null;
  lobby: LobbyState | null;
  countdown: number | null;
  snapshot: GameSnapshot | null;
  matchResult: MatchEndPayload | null;
  pausedBy: string | null;
  error: string | null;
  rejoining: boolean;
}

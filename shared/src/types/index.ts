/** Movement intents derived on the client from pose depth changes. */
export type MovementAction = 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'IDLE';

/** Lifecycle of a room. */
export type RoomPhase =
  | 'LOBBY'
  | 'CALIBRATION'
  | 'COUNTDOWN'
  | 'FIGHTING'
  | 'PAUSED'
  | 'ENDED';

export interface PlayerInfo {
  id: string;
  nickname: string;
  /** 0 = left fighter, 1 = right fighter */
  slot: 0 | 1;
  connected: boolean;
  ready: boolean;
  calibrated: boolean;
}

export interface LobbyState {
  roomCode: string;
  phase: RoomPhase;
  players: PlayerInfo[];
}

export interface FighterState {
  id: string;
  nickname: string;
  slot: 0 | 1;
  x: number;
  facing: 1 | -1;
  health: number;
  punching: boolean;
  stunned: boolean;
  ko: boolean;
}

export interface GameSnapshot {
  phase: RoomPhase;
  fighters: FighterState[];
  serverTime: number;
}

export interface CreateRoomPayload {
  nickname: string;
}

export interface JoinRoomPayload {
  nickname: string;
  roomCode: string;
}

export interface RejoinRoomPayload {
  playerId: string;
  roomCode: string;
}

export interface RoomJoinedPayload {
  roomCode: string;
  playerId: string;
  slot: 0 | 1;
  lobby: LobbyState;
}

export interface RoomErrorPayload {
  code:
    | 'ROOM_NOT_FOUND'
    | 'ROOM_FULL'
    | 'INVALID_NICKNAME'
    | 'MATCH_IN_PROGRESS'
    | 'UNKNOWN';
  message: string;
}

export interface MovementUpdatePayload {
  action: MovementAction;
}

export interface PunchThrownPayload {
  playerId: string;
  landed: boolean;
}

export interface PlayerHitPayload {
  attackerId: string;
  victimId: string;
  victimHealth: number;
}

export interface HealthUpdatePayload {
  health: Record<string, number>;
}

export interface MatchCountdownPayload {
  secondsLeft: number;
}

export interface MatchEndPayload {
  winnerId: string;
  winnerNickname: string;
  loserId: string;
  loserNickname: string;
  reason: 'KO' | 'DISCONNECT' | 'FORFEIT';
}

export interface PlayerPresencePayload {
  playerId: string;
  nickname: string;
}

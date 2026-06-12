/**
 * Single source of truth for every Socket.IO event name used by FightCam.
 * Both the client and the server import from here, so a typo can never
 * silently break the protocol.
 */
export const EVENTS = {
  // client -> server
  CREATE_ROOM: 'create-room',
  JOIN_ROOM: 'join-room',
  REJOIN_ROOM: 'rejoin-room',
  PLAYER_READY: 'player-ready',
  CALIBRATION_COMPLETE: 'calibration-complete',
  MOVEMENT_UPDATE: 'movement-update',
  PUNCH: 'punch',
  PLAY_AGAIN: 'play-again',
  RETURN_TO_LOBBY: 'return-to-lobby',
  LEAVE_ROOM: 'leave-room',

  // server -> client
  ROOM_CREATED: 'room-created',
  ROOM_JOINED: 'room-joined',
  ROOM_ERROR: 'room-error',
  LOBBY_UPDATE: 'lobby-update',
  CALIBRATION_PHASE: 'calibration-phase',
  MATCH_COUNTDOWN: 'match-countdown',
  MATCH_START: 'match-start',
  STATE_UPDATE: 'state-update',
  PUNCH_THROWN: 'punch-thrown',
  PLAYER_HIT: 'player-hit',
  HEALTH_UPDATE: 'health-update',
  MATCH_END: 'match-end',
  MATCH_PAUSED: 'match-paused',
  MATCH_RESUMED: 'match-resumed',
  PLAYER_DISCONNECTED: 'player-disconnected',
  PLAYER_RECONNECTED: 'player-reconnected',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

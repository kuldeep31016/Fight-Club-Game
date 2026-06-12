import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import {
  EVENTS,
  type GameSnapshot,
  type LobbyState,
  type MatchCountdownPayload,
  type MatchEndPayload,
  type MovementAction,
  type PlayerHitPayload,
  type PlayerPresencePayload,
  type PunchThrownPayload,
  type RoomErrorPayload,
  type RoomJoinedPayload,
} from '@fightcam/shared';
import { getSocket } from '../network/socket';
import { gameBus } from '../network/bus';
import type { RoomClientState, Screen } from '../types';

const SESSION_KEY = 'fightcam.session';

interface StoredSession {
  playerId: string;
  roomCode: string;
  nickname: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private-mode browsers may block sessionStorage; rejoin just won't work */
  }
}

/* ------------------------------ Reducer ------------------------------- */

type Action =
  | { type: 'SOCKET_CONNECTED'; connected: boolean }
  | { type: 'SET_NICKNAME'; nickname: string }
  | { type: 'JOINED'; payload: RoomJoinedPayload }
  | { type: 'LOBBY'; lobby: LobbyState }
  | { type: 'COUNTDOWN'; secondsLeft: number }
  | { type: 'MATCH_START' }
  | { type: 'SNAPSHOT'; snapshot: GameSnapshot }
  | { type: 'MATCH_END'; result: MatchEndPayload }
  | { type: 'PAUSED'; by: string }
  | { type: 'RESUMED' }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'REJOINING'; rejoining: boolean }
  | { type: 'LEFT_ROOM' };

const initialState: RoomClientState = {
  screen: 'MENU',
  socketConnected: false,
  nickname: loadSession()?.nickname ?? '',
  playerId: null,
  roomCode: null,
  slot: null,
  lobby: null,
  countdown: null,
  snapshot: null,
  matchResult: null,
  pausedBy: null,
  error: null,
  rejoining: false,
};

/** Maps a room phase + local flags to the screen the player should see. */
function screenForLobby(lobby: LobbyState, playerId: string | null, prev: Screen): Screen {
  switch (lobby.phase) {
    case 'LOBBY':
      return 'LOBBY';
    case 'CALIBRATION': {
      const me = lobby.players.find((p) => p.id === playerId);
      // Once I'm calibrated I wait on the calibration screen until the
      // countdown actually starts (phase flips to COUNTDOWN).
      return me?.calibrated ? prev : 'CALIBRATION';
    }
    case 'COUNTDOWN':
    case 'FIGHTING':
    case 'PAUSED':
    case 'ENDED':
      return 'GAME';
    default:
      return prev;
  }
}

function reducer(state: RoomClientState, action: Action): RoomClientState {
  switch (action.type) {
    case 'SOCKET_CONNECTED':
      return { ...state, socketConnected: action.connected };
    case 'SET_NICKNAME':
      return { ...state, nickname: action.nickname };
    case 'JOINED': {
      const { payload } = action;
      return {
        ...state,
        playerId: payload.playerId,
        roomCode: payload.roomCode,
        slot: payload.slot,
        lobby: payload.lobby,
        screen: screenForLobby(payload.lobby, payload.playerId, state.screen),
        matchResult: payload.lobby.phase === 'ENDED' ? state.matchResult : null,
        error: null,
        rejoining: false,
      };
    }
    case 'LOBBY': {
      const screen = screenForLobby(action.lobby, state.playerId, state.screen);
      return {
        ...state,
        lobby: action.lobby,
        screen,
        // Leaving ENDED back to LOBBY clears the previous result.
        matchResult: action.lobby.phase === 'ENDED' ? state.matchResult : null,
        countdown: action.lobby.phase === 'COUNTDOWN' ? state.countdown : null,
        pausedBy: action.lobby.phase === 'PAUSED' ? state.pausedBy : null,
      };
    }
    case 'COUNTDOWN':
      return { ...state, screen: 'GAME', countdown: action.secondsLeft, matchResult: null };
    case 'MATCH_START':
      return { ...state, screen: 'GAME', countdown: null, pausedBy: null, matchResult: null };
    case 'SNAPSHOT':
      return { ...state, snapshot: action.snapshot };
    case 'MATCH_END':
      return { ...state, matchResult: action.result, countdown: null, pausedBy: null };
    case 'PAUSED':
      return { ...state, pausedBy: action.by };
    case 'RESUMED':
      return { ...state, pausedBy: null, countdown: null };
    case 'ERROR':
      return { ...state, error: action.message, rejoining: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'REJOINING':
      return { ...state, rejoining: action.rejoining };
    case 'LEFT_ROOM':
      return {
        ...initialState,
        nickname: state.nickname,
        socketConnected: state.socketConnected,
      };
    default:
      return state;
  }
}

/* ------------------------------ Context ------------------------------- */

interface GameRoomApi {
  state: RoomClientState;
  setNickname: (nickname: string) => void;
  createRoom: () => void;
  joinRoom: (roomCode: string) => void;
  ready: () => void;
  calibrated: () => void;
  playAgain: () => void;
  returnToLobby: () => void;
  leaveRoom: () => void;
  sendPunch: () => void;
  sendMovement: (action: MovementAction) => void;
  clearError: () => void;
}

const GameRoomContext = createContext<GameRoomApi | null>(null);

export function GameRoomProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  /* Socket wiring — registered once for the app's lifetime. */
  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      dispatch({ type: 'SOCKET_CONNECTED', connected: true });
      // After any (re)connect, try to re-claim a previous seat.
      const session = loadSession();
      if (session) {
        dispatch({ type: 'REJOINING', rejoining: true });
        socket.emit(EVENTS.REJOIN_ROOM, {
          playerId: session.playerId,
          roomCode: session.roomCode,
        });
      }
    };
    const onDisconnect = () => dispatch({ type: 'SOCKET_CONNECTED', connected: false });

    const onJoined = (payload: RoomJoinedPayload) => {
      saveSession({
        playerId: payload.playerId,
        roomCode: payload.roomCode,
        nickname: loadSession()?.nickname ?? '',
      });
      dispatch({ type: 'JOINED', payload });
    };

    const onRoomError = (payload: RoomErrorPayload) => {
      // A failed rejoin of a dead room is not an error worth showing —
      // just forget the stale session and stay on the menu.
      const wasRejoin = loadSession() !== null && payload.code === 'ROOM_NOT_FOUND';
      if (payload.code === 'ROOM_NOT_FOUND') saveSession(null);
      if (wasRejoin) {
        dispatch({ type: 'REJOINING', rejoining: false });
      } else {
        dispatch({ type: 'ERROR', message: payload.message });
      }
    };

    const onLobby = (lobby: LobbyState) => dispatch({ type: 'LOBBY', lobby });
    const onCountdown = (p: MatchCountdownPayload) => {
      dispatch({ type: 'COUNTDOWN', secondsLeft: p.secondsLeft });
      gameBus.emit('countdown', p.secondsLeft);
    };
    const onMatchStart = () => {
      dispatch({ type: 'MATCH_START' });
      gameBus.emit('match-start', undefined);
    };
    const onSnapshot = (snapshot: GameSnapshot) => {
      dispatch({ type: 'SNAPSHOT', snapshot });
      gameBus.emit('snapshot', snapshot);
    };
    const onPunchThrown = (p: PunchThrownPayload) => gameBus.emit('punch-thrown', p);
    const onPlayerHit = (p: PlayerHitPayload) => gameBus.emit('player-hit', p);
    const onMatchEnd = (p: MatchEndPayload) => {
      dispatch({ type: 'MATCH_END', result: p });
      gameBus.emit('match-end', p);
    };
    const onPaused = (p: PlayerPresencePayload) => dispatch({ type: 'PAUSED', by: p.nickname });
    const onResumed = () => dispatch({ type: 'RESUMED' });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(EVENTS.ROOM_CREATED, onJoined);
    socket.on(EVENTS.ROOM_JOINED, onJoined);
    socket.on(EVENTS.ROOM_ERROR, onRoomError);
    socket.on(EVENTS.LOBBY_UPDATE, onLobby);
    socket.on(EVENTS.MATCH_COUNTDOWN, onCountdown);
    socket.on(EVENTS.MATCH_START, onMatchStart);
    socket.on(EVENTS.STATE_UPDATE, onSnapshot);
    socket.on(EVENTS.PUNCH_THROWN, onPunchThrown);
    socket.on(EVENTS.PLAYER_HIT, onPlayerHit);
    socket.on(EVENTS.MATCH_END, onMatchEnd);
    socket.on(EVENTS.MATCH_PAUSED, onPaused);
    socket.on(EVENTS.MATCH_RESUMED, onResumed);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(EVENTS.ROOM_CREATED, onJoined);
      socket.off(EVENTS.ROOM_JOINED, onJoined);
      socket.off(EVENTS.ROOM_ERROR, onRoomError);
      socket.off(EVENTS.LOBBY_UPDATE, onLobby);
      socket.off(EVENTS.MATCH_COUNTDOWN, onCountdown);
      socket.off(EVENTS.MATCH_START, onMatchStart);
      socket.off(EVENTS.STATE_UPDATE, onSnapshot);
      socket.off(EVENTS.PUNCH_THROWN, onPunchThrown);
      socket.off(EVENTS.PLAYER_HIT, onPlayerHit);
      socket.off(EVENTS.MATCH_END, onMatchEnd);
      socket.off(EVENTS.MATCH_PAUSED, onPaused);
      socket.off(EVENTS.MATCH_RESUMED, onResumed);
    };
  }, []);

  // Keep a ref so the stable callbacks below can read the latest nickname
  // without re-subscribing socket handlers.
  const stateRef = useLatest(state);

  const setNickname = useCallback((nickname: string) => {
    dispatch({ type: 'SET_NICKNAME', nickname });
    const session = loadSession();
    if (session) saveSession({ ...session, nickname });
  }, []);

  const createRoom = useCallback(() => {
    const socket = getSocket();
    saveSession(null);
    socket.emit(EVENTS.CREATE_ROOM, { nickname: stateRef.current.nickname });
  }, []);

  const joinRoom = useCallback((roomCode: string) => {
    const socket = getSocket();
    saveSession(null);
    socket.emit(EVENTS.JOIN_ROOM, {
      nickname: stateRef.current.nickname,
      roomCode,
    });
  }, []);

  const ready = useCallback(() => getSocket().emit(EVENTS.PLAYER_READY), []);
  const calibrated = useCallback(() => getSocket().emit(EVENTS.CALIBRATION_COMPLETE), []);
  const playAgain = useCallback(() => getSocket().emit(EVENTS.PLAY_AGAIN), []);
  const returnToLobby = useCallback(() => getSocket().emit(EVENTS.RETURN_TO_LOBBY), []);
  const sendPunch = useCallback(() => getSocket().emit(EVENTS.PUNCH), []);
  const sendMovement = useCallback(
    (action: MovementAction) => getSocket().emit(EVENTS.MOVEMENT_UPDATE, { action }),
    [],
  );

  const leaveRoom = useCallback(() => {
    getSocket().emit(EVENTS.LEAVE_ROOM);
    saveSession(null);
    dispatch({ type: 'LEFT_ROOM' });
  }, []);

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), []);

  // Persist nickname alongside the session for rejoin restores.
  useEffect(() => {
    const session = loadSession();
    if (session && state.nickname && session.nickname !== state.nickname) {
      saveSession({ ...session, nickname: state.nickname });
    }
  }, [state.nickname]);

  const api = useMemo<GameRoomApi>(
    () => ({
      state,
      setNickname,
      createRoom,
      joinRoom,
      ready,
      calibrated,
      playAgain,
      returnToLobby,
      leaveRoom,
      sendPunch,
      sendMovement,
      clearError,
    }),
    [
      state,
      setNickname,
      createRoom,
      joinRoom,
      ready,
      calibrated,
      playAgain,
      returnToLobby,
      leaveRoom,
      sendPunch,
      sendMovement,
      clearError,
    ],
  );

  return <GameRoomContext.Provider value={api}>{children}</GameRoomContext.Provider>;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useGameRoom(): GameRoomApi {
  const ctx = useContext(GameRoomContext);
  if (!ctx) throw new Error('useGameRoom must be used inside <GameRoomProvider>');
  return ctx;
}

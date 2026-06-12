import { useState, type FormEvent } from 'react';
import { GAME } from '@fightcam/shared';
import { useGameRoom } from '../hooks/useGameRoom';
import { audio } from '../game/audio';

/** Nickname + Create Room / Join Room entry screen. */
export function MainMenu() {
  const { state, setNickname, createRoom, joinRoom, clearError } = useGameRoom();
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'choose' | 'join'>('choose');

  const nicknameOk = state.nickname.trim().length > 0;

  const handleCreate = () => {
    if (!nicknameOk) return;
    audio.unlock();
    clearError();
    createRoom();
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!nicknameOk || code.trim().length === 0) return;
    audio.unlock();
    clearError();
    joinRoom(code.trim().toUpperCase());
  };

  return (
    <div className="screen menu">
      <header className="menu__hero">
        <p className="menu__kicker">webcam-controlled multiplayer</p>
        <h1 className="menu__title">
          FIGHT<span>CAM</span>
        </h1>
        <p className="menu__tag">Throw real punches. Step in. Step back. Last fighter standing wins.</p>
      </header>

      <div className="card menu__card">
        <label className="field">
          <span className="field__label">Your fighter name</span>
          <input
            value={state.nickname}
            maxLength={GAME.MAX_NICKNAME_LENGTH}
            placeholder="e.g. IronAkash"
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
          />
        </label>

        {mode === 'choose' ? (
          <div className="menu__actions">
            <button className="btn btn--primary" disabled={!nicknameOk || !state.socketConnected} onClick={handleCreate}>
              Create Room
            </button>
            <button
              className="btn btn--ghost"
              disabled={!nicknameOk || !state.socketConnected}
              onClick={() => setMode('join')}
            >
              Join Room
            </button>
          </div>
        ) : (
          <form className="menu__actions menu__actions--join" onSubmit={handleJoin}>
            <input
              className="menu__code-input"
              value={code}
              maxLength={GAME.ROOM_CODE_LENGTH}
              placeholder="ROOM CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoFocus
            />
            <button className="btn btn--primary" type="submit" disabled={!nicknameOk || code.trim().length === 0}>
              Join
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setMode('choose')}>
              Back
            </button>
          </form>
        )}

        {!state.socketConnected && <p className="hint hint--warn">Connecting to server…</p>}
        {state.rejoining && <p className="hint">Restoring your previous match…</p>}
        {state.error && <p className="hint hint--error">{state.error}</p>}
      </div>

      <footer className="menu__footer">
        <p>You'll need a webcam and about 2 metres of space. Best in Chrome or Edge.</p>
      </footer>
    </div>
  );
}

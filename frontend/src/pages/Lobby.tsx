import { useState } from 'react';
import { useGameRoom } from '../hooks/useGameRoom';
import { audio } from '../game/audio';

/** Room lobby: share the code, see both corners, ready up. */
export function Lobby() {
  const { state, ready, leaveRoom } = useGameRoom();
  const [copied, setCopied] = useState(false);

  const lobby = state.lobby;
  if (!lobby) return null;

  const me = lobby.players.find((p) => p.id === state.playerId);
  const slots: Array<0 | 1> = [0, 1];

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the code is still visible to copy by hand */
    }
  };

  const handleReady = () => {
    audio.unlock();
    ready();
  };

  return (
    <div className="screen lobby">
      <div className="lobby__code-block">
        <p className="lobby__code-label">Room code — send it to your opponent</p>
        <div className="lobby__code-row">
          <div className="code-tiles" aria-label={`Room code ${lobby.roomCode}`}>
            {lobby.roomCode.split('').map((ch, i) => (
              <span key={i} className="code-tiles__tile">
                {ch}
              </span>
            ))}
          </div>
          <button className="btn btn--ghost btn--small" onClick={copyCode}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="lobby__corners">
        {slots.map((slot) => {
          const player = lobby.players.find((p) => p.slot === slot);
          const isMe = player && player.id === state.playerId;
          return (
            <div key={slot} className={`corner-card corner-card--${slot === 0 ? 'red' : 'blue'}`}>
              <p className="corner-card__corner">{slot === 0 ? 'RED CORNER' : 'BLUE CORNER'}</p>
              {player ? (
                <>
                  <h2 className="corner-card__name">
                    {player.nickname}
                    {isMe && <span className="corner-card__you"> (you)</span>}
                  </h2>
                  <p className={`corner-card__status ${player.connected ? '' : 'corner-card__status--off'}`}>
                    {player.connected ? 'Connected' : 'Disconnected'}
                  </p>
                  <p className={`corner-card__ready ${player.ready ? 'corner-card__ready--yes' : ''}`}>
                    {player.ready ? 'READY' : 'Not ready'}
                  </p>
                </>
              ) : (
                <p className="corner-card__waiting">Waiting for fighter…</p>
              )}
            </div>
          );
        })}
        <div className="lobby__vs">VS</div>
      </div>

      <div className="lobby__actions">
        <button
          className="btn btn--primary btn--big"
          onClick={handleReady}
          disabled={!me || me.ready || lobby.players.length < 2}
        >
          {me?.ready ? 'Waiting for opponent…' : "I'm Ready"}
        </button>
        <button className="btn btn--ghost" onClick={leaveRoom}>
          Leave Room
        </button>
      </div>

      {lobby.players.length < 2 && (
        <p className="hint">The fight starts once both fighters have joined and pressed Ready.</p>
      )}
    </div>
  );
}

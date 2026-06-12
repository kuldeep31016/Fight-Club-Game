import { useEffect, useMemo, useRef, useState } from 'react';
import type { MovementAction } from '@fightcam/shared';
import { useGameRoom } from '../hooks/useGameRoom';
import { PhaserGame } from '../game/PhaserGame';
import { HealthHearts } from '../components/HealthHearts';
import { AudioControls } from '../components/AudioControls';
import { VideoFeed } from '../components/VideoFeed';
import { poseEngine } from '../vision/poseEngine';
import { MotionAnalyzer } from '../vision/motionAnalyzer';
import { calibrationStore } from '../vision/calibrationStore';
import { gameBus } from '../network/bus';
import { audio } from '../game/audio';

/**
 * The fight screen. Three independent bridges run alongside the Phaser
 * canvas:
 *  - VisionBridge: pose frames -> MotionAnalyzer -> PUNCH / movement events
 *  - AudioBridge:  gameBus events -> synthesized sound effects & music
 *  - HUD/overlays: countdown, FIGHT!, PAUSED, game-over — driven by state
 */
export function Game() {
  const { state } = useGameRoom();

  const fighters = state.snapshot?.fighters ?? [];
  const meFighter = fighters.find((f) => f.id === state.playerId);
  const oppFighter = fighters.find((f) => f.id !== state.playerId);

  return (
    <div className="screen game">
      <VisionBridge />
      <AudioBridge />

      <div className="game__hud">
        <div className="game__hud-side">
          <p className="game__hud-name">{meFighter?.nickname ?? state.nickname ?? 'You'}</p>
          <HealthHearts health={meFighter?.health ?? 3} align="left" />
        </div>
        <AudioControls />
        <div className="game__hud-side game__hud-side--right">
          <p className="game__hud-name">{oppFighter?.nickname ?? 'Opponent'}</p>
          <HealthHearts health={oppFighter?.health ?? 3} align="right" />
        </div>
      </div>

      <div className="game__arena">
        <PhaserGame />
        <CenterOverlay />
        <GameOverOverlay />
      </div>

      <div className="game__bottom">
        <CameraPreview />
      </div>
    </div>
  );
}

/* ------------------------- Center status text ------------------------- */

function CenterOverlay() {
  const { state } = useGameRoom();
  const [flash, setFlash] = useState<string | null>(null);

  // Show "FIGHT!" briefly when the match starts.
  useEffect(() => {
    let t = 0;
    const off = gameBus.on('match-start', () => {
      setFlash('FIGHT!');
      window.clearTimeout(t);
      t = window.setTimeout(() => setFlash(null), 900);
    });
    return () => {
      off();
      window.clearTimeout(t);
    };
  }, []);

  if (state.matchResult) return null;

  if (state.countdown !== null && state.countdown > 0) {
    return <div className="center-overlay center-overlay--count">{state.countdown}</div>;
  }
  if (flash) {
    return <div className="center-overlay center-overlay--fight">{flash}</div>;
  }
  if (state.pausedBy) {
    return (
      <div className="center-overlay center-overlay--paused">
        <p>PAUSED</p>
        <p className="center-overlay__sub">{state.pausedBy} lost connection — waiting for them to return…</p>
      </div>
    );
  }
  return null;
}

/* ---------------------------- Game over UI ---------------------------- */

function GameOverOverlay() {
  const { state, playAgain, returnToLobby, leaveRoom } = useGameRoom();
  const [rematchAsked, setRematchAsked] = useState(false);

  const result = state.matchResult;

  useEffect(() => {
    if (!result) setRematchAsked(false);
  }, [result]);

  if (!result) return null;

  const iWon = result.winnerId === state.playerId;
  const reasonLine =
    result.reason === 'KO'
      ? 'by knockout'
      : result.reason === 'DISCONNECT'
        ? 'opponent disconnected'
        : 'by forfeit';

  return (
    <div className="gameover">
      <div className={`gameover__banner ${iWon ? 'gameover__banner--win' : 'gameover__banner--lose'}`}>
        {iWon ? 'YOU WIN' : 'YOU LOSE'}
      </div>
      <p className="gameover__detail">
        <strong>{result.winnerNickname}</strong> defeats <strong>{result.loserNickname}</strong> {reasonLine}
      </p>
      <div className="gameover__actions">
        <button
          className="btn btn--primary btn--big"
          onClick={() => {
            playAgain();
            setRematchAsked(true);
          }}
          disabled={rematchAsked}
        >
          {rematchAsked ? 'Waiting for opponent…' : 'Play Again'}
        </button>
        <button className="btn btn--ghost" onClick={returnToLobby}>
          Return to Lobby
        </button>
        <button className="btn btn--ghost" onClick={leaveRoom}>
          Leave
        </button>
      </div>
    </div>
  );
}

/* ------------------------- Webcam mini preview ------------------------- */

function CameraPreview() {
  const [action, setAction] = useState('');

  useEffect(() => {
    let clear = 0;
    const off = gameBus.on('local-action', (a) => {
      setAction(a);
      window.clearTimeout(clear);
      clear = window.setTimeout(() => setAction(''), 700);
    });
    return () => {
      off();
      window.clearTimeout(clear);
    };
  }, []);

  return (
    <div className="camera-preview">
      <VideoFeed width={180} />
      {action && <div className="camera-preview__badge">{action}</div>}
    </div>
  );
}

/* -------------------- Vision -> network action bridge ------------------ */

function VisionBridge() {
  const { state, sendPunch, sendMovement } = useGameRoom();

  const fighting = state.snapshot?.phase === 'FIGHTING';
  const fightingRef = useRef(fighting);
  fightingRef.current = fighting;

  const analyzer = useMemo(() => {
    const baseline = calibrationStore.get();
    return baseline ? new MotionAnalyzer(baseline) : null;
  }, []);

  useEffect(() => {
    if (!analyzer) return;
    let lastMovement: MovementAction = 'IDLE';

    const off = poseEngine.onPose((kp, t) => {
      const frame = analyzer.update(kp, t);

      if (!fightingRef.current) return;

      if (frame.punched) {
        sendPunch();
        gameBus.emit('local-action', 'PUNCH');
      }
      if (frame.movementChanged && frame.movement !== lastMovement) {
        lastMovement = frame.movement;
        sendMovement(frame.movement);
        if (frame.movement !== 'IDLE') {
          gameBus.emit('local-action', frame.movement === 'MOVE_FORWARD' ? 'FORWARD' : 'BACK');
        }
      }
    });
    return off;
  }, [analyzer, sendPunch, sendMovement]);

  return null;
}

/* -------------------------- Audio event bridge ------------------------- */

function AudioBridge() {
  useEffect(() => {
    const offs = [
      gameBus.on('punch-thrown', () => audio.punchWhoosh()),
      gameBus.on('player-hit', () => audio.hitThud()),
      gameBus.on('countdown', (s) => audio.countdownBeep(s <= 1)),
      gameBus.on('match-start', () => audio.startMusic()),
      gameBus.on('match-end', () => {
        audio.stopMusic();
        audio.koSting();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Music must stop if the player navigates away mid-match.
  useEffect(() => () => audio.stopMusic(), []);

  return null;
}

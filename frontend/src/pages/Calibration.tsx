import { useEffect, useRef, useState } from 'react';
import { useGameRoom } from '../hooks/useGameRoom';
import { poseEngine } from '../vision/poseEngine';
import { CalibrationCollector } from '../vision/motionAnalyzer';
import { calibrationStore } from '../vision/calibrationStore';
import { VideoFeed } from '../components/VideoFeed';

type Stage = 'starting' | 'collecting' | 'done' | 'waiting' | 'error';

/**
 * Starts the camera + pose model, collects a stable baseline pose, then
 * lets the player confirm. The baseline is kept locally (calibrationStore)
 * — the server only ever hears "calibration-complete".
 */
export function Calibration() {
  const { state, calibrated, leaveRoom } = useGameRoom();
  const [stage, setStage] = useState<Stage>('starting');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const collectorRef = useRef(new CalibrationCollector());

  const me = state.lobby?.players.find((p) => p.id === state.playerId);
  const opponent = state.lobby?.players.find((p) => p.id !== state.playerId);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await poseEngine.start();
        if (!cancelled) setStage('collecting');
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStage('error');
        }
      }
    };
    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage !== 'collecting') return;
    const collector = collectorRef.current;

    const off = poseEngine.onPose((kp) => {
      const p = collector.addFrame(kp);
      setProgress(p);
      if (collector.isComplete()) {
        calibrationStore.set(collector.result());
        setStage('done');
      }
    });
    return off;
  }, [stage]);

  const retry = () => {
    collectorRef.current = new CalibrationCollector();
    setProgress(0);
    setError('');
    setStage('starting');
    poseEngine.stop();
    void poseEngine
      .start()
      .then(() => setStage('collecting'))
      .catch((err: Error) => {
        setError(err.message);
        setStage('error');
      });
  };

  const confirm = () => {
    calibrated();
    setStage('waiting');
  };

  // If I'm already marked calibrated server-side (e.g. after a rejoin),
  // show the waiting state.
  useEffect(() => {
    if (me?.calibrated && stage === 'done') setStage('waiting');
  }, [me?.calibrated, stage]);

  return (
    <div className="screen calibration">
      <h1 className="page-title">Calibration</h1>
      <p className="calibration__instruction">
        Stand about 2 metres back so your <strong>head, shoulders, hips and wrists</strong> are all in
        frame. Stand naturally and hold still.
      </p>

      <div className="calibration__stage">
        <VideoFeed width={480} />
        {stage === 'starting' && <div className="calibration__overlay">Starting camera & pose model…</div>}
        {stage === 'error' && (
          <div className="calibration__overlay calibration__overlay--error">
            <p>{error}</p>
            <button className="btn btn--primary" onClick={retry}>
              Retry
            </button>
          </div>
        )}
      </div>

      {(stage === 'collecting' || stage === 'done' || stage === 'waiting') && (
        <div className="calibration__progress">
          <div className="progress">
            <div className="progress__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          {stage === 'collecting' && <p className="hint">Hold still — reading your stance…</p>}
          {stage === 'done' && <p className="hint hint--success">Calibration successful ✔</p>}
          {stage === 'waiting' && (
            <p className="hint">
              {opponent ? `Waiting for ${opponent.nickname} to finish calibrating…` : 'Waiting for opponent…'}
            </p>
          )}
        </div>
      )}

      <div className="calibration__actions">
        <button className="btn btn--primary btn--big" onClick={confirm} disabled={stage !== 'done'}>
          {stage === 'waiting' ? 'Waiting…' : "I'm Calibrated — Fight!"}
        </button>
        <button className="btn btn--ghost" onClick={leaveRoom}>
          Leave
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { audio } from '../game/audio';

/** Mute toggle + volume slider, persisted by the audio engine. */
export function AudioControls() {
  const [muted, setMuted] = useState(audio.muted);
  const [volume, setVolume] = useState(audio.volume);

  const toggleMute = () => {
    audio.unlock();
    const next = !muted;
    audio.setMuted(next);
    setMuted(next);
  };

  const changeVolume = (v: number) => {
    audio.unlock();
    audio.setVolume(v);
    setVolume(v);
    if (muted && v > 0) {
      audio.setMuted(false);
      setMuted(false);
    }
  };

  return (
    <div className="audio-controls">
      <button
        type="button"
        className="audio-controls__mute"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '\u{1F507}' : '\u{1F50A}'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => changeVolume(Number(e.target.value))}
        aria-label="Volume"
      />
    </div>
  );
}

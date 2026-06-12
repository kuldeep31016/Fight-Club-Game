import { GAME } from '@fightcam/shared';

interface HealthHeartsProps {
  health: number;
  align?: 'left' | 'right';
}

/** ❤ ❤ ❤ display. Lost hearts stay visible but hollowed out. */
export function HealthHearts({ health, align = 'left' }: HealthHeartsProps) {
  const hearts = Array.from({ length: GAME.MAX_HEALTH }, (_, i) => i < health);
  return (
    <div className={`hearts hearts--${align}`} aria-label={`${health} health remaining`}>
      {hearts.map((alive, i) => (
        <span key={i} className={alive ? 'heart heart--alive' : 'heart heart--lost'}>
          {alive ? '\u2764' : '\u2661'}
        </span>
      ))}
    </div>
  );
}

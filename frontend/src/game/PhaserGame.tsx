import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { FightScene, SCENE_WIDTH, SCENE_HEIGHT } from './FightScene';

/**
 * Mounts a single Phaser.Game instance into a div and tears it down on
 * unmount. All game data flows in through the gameBus, so this component
 * needs no props and never re-renders the canvas.
 */
export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: SCENE_WIDTH,
      height: SCENE_HEIGHT,
      backgroundColor: '#12100e',
      scene: [FightScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: { antialias: true, pixelArt: false },
      fps: { target: 60 },
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="phaser-host" />;
}

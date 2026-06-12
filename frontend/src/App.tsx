import { useEffect } from 'react';
import { GameRoomProvider, useGameRoom } from './hooks/useGameRoom';
import { MainMenu } from './pages/MainMenu';
import { Lobby } from './pages/Lobby';
import { Calibration } from './pages/Calibration';
import { Game } from './pages/Game';
import { poseEngine } from './vision/poseEngine';

function Screens() {
  const { state } = useGameRoom();

  // Stop the camera whenever we are back on a screen that doesn't need it.
  useEffect(() => {
    if (state.screen === 'MENU' || state.screen === 'LOBBY') {
      poseEngine.stop();
    }
  }, [state.screen]);

  switch (state.screen) {
    case 'LOBBY':
      return <Lobby />;
    case 'CALIBRATION':
      return <Calibration />;
    case 'GAME':
      return <Game />;
    case 'MENU':
    default:
      return <MainMenu />;
  }
}

export default function App() {
  return (
    <GameRoomProvider>
      <Screens />
    </GameRoomProvider>
  );
}

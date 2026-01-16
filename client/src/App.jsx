import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import HostDashboard from './pages/HostDashboard';
import JoinGame from './pages/JoinGame';
import PlayerLobby from './pages/PlayerLobby';
import WaitingRoom from './pages/WaitingRoom';
import GameScreen from './pages/GameScreen';
import CreatePack from './pages/CreatePack';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import { ToastProvider } from './context/ToastContext';

function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host" element={<HostDashboard />} />
          <Route path="/host/:roomCode" element={<HostDashboard />} />
          <Route path="/join" element={<JoinGame />} />
          <Route path="/create" element={<CreatePack />} />
          <Route path="/lobby" element={<PlayerLobby />} />
          <Route path="/waiting" element={<WaitingRoom />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="/results" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;

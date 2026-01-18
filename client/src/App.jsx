import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import HostDashboard from './pages/HostDashboard';
import JoinGame from './pages/JoinGame';
import PlayerLobby from './pages/PlayerLobby';
import WaitingRoom from './pages/WaitingRoom';
import GameScreen from './pages/GameScreen';
import CreatePack from './pages/CreatePack';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import AdminDashboard from './pages/AdminDashboard';
import { ToastProvider } from './context/ToastContext';
import OnboardingModal from './components/OnboardingModal';
import socket from './socket';

import { useToast } from './context/ToastContext';

const OnboardingWrapper = ({ user, setUser }) => {
  const location = useLocation();
  const isAdminPage = location.pathname === '/admin-control-center';
  const { showToast } = useToast();

  const handleComplete = React.useCallback((userData) => {
    setUser(userData);
    showToast(`🎉 مرحبًا ${userData.nickname}!`, 'success');
    // Save to local storage
    if (userData.nickname) localStorage.setItem('quiz_nickname', userData.nickname);
    if (userData.avatar) localStorage.setItem('quiz_avatar', userData.avatar);
    if (userData.deviceId) localStorage.setItem('quiz_device_id', userData.deviceId);
  }, [setUser, showToast]);

  // If user is still null and NOT an admin page, show modal
  if (!user && !isAdminPage) {
    return <OnboardingModal onComplete={handleComplete} />;
  }
  return null;
};

function App() {
  const [user, setUser] = React.useState(() => {
    const nickname = localStorage.getItem('quiz_nickname');
    const avatar = localStorage.getItem('quiz_avatar');
    return nickname ? { nickname, avatar } : null;
  });

  React.useEffect(() => {
    // 1. Check local storage first (Already done in useState initializer)

    // 2. Device Identity Check (Server-Side Binding / Recovery)
    const deviceId = localStorage.getItem('quiz_device_id');
    const nickname = localStorage.getItem('quiz_nickname');

    // If we have a deviceId but NO local name, try to recover from server
    if (deviceId && !nickname) {
      socket.emit('validate_device', deviceId, (response) => {
        if (response && response.found) {
          console.log("✅ Identity recovered from server:", response.nickname);
          localStorage.setItem('quiz_nickname', response.nickname);
          localStorage.setItem('quiz_avatar', response.avatar);
          setUser({ nickname: response.nickname, avatar: response.avatar });
        }
      });
    }
  }, []);

  const GlobalSocketListener = () => {
    const { showToast } = useToast();

    React.useEffect(() => {
      socket.on('system_reboot', () => {
        console.log('🧨 SYSTEM REBOOT SIGNAL RECEIVED');
        localStorage.clear();
        window.location.reload();
      });

      socket.on('system_reload', () => {
        console.log('🔄 SYSTEM RELOAD SIGNAL RECEIVED');
        window.location.reload();
      });

      socket.on('system_show_toast', ({ message, type }) => {
        showToast(message, type || 'info');
      });

      return () => {
        socket.off('system_reboot');
        socket.off('system_reload');
        socket.off('system_show_toast');
      };
    }, [showToast]);

    return null;
  };

  const handleSystemReset = () => {
    if (window.confirm("⚠️ هل أنت متأكد؟ سيتم حذف اسمك وجميع بياناتك ومسح جميع الغرف النشطة! 🧨")) {
      socket.emit('system_reset_all', (response) => {
        if (response.success) {
          localStorage.clear();
          setUser(null);
          window.location.href = '/';
        }
      });
    }
  };

  return (
    <ToastProvider>
      <GlobalSocketListener />
      <div className="relative min-h-screen">
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/host" element={<HostDashboard />} />
            <Route path="/host/:roomCode" element={<PlayerLobby />} />
            <Route path="/join" element={<JoinGame />} />
            <Route path="/join/:roomCode" element={<JoinGame />} />
            <Route path="/create" element={<CreatePack />} />
            <Route path="/lobby" element={<PlayerLobby />} />
            <Route path="/waiting/:roomCode" element={<WaitingRoom />} />
            <Route path="/waiting" element={<WaitingRoom />} /> {/* Fallback for state-based nav if needed */}
            <Route path="/game" element={<GameScreen />} />
            <Route path="/results" element={<Leaderboard />} />
            <Route path="/profile" element={<Profile onSystemReset={handleSystemReset} />} />
            <Route path="/admin-control-center" element={<AdminDashboard />} />
          </Routes>
          <OnboardingWrapper user={user} setUser={setUser} />
        </Router>

        {/* Global Creator Credit */}
        <div className="fixed bottom-4 left-0 right-0 flex justify-center pointer-events-none z-[100] animate-fade-in-up delay-1000">
          <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-white/10 hover:text-blue-400/30 transition-colors pointer-events-auto cursor-default">
            by Said Elgendy
          </span>
        </div>
      </div>
    </ToastProvider>
  );
}

export default App;

import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import HostDashboard from './pages/HostDashboard';
import JoinGame from './pages/JoinGame';
import WaitingRoom from './pages/WaitingRoom';
import GameScreen from './pages/GameScreen';
import CreatePack from './pages/CreatePack';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import GlobalLeaderboard from './pages/GlobalLeaderboard';
import AdminDashboard from './pages/AdminDashboard';
import { ToastProvider } from './context/ToastContext';
import OnboardingModal from './components/OnboardingModal';
import { supabase } from './supabaseClient';
import realtime from './realtime';
import { useToast } from './context/ToastContext';
import { getPersistentDeviceId, registerOrUpdatePlayer } from './utils/userAuth';
import './App.css';

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
    const deviceId = getPersistentDeviceId();
    const nickname = localStorage.getItem('quiz_nickname');

    const recoverIdentity = async () => {
      if (!deviceId) return;

      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (data) {
        localStorage.setItem('quiz_nickname', data.nickname);
        localStorage.setItem('quiz_avatar', data.avatar);
        setUser({ nickname: data.nickname, avatar: data.avatar });
      } else if (error) {
        console.error("Identity recovery error:", error);
      } else if (nickname) {
        try {
          const result = await registerOrUpdatePlayer(supabase, {
            device_id: deviceId,
            nickname: nickname,
            avatar: localStorage.getItem('quiz_avatar') || '🦊',
            last_seen: new Date().toISOString()
          }, { autoHandleConflict: true });

          if (result.error) {
            console.error("Failed to sync identity:", result.error);
          } else if (result.isRenamed) {
            localStorage.setItem('quiz_nickname', result.newNickname);
            setUser(prev => ({ ...prev, nickname: result.newNickname }));
          }
        } catch (err) {
          console.error("Identity sync exception:", err);
        }
      }

      realtime.joinSystemChannel({ deviceId });
    };

    recoverIdentity();
  }, []);

  const GlobalSocketListener = () => {
    const { showToast } = useToast();

    React.useEffect(() => {
      realtime.on('admin_force_refresh', () => {
        window.location.reload();
      });

      realtime.on('admin_broadcast', ({ message }) => {
        showToast(message, 'info');
      });

      realtime.on('admin_maintenance', ({ enabled }) => {
        showToast(enabled ? "🛠️ دخل النظام في وضع الصيانة" : "✅ انتهت فترة الصيانة", enabled ? 'warning' : 'success');
      });


      return () => {
        realtime.off('admin_force_refresh');
        realtime.off('admin_broadcast');
        realtime.off('admin_maintenance');
      };
    }, [showToast]);

    return null;
  };

  const handleSystemReset = () => {
    if (window.confirm("⚠️ هل أنت متأكد؟ سيتم حذف جميع بياناتك المحلية!")) {
      localStorage.clear();
      setUser(null);
      window.location.href = '/';
    }
  };

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-3xl max-w-md animate-fade-in">
          <div className="text-5xl mb-6">⚠️</div>
          <h1 className="text-2xl font-black mb-4">خطأ في الإعداد (Configuration Error)</h1>
          <p className="text-gray-400 mb-6 leading-relaxed">
            يبدو أن متغيرات البيئة الخاصة بـ Supabase مفقودة.
            <br />
            يرجى إضافة <code className="text-blue-400 font-mono">VITE_SUPABASE_URL</code> و <code className="text-blue-400 font-mono">VITE_SUPABASE_ANON_KEY</code> في إعدادات Cloudflare Pages.
          </p>
          <div className="text-xs text-gray-600 font-mono bg-black/40 p-3 rounded-xl break-all">
            Reference: supabaseClient.js: null
          </div>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <GlobalSocketListener />
      <div className="relative min-h-screen">
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/host" element={<HostDashboard />} />
            <Route path="/join" element={<JoinGame />} />
            <Route path="/join/:roomCode" element={<JoinGame />} />
            <Route path="/create" element={<CreatePack />} />
            <Route path="/waiting/:roomCode" element={<WaitingRoom />} />
            <Route path="/waiting" element={<WaitingRoom />} />
            <Route path="/game" element={<GameScreen />} />
            <Route path="/results" element={<Leaderboard />} />
            <Route path="/leaderboard" element={<GlobalLeaderboard />} />
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

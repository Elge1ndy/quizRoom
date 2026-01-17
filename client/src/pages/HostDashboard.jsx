import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socket from '../socket';
import { getPersistentUserId, getPersistentDeviceId } from '../utils/userAuth';
import PackSelection from '../components/PackSelection';
import { useToast } from '../context/ToastContext';
import SoundManager from '../utils/SoundManager';

const HostDashboard = () => {
    const navigate = useNavigate();
    const { roomCode: paramRoomCode } = useParams();

    const [roomCode, setRoomCode] = React.useState(paramRoomCode || null);
    const [isCreating, setIsCreating] = React.useState(false);
    const [players, setPlayers] = React.useState([]);

    // UI State
    const { showToast } = useToast();
    const [countdown, setCountdown] = React.useState(null); // 3, 2, 1, null

    // Packs State
    const [packs, setPacks] = React.useState([]);
    const [selectedPack, setSelectedPack] = React.useState(null);

    const [gameSettings, setGameSettings] = React.useState({
        timeLimit: 30,
        questionCount: 10
    });

    // Host Profile State
    const [nickname] = React.useState(localStorage.getItem('quiz_nickname') || 'Host');
    const [avatar] = React.useState(localStorage.getItem('quiz_avatar') || '👑');

    const copyRoomCode = () => {
        if (roomCode) {
            navigator.clipboard.writeText(roomCode);
            showToast("تم نسخ رمز الغرفة! 📋", "success");
        }
    };

    React.useEffect(() => {
        SoundManager.init();
        // Fetch packs on mount
        socket.emit('get_packs', (availablePacks) => {
            setPacks(availablePacks);
            if (availablePacks.length > 0) {
                setSelectedPack(availablePacks[0]);
                setGameSettings(prev => ({
                    ...prev,
                    questionCount: Math.min(prev.questionCount, availablePacks[0].questionCount)
                }));
            }
        });
    }, []);

    React.useEffect(() => {
        if (roomCode) {
            const handlePlayerJoined = (updatedPlayers) => {
                // Determine who joined by diffing (simple notify for now)
                if (updatedPlayers.length > players.length) {
                    const newPlayer = updatedPlayers[updatedPlayers.length - 1];
                    showToast(`${newPlayer.nickname} انضم للغرفة! 👋`, "success");
                    SoundManager.playJoin();
                }
                setPlayers(updatedPlayers);
            };

            const handleGameStart = (firstQuestion) => {
                navigate('/game', { state: { roomCode, role: 'host', nickname: 'Host', initialQuestion: firstQuestion } });
            };

            socket.on('player_joined', handlePlayerJoined);
            socket.on('game_started', handleGameStart);

            return () => {
                socket.off('player_joined', handlePlayerJoined);
                socket.off('game_started', handleGameStart);
            };
        }
    }, [roomCode, navigate, players]); // Depend on players to diff

    const handlePackSelect = (pack) => {
        setSelectedPack(pack);
        setGameSettings(prev => ({
            ...prev,
            questionCount: Math.min(prev.questionCount, pack.questionCount)
        }));
    };

    const createRoom = () => {
        if (!selectedPack) return;

        setIsCreating(true);
        const userId = getPersistentUserId();
        const deviceId = getPersistentDeviceId();
        const finalSettings = { ...gameSettings, packId: selectedPack.id, nickname, avatar, userId, deviceId };

        setTimeout(() => {
            socket.emit('create_room', finalSettings, (response) => {
                setIsCreating(false);
                // Redirect directly to Waiting Room
                navigate(`/waiting/${response.roomCode}`, {
                    state: {
                        roomCode: response.roomCode,
                        nickname,
                        avatar,
                        userId: getPersistentUserId(),
                        isHost: true,
                        players: response.players || [],
                        isTeamMode: selectedPack?.name === 'Team Meat',
                        mode: 'pre-game',
                        // Pass pack info for immediate display
                        pack: selectedPack,
                        gameSettings: finalSettings
                    }
                });
            });
        }, 800);
    };

    const kickPlayer = (playerId) => {
        if (window.confirm("هل أنت متأكد من طرد هذا اللاعب؟")) {
            socket.emit('kick_player', { roomCode, playerId }, (response) => {
                if (response.success) {
                    showToast("تم طرد اللاعب بنجاح 🚫", "warning");
                }
            });
        }
    };

    const startGame = () => {
        // Navigate to waiting room
        navigate('/waiting', {
            state: {
                roomCode,
                nickname,
                avatar,
                userId: getPersistentUserId(),
                isHost: true,
                players,
                isTeamMode: selectedPack?.name === 'Team Meat'
            }
        });
    };

    // VIEW: LOBBY (Legacy fallback - Redirect to Waiting)
    // If roomCode exists (e.g. manually visited /host/:id), redirect to /waiting
    React.useEffect(() => {
        if (roomCode) {
            // We need to ensure we have the host credentials/state.
            // If missing, we might need to fetch room info first? 
            // For now, let's assume if they are here, they are the host (checked by logic elsewhere?)
            // Actually, better to just redirect to waiting which handles "re-sync".
            navigate(`/waiting/${roomCode}`, {
                state: {
                    roomCode,
                    nickname,
                    avatar,
                    userId: getPersistentUserId(),
                    isHost: true,
                    // We might not have 'players' or 'isTeamMode' here if accessed directly,
                    // but WaitingRoom handles reconnects via socket.emit('enter_waiting_room').
                }
            });
        }
    }, [roomCode, navigate, nickname, avatar]);

    if (roomCode) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] text-white flex items-center justify-center p-6">
                <div className="text-xl font-bold animate-pulse text-blue-500">
                    🔄 جاري توجيهك إلى غرفة الانتظار الجديدة...
                </div>
            </div>
        );
    }

    // VIEW: SETUP (Create New Party) - Kept mostly same but styled
    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white p-8 font-sans flex flex-col items-center justify-center relative">
            <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>

            <h1 className="text-4xl font-black mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 relative z-10">
                إعدادات الغرفة
            </h1>

            <div className="w-full max-w-4xl bg-gray-800/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-700 relative z-10">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-300">
                    <span>1.</span> إعدادات المضيف (Host)
                </h2>

                <div className="bg-gray-700/30 p-6 rounded-xl border border-white/5 mb-8 flex flex-col md:flex-row gap-6 items-center relative overflow-hidden">
                    {/* Locked Overlay Hint */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-lg">
                        <span className="text-[10px] text-yellow-500 font-bold">🔒 الهوية مثبتة</span>
                    </div>

                    <div className="flex-1 w-full mt-4 md:mt-0">
                        <label className="block text-gray-400 mb-2 font-bold text-sm">اسم المضيف</label>
                        <div className="w-full bg-gray-900/50 border border-gray-600/50 rounded-xl px-4 py-3 text-gray-400 font-bold cursor-not-allowed select-none">
                            {nickname}
                        </div>
                    </div>

                    <div className="flex-1 w-full">
                        <label className="block text-gray-400 mb-2 font-bold text-sm">الشخصية</label>
                        <div className="flex gap-2 pb-2 opacity-50 grayscale pointer-events-none">
                            {['👑', '🎩', '🎓', '🦄', '🐲', '🦁'].map(av => (
                                <div
                                    key={av}
                                    className={`w-12 h-12 text-2xl rounded-full border-2 flex-shrink-0 flex items-center justify-center ${avatar === av ? 'bg-blue-500/20 border-blue-500 scale-110' : 'bg-gray-800 border-gray-600'}`}
                                >
                                    {av}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-300">
                    <span>2.</span> اختر حزمة الأسئلة
                </h2>

                {/* Pack Selection */}
                <div className="mb-8 h-80 overflow-y-auto pr-2 custom-scrollbar bg-black/20 rounded-xl p-4 border border-white/5">
                    {packs.length > 0 ? (
                        <PackSelection
                            packs={packs}
                            selectedPack={selectedPack}
                            onSelectPack={handlePackSelect}
                        />
                    ) : (
                        <div className="text-center py-20 text-gray-500">جاري تحميل الحزم...</div>
                    )}
                </div>

                <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-300">
                    <span>3.</span> تخصيص اللعب
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-gray-700/30 p-4 rounded-xl border border-white/5 hover:border-blue-500/50 transition-colors">
                        <label className="block text-gray-400 mb-2 font-bold text-sm">عدد الأسئلة</label>
                        <div className="flex items-center gap-4">
                            <input
                                type="range"
                                min="1"
                                max={selectedPack ? selectedPack.questionCount : 50}
                                value={gameSettings.questionCount}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    const max = selectedPack ? selectedPack.questionCount : 50;
                                    setGameSettings({ ...gameSettings, questionCount: Math.min(val, max) });
                                }}
                                className="flex-1 accent-blue-500 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="font-mono text-xl font-bold w-12 text-center">{gameSettings.questionCount}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 text-right">Max: {selectedPack ? selectedPack.questionCount : 50}</div>
                    </div>

                    <div className="bg-gray-700/30 p-4 rounded-xl border border-white/5 hover:border-blue-500/50 transition-colors">
                        <label className="block text-gray-400 mb-2 font-bold text-sm">وقت السؤال (ثواني)</label>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setGameSettings(s => ({ ...s, timeLimit: Math.max(5, s.timeLimit - 5) }))}
                                className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-500"
                            > - </button>
                            <span className="font-mono text-xl font-bold flex-1 text-center">{gameSettings.timeLimit}s</span>
                            <button
                                onClick={() => setGameSettings(s => ({ ...s, timeLimit: Math.min(120, s.timeLimit + 5) }))}
                                className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-500"
                            > + </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={createRoom}
                        disabled={isCreating || !selectedPack}
                        className={`
                            px-12 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform flex items-center gap-3
                            ${isCreating || !selectedPack
                                ? 'bg-gray-700 cursor-not-allowed opacity-50'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 hover:shadow-blue-500/30 text-white'
                            }
                        `}
                    >
                        {isCreating ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>جاري الإنشاء...</span>
                            </>
                        ) : (
                            <>
                                <span>Create Party</span>
                                <span>→</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HostDashboard;

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import socket from '../socket';
import { getPersistentUserId } from '../utils/userAuth';
import PackSelection from '../components/PackSelection';
import { useToast } from '../context/ToastContext';
import SoundManager from '../utils/SoundManager';

const HostDashboard = () => {
    const navigate = useNavigate();
    const { roomCode: paramRoomCode } = useParams();

    const [roomCode, setRoomCode] = useState(paramRoomCode || null);
    const [isCreating, setIsCreating] = useState(false);
    const [players, setPlayers] = useState([]);

    // UI State
    const { showToast } = useToast();
    const [countdown, setCountdown] = useState(null); // 3, 2, 1, null

    // Packs State
    const [packs, setPacks] = useState([]);
    const [selectedPack, setSelectedPack] = useState(null);

    const [gameSettings, setGameSettings] = useState({
        timeLimit: 30,
        questionCount: 10
    });

    // Host Profile State
    const [nickname, setNickname] = useState('Host');
    const [avatar, setAvatar] = useState('👑');

    const copyRoomCode = () => {
        if (roomCode) {
            navigator.clipboard.writeText(roomCode);
            showToast("تم نسخ رمز الغرفة! 📋", "success");
        }
    };

    useEffect(() => {
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

    useEffect(() => {
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
        setIsCreating(true);
        const userId = getPersistentUserId();
        localStorage.setItem('quiz_nickname', nickname);
        const finalSettings = { ...gameSettings, packId: selectedPack.id, nickname, avatar, userId };

        setTimeout(() => {
            socket.emit('create_room', finalSettings, (response) => {
                setIsCreating(false);
                setRoomCode(response.roomCode);
                if (response.players) setPlayers(response.players);
                navigate(`/host/${response.roomCode}`);
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

    // VIEW: LOBBY (Creating/Waiting)
    if (roomCode) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
                {/* Background FX */}
                <div className="absolute top-0 left-0 w-full h-full bg-grid-pattern opacity-10 pointer-events-none"></div>

                {/* Toast handled by global ToastProvider */}

                {/* Countdown Overlay */}
                {countdown && (
                    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm">
                        <div className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-red-600 animate-ping">
                            {countdown}
                        </div>
                    </div>
                )}

                <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">

                    {/* LEFT: Room Info & Actions */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-gray-800/60 backdrop-blur-xl p-8 rounded-3xl border border-gray-700 shadow-2xl text-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                            <p className="text-gray-400 mb-2 uppercase tracking-widest text-xs font-bold">Room Code</p>

                            <div
                                onClick={copyRoomCode}
                                className="relative cursor-pointer group-hover:scale-105 transition-transform"
                            >
                                <div className="text-6xl font-black text-white mb-2 tracking-widest">{roomCode}</div>
                                <div className="text-xs text-blue-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                    Click to Copy 📋
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-800/60 backdrop-blur-xl p-6 rounded-3xl border border-gray-700">
                            <h3 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Pack Info</h3>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center text-2xl">
                                    {selectedPack?.icon || '📦'}
                                </div>
                                <div>
                                    <div className="font-bold text-lg">{selectedPack?.title || 'Unknown Pack'}</div>
                                    <div className="text-xs text-gray-500">{gameSettings.questionCount} Questions • {gameSettings.timeLimit}s</div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={startGame}
                            disabled={players.length < 1} // Should be 1 just for testing alone, usually 2
                            className={`w-full py-6 rounded-2xl font-black text-2xl shadow-lg transition-all transform flex items-center justify-center gap-3
                                ${players.length > 0
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02] active:scale-95 text-white shadow-blue-900/50'
                                    : 'bg-gray-800 text-gray-600 cursor-not-allowed'}
                            `}
                        >
                            <span>🚀</span>
                            <span>ابدأ اللعبة</span>
                        </button>
                        {players.length === 0 && <p className="text-center text-xs text-gray-500 mt-2">بانتظار انضمام اللاعبين...</p>}
                    </div>

                    {/* RIGHT: Player Grid */}
                    <div className="lg:col-span-2 bg-gray-800/40 backdrop-blur-md rounded-3xl border border-gray-700/50 p-6 flex flex-col">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                            <h2 className="text-2xl font-bold">اللاعبون المتصلون <span className="text-blue-500">({players.length})</span></h2>
                            <div className="flex gap-2">
                                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-xs text-green-400 font-bold uppercase">Online</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                            {players.map((player) => (
                                <div key={player.id} className="group relative bg-gray-700/50 hover:bg-gray-700 rounded-xl p-4 flex flex-col items-center gap-2 border border-white/5 transition-all hover:-translate-y-1">
                                    {player.id !== socket.id && (
                                        <button
                                            onClick={() => kickPlayer(player.id)}
                                            className="absolute top-2 right-2 w-6 h-6 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-full flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 z-10"
                                            title="Kick Player"
                                        >
                                            ✕
                                        </button>
                                    )}

                                    <div className="w-16 h-16 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full flex items-center justify-center text-3xl shadow-inner relative">
                                        {player.avatar || '👤'}
                                        {player.id === socket.id && (
                                            <span className="absolute -bottom-1 -right-1 text-xs bg-yellow-500 text-black font-bold px-1.5 rounded-full border border-gray-900">Host</span>
                                        )}
                                    </div>
                                    <div className="font-bold text-center truncate w-full">{player.nickname}</div>
                                    <div className="text-xs text-gray-500 font-mono">0 pts</div>
                                </div>
                            ))}

                            {/* Empty placeholders to fill grid visually */}
                            {Array.from({ length: Math.max(0, 6 - players.length) }).map((_, i) => (
                                <div key={`empty-${i}`} className="border-2 border-dashed border-gray-800 rounded-xl flex items-center justify-center min-h-[120px] opacity-30">
                                    <span className="text-2xl text-gray-700">Waiting...</span>
                                </div>
                            ))}
                        </div>
                    </div>

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

                <div className="bg-gray-700/30 p-6 rounded-xl border border-white/5 mb-8 flex flex-col md:flex-row gap-6 items-center">
                    <div className="flex-1 w-full">
                        <label className="block text-gray-400 mb-2 font-bold text-sm">اسم المضيف</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    <div className="flex-1 w-full">
                        <label className="block text-gray-400 mb-2 font-bold text-sm">اختر الشخصية</label>
                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                            {['👑', '🎩', '🎓', '🦄', '🐲', '🦁'].map(av => (
                                <button
                                    key={av}
                                    onClick={() => setAvatar(av)}
                                    className={`w-12 h-12 text-2xl rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${avatar === av ? 'bg-blue-500/20 border-blue-500 scale-110' : 'bg-gray-800 border-gray-600'}`}
                                >
                                    {av}
                                </button>
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

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import defaultPacks from '../data/packs';
import { getPersistentUserId, getPersistentDeviceId, registerOrUpdatePlayer } from '../utils/userAuth';
import PackSelection from '../components/PackSelection';
import { useToast } from '../context/ToastContext';

const HostDashboard = () => {
    const navigate = useNavigate();
    const { roomCode: paramRoomCode } = useParams();

    const [roomCode, setRoomCode] = React.useState(paramRoomCode || null);
    const [isCreating, setIsCreating] = React.useState(false);

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
    if (paramRoomCode) {
            navigator.clipboard.writeText(roomCode);
            showToast("تم نسخ رمز الغرفة! 📋", "success");
        }
    };

    React.useEffect(() => {
        // SoundManager will initialize lazily on first sound play (user interaction)


        const fetchPacks = async () => {
            const { data: customPacks, error: fetchError } = await supabase
                .from('custom_packs')
                .select('*');

            if (fetchError) {
                console.error("❌ Error fetching custom packs:", fetchError);
            }


            const formattedCustom = (customPacks || []).map(p => ({
                id: `custom_${p.id}`,
                title: p.name || p.title || 'بدون عنوان',
                category: p.category || 'عام',
                difficulty: p.difficulty || 'Medium',
                description: p.description || '',
                icon: p.icon || "🎨",
                questions: p.data || [],
                questionCount: (p.data || []).length
            }));

            const allPacks = [...defaultPacks, ...formattedCustom].map(p => ({
                ...p,
                questionCount: p.questions?.length || p.questionCount || 0
            }));
            setPacks(allPacks);

            if (allPacks.length > 0) {
                setSelectedPack(allPacks[0]);
                setGameSettings(prev => ({
                    ...prev,
                    questionCount: Math.min(prev.questionCount, allPacks[0]?.questionCount || 10)
                }));
            }
        };

        fetchPacks();


    }, []);

    const handlePackSelect = (pack) => {
        setSelectedPack(pack);
        setGameSettings(prev => ({
            ...prev,
            questionCount: Math.min(prev.questionCount, pack.questionCount)
        }));
    };



    const createRoom = async () => {
        if (!selectedPack) return;

        setIsCreating(true);
        const deviceId = getPersistentDeviceId();

        let attempts = 0;
        let success = false;
        let lastError = null;

        while (attempts < 5 && !success) {
            attempts++;
            const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
            const finalSettings = { ...gameSettings, packId: selectedPack.id, nickname, avatar, deviceId };

            try {
                // 1. Ensure Player exists in 'players' table (Safeguard for FK)
                const regResult = await registerOrUpdatePlayer(supabase, {
                    device_id: deviceId,
                    nickname: nickname,
                    avatar: avatar,
                    last_seen: new Date().toISOString()
                }, { autoHandleConflict: true });

                if (regResult.error) {
                    console.error("Player registration failed:", regResult.error);
                    throw new Error(`Registration failed: ${regResult.error.customMsg || regResult.error.message}`);
                }

                if (regResult.isRenamed) {
                    localStorage.setItem('quiz_nickname', regResult.newNickname);
                    finalSettings.nickname = regResult.newNickname;
                }

                // 2. Create Room row
                const { error: roomError } = await supabase
                    .from('rooms')
                    .insert({
                        room_code: roomCode,
                        host_id: deviceId,
                        state: 'waiting',
                        settings: finalSettings,
                        pack_data: selectedPack
                    });

                if (roomError) {
                    if (roomError.code === '23505' || roomError.status === 409) {
                        console.warn(`Room code ${roomCode} collision, retrying...`);
                        continue; // Try next code
                    }
                    throw roomError;
                }

                // 3. Add Host to room_players
                const { error: playerError } = await supabase
                    .from('room_players')
                    .insert({
                        room_code: roomCode,
                        player_id: deviceId,
                        is_ready: true,
                        is_host: true,
                        status: 'active'
                    });

                if (playerError) throw playerError;

                // 4. Join Realtime Channel
                await realtime.joinRoom(roomCode, { deviceId, nickname, avatar, isHost: true });

                success = true;
                setIsCreating(false);
                navigate(`/waiting/${roomCode}`, {
                    state: {
                        roomCode,
                        nickname,
                        avatar,
                        deviceId,
                        isHost: true,
                        isTeamMode: selectedPack?.name === 'Team Meat',
                        mode: 'pre-game',
                        pack: selectedPack,
                        gameSettings: finalSettings
                    }
                });
            } catch (err) {
                console.error(`Attempt ${attempts} failed:`, err);
                lastError = err;
                if (err.code === '23503') {
                    // Critical FK issue - don't retry, just fail
                    break;
                }
                // For other errors, we might try again once or twice
                if (attempts >= 3) break;
            }
        }

        if (!success) {
            setIsCreating(false);
            const msg = lastError?.message || lastError?.details || "فشل إنشاء الغرفة";
            showToast(`⚠️ ${msg}`, "error");
        }
    };

    const kickPlayer = async (playerId) => {
        if (window.confirm("هل أنت متأكد من طرد هذا اللاعب؟")) {
            // 1. Remove from DB
            await supabase
                .from('room_players')
                .delete()
                .eq('room_code', roomCode)
                .eq('player_id', playerId);

            // 2. Broadcast kick signal
            realtime.broadcast('player_kicked', { playerId });
            showToast("تم طرد اللاعب بنجاح 🚫", "warning");
        }
    };

    // If accessed directly via /host/:roomCode, redirect to waiting room
    React.useEffect(() => {
        if (paramRoomCode) {
            navigate(`/waiting/${paramRoomCode}`, {
                state: {
                    roomCode: paramRoomCode,
                    nickname,
                    avatar,
                    userId: getPersistentUserId(),
                    isHost: true,
                },
                replace: true
            });
        }
    }, [paramRoomCode]); // Only depend on param, not roomCode/navigate/nickname/avatar

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

            {/* Branded Header & Navigation */}
            <div className="flex flex-col items-center gap-4 mb-8 pt-6 relative z-10 w-full animate-fade-in-down">
                {/* Logo & Title */}
                <div className="flex flex-col items-center gap-2 group cursor-default">
                    <img src="/logo.png" alt="QuizRoom Logo" className="w-16 h-16 object-contain group-hover:rotate-12 transition-transform drop-shadow-lg" />
                    <div className="flex flex-col items-center">
                        <span className="text-3xl font-black text-white tracking-tight leading-none drop-shadow-md">
                            QUIZ <span className="text-blue-400">ROOM</span>
                        </span>
                        <span className="text-[10px] text-blue-400/50 font-black uppercase tracking-widest mt-1">
                            by Said Elgendy
                        </span>
                    </div>
                </div>

                {/* Navigation Buttons */}
                <div className="flex items-center gap-4 mt-2">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 px-6 py-3 rounded-2xl border border-white/10 transition-all hover:scale-105 shadow-lg backdrop-blur-md"
                    >
                        <span className="hidden md:inline font-bold">الرئيسية</span>
                        <span className="text-xl">🏠</span>
                    </button>

                    <button
                        onClick={() => navigate('/profile')}
                        className="flex items-center gap-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 px-6 py-3 rounded-2xl border border-white/10 transition-all hover:scale-105 shadow-lg backdrop-blur-md"
                    >
                        <span className="text-xl">👤</span>
                        <span className="hidden md:inline font-bold">الملف الشخصي</span>
                    </button>
                </div>
            </div>

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
                                max={selectedPack?.questionCount || 50}
                                value={gameSettings.questionCount}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    const max = selectedPack?.questionCount || 50;
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
                                <span>إنشاء غرفة</span>
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

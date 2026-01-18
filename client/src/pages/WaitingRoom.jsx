import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import defaultPacks from '../data/packs';
import SoundManager from '../utils/SoundManager';
import { useFriendSystem } from '../hooks/useFriendSystem';
import { useToast } from '../context/ToastContext';
import { getPersistentUserId, getPersistentDeviceId } from '../utils/userAuth';

const WaitingRoom = () => {
    const { roomCode: paramRoomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    // Use roomCode from params or state, defaulting to what we have
    const roomCode = paramRoomCode || location.state?.roomCode;

    const {
        nickname: stateNickname,
        avatar: initialAvatar, // Receive avatar from state
        players: initialPlayers,
        isLateJoin: initialLateJoin = false,
        mode = initialLateJoin ? 'late-join' : 'pre-game', // 'pre-game' | 'between-questions' | 'late-join'
        currentQuestion = 0,
        totalQuestions = 0,
        lastAnswer = null,
        roundResults = null,
        userId: stateUserId,
        pack: initialPack,         // [NEW] Receive pack info
        gameSettings: initialSettings // [NEW] Receive settings
    } = location.state || {};

    // Restore user/nickname from localStorage if missing (direct link case)
    const [nickname] = React.useState(stateNickname || localStorage.getItem('quiz_nickname') || '');
    const [userId] = React.useState(stateUserId || getPersistentUserId());

    const [players, setPlayers] = React.useState(initialPlayers || []);
    const [isTeamMode, setIsTeamMode] = React.useState(location.state?.isTeamMode || false);
    const [teams, setTeams] = React.useState(location.state?.room?.teams || null);

    // Pack & Settings State
    const [packInfo, setPackInfo] = React.useState(initialPack || null);
    const [settings, setSettings] = React.useState(initialSettings || null);

    const [roundResultsState, setRoundResultsState] = React.useState(roundResults);
    const [messages, setMessages] = React.useState([]);
    const [newMessage, setNewMessage] = React.useState('');
    const [isReady, setIsReady] = React.useState(false);
    const [chatDisabled, setChatDisabled] = React.useState(false);
    const { showToast } = useToast();
    const [canSendMessage, setCanSendMessage] = React.useState(true);
    const [spamCountdown, setSpamCountdown] = React.useState(0);
    const [showProfileModal, setShowProfileModal] = React.useState(false);
    const [editName, setEditName] = React.useState(nickname);
    const [editAvatar, setEditAvatar] = React.useState(initialAvatar || '👤');
    const [showRules, setShowRules] = React.useState(false);
    const [joinLoading, setJoinLoading] = React.useState(false);
    const [typingUsers, setTypingUsers] = React.useState([]);
    const typingTimeoutRef = React.useRef(null);

    // Play Again State
    const [showPackModal, setShowPackModal] = React.useState(false);
    const [availablePacks, setAvailablePacks] = React.useState([]);
    const [selectedNewPackId, setSelectedNewPackId] = React.useState(null);

    // Play Again Helpers
    const handlePlayAgainClick = async () => {
        setJoinLoading(true);
        const { data: customPacks } = await supabase.from('custom_packs').select('*');
        const allPacks = [...defaultPacks, ...(customPacks || []).map(p => ({
            id: `custom_${p.id}`,
            name: p.name,
            questions: p.data,
            questionCount: p.data.length
        }))];
        setAvailablePacks(allPacks);
        setJoinLoading(false);
        setShowPackModal(true);
        if (packInfo) setSelectedNewPackId(packInfo.id);
    };

    const handleConfirmPlayAgain = async () => {
        if (!selectedNewPackId) return;
        const pack = availablePacks.find(p => p.id === selectedNewPackId);

        await supabase.from('rooms').update({
            state: 'playing',
            pack_data: pack,
            current_question_index: 0
        }).eq('room_code', roomCode);

        realtime.broadcast('game_started', { firstQuestion: pack.questions[0] });
        setShowPackModal(false);
    };

    // Dynamic Player Identification
    const deviceId = getPersistentDeviceId();
    const myself = players.find(p => p.id === deviceId) || players.find(p => p.nickname === nickname);
    const isHost = myself?.isHost || myself?.is_host || false;

    const { friends, pendingRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest } = useFriendSystem();

    const messagesEndRef = React.useRef(null);
    const spamTimerRef = React.useRef(null);

    const MAX_MESSAGE_LENGTH = 100;
    const SPAM_DELAY_SECONDS = 3;

    const isPreGame = mode === 'pre-game';
    const isBetweenQuestions = mode === 'between-questions';
    const isLateJoinMode = mode === 'late-join';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Event Handlers for Socket
    // Event Handlers for Realtime
    const handleConnect = React.useCallback(async () => {
        console.log('Realtime reconnected, joining waiting room...');
        await realtime.joinRoom(roomCode, { deviceId: getPersistentDeviceId(), nickname, avatar: initialAvatar, userId });
    }, [roomCode, nickname, userId, initialAvatar]);

    const handlePlayerListUpdate = React.useCallback((updatedPlayers) => {
        console.log('Updated player list:', updatedPlayers);
        setPlayers(updatedPlayers);
    }, []);

    const handleWaitingMessage = React.useCallback((msg) => {
        setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        });
    }, []);

    const handleGameStarting = React.useCallback((questionData) => {
        console.log('Game starting...', questionData);
        navigate('/game', {
            state: {
                roomCode,
                nickname: nickname,
                userId,
                initialQuestion: questionData,
                role: isHost ? 'host' : 'player',
                pack: packInfo
            }
        });
    }, [navigate, roomCode, nickname, userId, isHost]);

    const handleNewQuestionReceived = React.useCallback((q) => {
        console.log('New question received...', q);
        navigate('/game', {
            state: {
                roomCode,
                nickname: nickname,
                userId,
                initialQuestion: q,
                role: isHost ? 'host' : 'player',
                pack: packInfo
            }
        });
    }, [navigate, roomCode, nickname, userId, isHost, packInfo]);

    React.useEffect(() => {
        if (!roomCode) {
            navigate('/');
            return;
        }

        // Redirect if no nickname (Direct Link Access)
        if (!nickname) {
            navigate('/join', { state: { roomCode } });
            return;
        }

        console.log('Mounting WaitingRoom - Serverless', { mode, roomCode });
        SoundManager.init();

        const initializeRealtime = async () => {
            try {
                // 1. Join Realtime Room
                const deviceId = getPersistentDeviceId();
                await realtime.joinRoom(roomCode, { deviceId, nickname, avatar: initialAvatar || '👤', userId });

                // 2. Fetch Initial Room Data from DB
                const { data: roomData, error: roomError } = await supabase
                    .from('rooms')
                    .select('*, room_players(*)')
                    .eq('room_code', roomCode)
                    .single();

                if (roomError) {
                    showToast("❌ الغرفة غير موجودة أو تم إغلاقها", "error");
                    navigate('/join');
                    return;
                }

                setIsTeamMode(roomData.settings?.isTeamMode || false);
                setSettings(roomData.settings);
                setPackInfo(roomData.pack_data);

                // Merge Room Players with Presence (conceptually)
                // Normalize DB keys to App keys (snake_case -> camelCase)
                const dbPlayers = (roomData.room_players || []).map(p => ({
                    ...p,
                    id: p.player_id,
                    isHost: p.is_host,
                    isReady: p.is_ready || false
                }));
                setPlayers(dbPlayers);

                // 3. Fetch Chat History
                const { data: chatData } = await supabase
                    .from('chat_messages') // Should exist or create it
                    .select('*')
                    .eq('room_code', roomCode)
                    .order('created_at', { ascending: true })
                    .limit(50);

                if (chatData) setMessages(chatData);

                // 4. Set Listeners
                realtime.on('presence_sync', () => {
                    const state = realtime.getPresenceState();
                    const onlineDeviceIds = Object.values(state)
                        .flat()
                        .map(p => p.deviceId);

                    setPlayers(prev => prev.map(p => ({
                        ...p,
                        isOnline: onlineDeviceIds.includes(p.player_id)
                    })));

                    // If we are late joiner, we might not be in DB yet? 
                    // (Actually createRoom and JoinGame should handle DB entry)
                });

                realtime.on('new_message', (msg) => {
                    handleWaitingMessage(msg);
                });

                realtime.on('game_started', (questionData) => {
                    handleGameStarting(questionData);
                });

                realtime.on('player_kicked', ({ kickedDeviceId }) => {
                    if (kickedDeviceId === deviceId) {
                        alert("تم طردك");
                        navigate('/');
                    }
                });

                // ... more listeners as needed
            } catch (err) {
                console.error("Initialization error:", err);
            }
        };

        initializeRealtime();

        return () => {
            realtime.leaveRoom();
        };
    }, [roomCode, navigate, nickname, isHost, mode, initialAvatar, userId]);

    const handleUpdateProfile = () => {
        // Feature removed for strict identity
    };

    const addSystemMessage = async (content) => {
        const msg = {
            room_code: roomCode,
            content,
            type: 'system',
            created_at: new Date().toISOString()
        };
        setMessages((prev) => [...prev, msg]);
        // Also save to DB
        await supabase.from('chat_messages').insert(msg);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || chatDisabled || !canSendMessage) return;

        const deviceId = getPersistentDeviceId();
        const msg = {
            room_code: roomCode,
            sender_id: deviceId,
            sender_nickname: nickname,
            content: newMessage.trim(),
            type: 'user',
            created_at: new Date().toISOString()
        };

        // 1. Broadcast immediately for UX
        realtime.broadcast('new_message', msg);

        // 2. Clear Input
        setNewMessage('');

        // 3. Save to DB
        await supabase.from('chat_messages').insert(msg);

        // UI Rate limiting
        setCanSendMessage(false);
        setSpamCountdown(SPAM_DELAY_SECONDS);
        if (spamTimerRef.current) clearInterval(spamTimerRef.current);
        spamTimerRef.current = setInterval(() => {
            setSpamCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(spamTimerRef.current);
                    setCanSendMessage(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleInputChange = (e) => {
        const val = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
        setNewMessage(val);

        // Emit typing status
        realtime.broadcast('typing', { nickname: nickname, isTyping: val.length > 0 });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            realtime.broadcast('typing', { nickname: nickname, isTyping: false });
        }, 2000);
    };

    const toggleReady = async () => {
        const newReady = !isReady;
        setIsReady(newReady);
        SoundManager.playClick();
        const deviceId = getPersistentDeviceId();
        await supabase.from('room_players').update({ is_ready: newReady }).eq('room_code', roomCode).eq('player_id', deviceId);
        realtime.broadcast('player_ready_toggle', { deviceId, isReady: newReady });
    };

    const joinTeam = async (teamIndex, spotIndex) => {
        if (joinLoading) return;
        setJoinLoading(true);
        SoundManager.playClick();
        const deviceId = getPersistentDeviceId();
        await supabase.from('room_players').update({ team_index: teamIndex, spot_index: spotIndex }).eq('room_code', roomCode).eq('player_id', deviceId);

        // Safety Timeout: Prevent UI hang if server doesn't respond
        setTimeout(() => setJoinLoading(false), 5000);
    };

    const handleKick = async (targetId, nickname) => {
        if (!isHost) return;
        if (window.confirm(`هل أنت متأكد من طرد ${nickname}؟`)) {
            await supabase.from('room_players').delete().eq('room_code', roomCode).eq('player_id', targetId);
            realtime.broadcast('player_kicked', { playerId: targetId });
        }
    };

    const handlePlayAgain = () => {
        // handled in confirm play again
    };

    const handleReturnHome = () => {
        if (window.confirm("هل أنت متأكد من العودة للقائمة الرئيسية؟")) {
            navigate('/');
        }
    };

    const handleStartGame = async () => {
        if (!packInfo) return;

        // 1. Update Room State in DB
        const { error } = await supabase
            .from('rooms')
            .update({
                state: 'playing',
                current_question_index: 0,
                updated_at: new Date().toISOString()
            })
            .eq('room_code', roomCode);

        if (error) {
            showToast("❌ فشل بدء اللعبة", "error");
            return;
        }

        // Reset old answers from previous games/tests
        await supabase
            .from('room_players')
            .update({ last_answer: null, is_correct: null })
            .eq('room_code', roomCode);

        // 2. Broadcast Game Start signal with first question
        const firstQuestion = packInfo.questions[0];
        realtime.broadcast('game_started', firstQuestion);

        // 3. Navigation is handled by the receiver and the host themselves
        handleGameStarting(firstQuestion);
    };

    const startNextQuestion = () => {
        // host manages this via GameScreen
    };

    const handleCancelGame = async () => {
        if (window.confirm("هل أنت متأكد من إلغاء الغرفة؟ سيتم طرد جميع اللاعبين.")) {
            await supabase.from('rooms').delete().eq('room_code', roomCode);
            navigate('/');
        }
    };

    const shareLink = () => {
        const url = `${window.location.origin}/join/${roomCode}`;
        const text = `🎮 تعال العب معايا! كود الغرفة: ${roomCode}`;

        if (navigator.share) {
            navigator.share({
                title: 'QuizRoom',
                text: text,
                url: url
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(url);
            showToast("تم نسخ رابط الدعوة! 🔗", "success");
        }
    };

    const shareSocial = (platform) => {
        const url = `${window.location.origin}/join/${roomCode}`;
        const text = encodeURIComponent(`🎮 تعال العب معايا في QuizRoom!\nكود الغرفة: ${roomCode}\n\nالرابط: `);
        const fullUrl = encodeURIComponent(url);

        let shareUrl = '';
        if (platform === 'whatsapp') {
            shareUrl = `https://wa.me/?text=${text}${fullUrl}`;
        } else if (platform === 'telegram') {
            shareUrl = `https://t.me/share/url?url=${fullUrl}&text=${text}`;
        }

        if (shareUrl) window.open(shareUrl, '_blank');
    };

    const allPlayersWaiting = players.every(p => p.status === 'waiting' || p.isHost);

    const getTitle = () => {
        if (isPreGame) return '🎮 اللعبة جاهزة';
        if (isLateJoinMode) return '👀 وضع المشاهدة';
        return `🎯 السؤال ${currentQuestion} من ${totalQuestions}`;
    };

    const getSubtitle = () => {
        if (isPreGame) return 'انتظر حتى يبدأ المضيف';
        if (isLateJoinMode) return 'انتظر حتى تبدأ الجولة القادمة للمشاركة';
        if (allPlayersWaiting) return '✅ جميع اللاعبين أنهوا الإجابة';
        return '⏳ انتظار بقية اللاعبين...';
    };

    const getPlayerStatus = (player) => {
        if (player.isHost) return null;
        if (player.status === 'waiting-next-round') {
            return <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-lg">👀 يشاهد</span>;
        }
        if (isBetweenQuestions) {
            if (player.lastRoundAnswer === 'No Answer') {
                return <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-lg">❌ لم يجب</span>;
            }
            if (player.status === 'waiting' || player.lastRoundAnswer) {
                return <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-lg">✅ أجاب</span>;
            }
            return <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-lg">⌛ يجيب</span>;
        }
        return (
            <div className={`text-sm font-bold px-2 py-1 rounded-lg ${player.isReady ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/50 text-gray-400'}`}>
                {player.isReady ? '✅' : '⏳'}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-4 md:p-6 font-sans relative overflow-hidden">
            {/* Background FX */}
            <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>

            <div className="w-full max-w-6xl relative z-10">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 mb-3">
                        {getTitle()}
                    </h1>
                    <p className="text-gray-400 text-lg">{getSubtitle()}</p>

                    {isBetweenQuestions && (
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="bg-gray-800/60 px-6 py-2 rounded-full flex items-center gap-3">
                                    <span className="text-sm text-gray-400">التقدم:</span>
                                    <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                                            style={{ width: `${(currentQuestion / totalQuestions) * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-sm text-white font-bold">{currentQuestion}/{totalQuestions}</span>
                                </div>
                            </div>

                            {/* Answers List Table */}
                            <div className="bg-gray-800/40 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden animate-slide-up max-w-2xl mx-auto border-t-4 border-t-blue-600">
                                <div className="p-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">إجابات اللاعبين</h3>
                                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-black">الجولة الحالية</span>
                                </div>
                                <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                                    {players.filter(p => !p.isHost).map((player, idx) => (
                                        <div key={player.id} className={`flex items-center justify-between p-3 border-b border-white/5 last:border-0 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-[10px] text-white font-bold border border-white/10">
                                                    {player.avatar || '👤'}
                                                </div>
                                                <span className="text-sm font-bold text-gray-200">{player.nickname}</span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                {player.status === 'waiting' || player.lastRoundAnswer ? (
                                                    <span className={`text-sm font-black italic tracking-wide px-3 py-1 rounded-lg border ${player.lastRoundAnswer === 'No Answer' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-white bg-white/5 border-white/5'}`}>
                                                        {player.lastRoundAnswer === 'No Answer' ? 'لم يجب' : (player.lastRoundAnswer || "---")}
                                                    </span>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-gray-500 text-[10px] animate-pulse">
                                                        <span>جاري التفكير...</span>
                                                        <span className="w-1 h-1 bg-gray-500 rounded-full animate-bounce"></span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Host Offline Warning */}
                    {players.some(p => p.isHost && p.isOnline === false) && (
                        <div className="bg-red-500/20 border border-red-500/30 rounded-2xl p-4 mb-8 animate-pulse flex items-center justify-center gap-4">
                            <span className="text-2xl">⚠️</span>
                            <div className="text-right">
                                <p className="text-red-400 font-bold text-sm">المضيف فقد الاتصال!</p>
                                <p className="text-red-500/70 text-[10px]">اللعبة ستنتقل للاعب آخر تلقائياً خلال ثوانٍ إذا لم يعد...</p>
                            </div>
                        </div>
                    )}
                </div>

            </div>

            {/* Pack Info Card - [NEW] */}
            <div className="flex justify-center mb-8">
                <div className="bg-gray-800/60 backdrop-blur-xl p-4 rounded-2xl border border-gray-700 flex items-center gap-4 animate-fade-in-up">
                    <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center text-2xl">
                        {packInfo?.icon || '📦'}
                    </div>
                    <div>
                        <div className="font-bold text-base text-gray-200">{packInfo?.title || packInfo?.name || 'جاري تحميل الحزمة...'}</div>
                        <div className="text-xs text-gray-400 font-bold flex gap-3 mt-1">
                            {packInfo?.questionCount && <span>❓ {packInfo.questionCount} سؤال</span>}
                            {(packInfo?.timeLimit || settings?.timeLimit) && <span>⏱️ {packInfo?.timeLimit || settings?.timeLimit} ثانية</span>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Room Code & Share */}
            <div className="flex flex-col items-center gap-4 mb-8">
                <div className="bg-gray-800/60 backdrop-blur-xl px-10 py-6 rounded-3xl border border-gray-700 shadow-2xl relative group">
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2 text-center">كود الغرفة</p>
                    <div className="text-5xl font-black text-white tracking-[0.4em] text-center">{roomCode}</div>

                    <button
                        onClick={shareLink}
                        className="absolute -right-4 -top-4 w-12 h-12 bg-blue-600 hover:bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 transition-all hover:scale-110 active:scale-95 group-hover:rotate-12"
                        title="مشاركة الرابط"
                    >
                        {navigator.share ? '📤' : '🔗'}
                    </button>
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                    <button
                        onClick={() => shareSocial('whatsapp')}
                        className="flex items-center gap-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-sm font-bold transition-colors px-6 py-3 rounded-2xl border border-[#25D366]/20 shadow-lg shadow-[#25D366]/5"
                    >
                        <span className="text-xl">💬</span>
                        <span>واتساب</span>
                    </button>

                    <button
                        onClick={() => shareSocial('telegram')}
                        className="flex items-center gap-2 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 text-[#0088cc] text-sm font-bold transition-colors px-6 py-3 rounded-2xl border border-[#0088cc]/20 shadow-lg shadow-[#0088cc]/5"
                    >
                        <span className="text-xl">✈️</span>
                        <span>تيليجرام</span>
                    </button>

                    <button
                        onClick={shareLink}
                        className="flex items-center gap-2 bg-blue-400/10 hover:bg-blue-400/20 text-blue-400 text-sm font-bold transition-colors px-6 py-3 rounded-2xl border border-blue-400/20 shadow-lg shadow-blue-400/5 md:hidden"
                    >
                        <span>إرسال دعوة للأصدقاء</span>
                        <span className="text-xs">↗️</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Players & Teams List */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <div className="bg-gray-800/40 backdrop-blur-md rounded-3xl border border-gray-700/50 p-6">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                            <h2 className="text-xl font-bold">اللاعبون <span className="text-blue-500">({players.length})</span></h2>
                            {isBetweenQuestions && (
                                <span className="text-xs text-gray-400">
                                    {players.filter(p => p.status === 'waiting' || p.isHost).length}/{players.length} أنهوا
                                </span>
                            )}
                        </div>

                        {/* Answers Table (Visible between questions) */}
                        {isBetweenQuestions && roundResultsState && (
                            <div className="bg-gray-800/60 backdrop-blur-xl rounded-3xl border border-gray-700/50 overflow-hidden mb-6 animate-slide-up">
                                <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                                    <h2 className="text-lg font-bold flex items-center gap-2">
                                        <span>📊</span> إجابات السؤال
                                    </h2>
                                    {roundResultsState.correctAnswer && (
                                        <div className="text-xs bg-green-500/20 text-green-400 px-3 py-1 rounded-full font-bold border border-green-500/30">
                                            الإجابة الصحيحة: {roundResultsState.correctAnswer}
                                        </div>
                                    )}
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-right">
                                        <thead className="bg-black/20 text-xs text-gray-400 uppercase font-black tracking-wider">
                                            <tr>
                                                <th className="px-4 py-3">اللاعب</th>
                                                <th className="px-4 py-3">الإجابة</th>
                                                <th className="px-4 py-3 text-center">النتيجة</th>
                                                {isTeamMode && <th className="px-4 py-3 text-center">الفريق</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {players.map((p) => {
                                                const isMe = p.id === deviceId;
                                                const isFriend = friends.includes(p.userId);
                                                // Calculate correctness based on client-side comparison or server data if available
                                                // Ideally server sends correctness in players list, but for now we inferred it from score diff or manually checking
                                                // Actually, let's use lastRoundAnswer vs roundResultsState.correctAnswer
                                                // Note: players list here comes from roundResults.scores which has updated scores but maybe not explicit "wasCorrect" flag per player
                                                // We can infer it if needed, or just show the answer.

                                                const answer = p.lastRoundAnswer || (roundResultsState.scores.find(s => s.id === p.id)?.lastRoundAnswer);
                                                const displayAnswer = !answer || answer === 'No Answer' ? '—' : answer;
                                                const hasAnswered = answer && answer !== 'No Answer';

                                                // Simple Check (Case insensitive)
                                                const isCorrect = hasAnswered && roundResultsState.correctAnswer && answer.toLowerCase().trim() === roundResultsState.correctAnswer.toLowerCase().trim();

                                                return (
                                                    <tr key={p.id} className={`
                                                        transition-colors
                                                        ${isMe ? 'bg-blue-600/10 hover:bg-blue-600/20' : 'hover:bg-white/5'}
                                                        ${isFriend ? 'bg-green-600/5' : ''}
                                                    `}>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm shadow-inner relative">
                                                                    {p.avatar || '👤'}
                                                                    {isMe && <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-gray-800"></div>}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className={`font-bold text-sm ${isMe ? 'text-blue-300' : 'text-gray-200'}`}>
                                                                        {p.nickname}
                                                                    </span>
                                                                    {isTeamMode && p.teamId && (
                                                                        <span className="text-[10px] text-gray-500">
                                                                            {teams?.find((t, i) => `team_${i}` === p.teamId)?.name || 'فريق ' + p.teamId.replace('team_', '')}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-sm font-bold ${!hasAnswered ? 'text-gray-600' : 'text-white'}`}>
                                                                {displayAnswer}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {hasAnswered ? (
                                                                isCorrect ? (
                                                                    <span className="inline-flex items-center justify-center w-6 h-6 bg-green-500/20 text-green-400 rounded-full text-xs">✔</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center justify-center w-6 h-6 bg-red-500/20 text-red-400 rounded-full text-xs">✘</span>
                                                                )
                                                            ) : (
                                                                <span className="text-[10px] text-gray-600 font-bold">لم يجب</span>
                                                            )}
                                                        </td>
                                                        {isTeamMode && (
                                                            <td className="px-4 py-3 text-center">
                                                                {/* Team Point Indicator */}
                                                                {roundResultsState.teamResults?.find(tr => tr.teamId === p.teamId)?.earnedPoint ? (
                                                                    <span className="text-xl" title="نقطة للفريق">🥩</span>
                                                                ) : (
                                                                    <span className="text-xl opacity-20 grayscale">🥩</span>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {isTeamMode && (
                                    <div className="px-4 py-2 bg-blue-900/20 border-t border-white/5 text-[10px] text-blue-300 text-center">
                                        ⭐ في وضع الفريق: يحصل الفريق على نقطة فقط إذا تطابقت الإجابات وكانت صحيحة!
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Team Selection UI (Pre-game only) */}
                        {isPreGame && isTeamMode && (
                            <div className="mb-6 animate-fade-in bg-black/20 p-4 rounded-2xl border border-white/5">
                                <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-center">
                                    اختر فريقك 🤝
                                </h3>
                                <div className="grid grid-cols-1 gap-3">
                                    {(teams || Array.from({ length: 6 }, (_, i) => ({ id: i, name: `الفريق ${i + 1}`, spots: [null, null] }))).map((team, tIdx) => (
                                        <div key={team.id} className="bg-white/5 rounded-xl border border-white/5 p-3">
                                            <div className="text-[10px] font-bold text-gray-500 mb-2 flex justify-between">
                                                <span>{team.name}</span>
                                                {team.spots.every(s => s !== null) && <span className="text-green-500">مكتمل ✅</span>}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {team.spots.map((spotUserId, sIdx) => {
                                                    const occupier = players.find(p => p.userId === spotUserId);
                                                    const isMe = spotUserId === userId;
                                                    return (
                                                        <button
                                                            key={sIdx}
                                                            onClick={() => {
                                                                if (!occupier) {
                                                                    joinTeam(tIdx, sIdx);
                                                                } else {
                                                                    console.log('CLIENT: Spot is occupied by:', occupier.nickname);
                                                                }
                                                            }}
                                                            className={`
                                                                     relative h-14 rounded-lg border transition-all flex flex-col items-center justify-center overflow-hidden
                                                                     ${occupier
                                                                    ? isMe
                                                                        ? 'bg-blue-600/30 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                                                        : 'bg-gray-800/50 border-white/5 cursor-not-allowed grayscale'
                                                                    : joinLoading
                                                                        ? 'bg-black/20 border-gray-800 cursor-wait'
                                                                        : 'bg-black/40 border-dashed border-gray-700 hover:border-blue-500/50 hover:bg-blue-600/5 cursor-pointer'
                                                                }
                                                                 `}
                                                            disabled={joinLoading || !!occupier}
                                                        >
                                                            {occupier ? (
                                                                <>
                                                                    <span className="text-lg mb-0.5">{occupier.avatar || '👤'}</span>
                                                                    <span className="text-[8px] font-black truncate w-full px-1 text-center text-gray-300">{occupier.nickname}</span>
                                                                    {isMe && <div className="absolute top-0 right-0 bg-blue-500 text-[6px] px-1 rounded-bl-md font-bold">أنت</div>}
                                                                </>
                                                            ) : (
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-gray-600 text-lg">+</span>
                                                                </div>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Players List */}
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {players.map((player) => {
                                const isTeammate = isTeamMode && myself?.teammateId === player.id;
                                return (
                                    <div
                                        key={player.id}
                                        className={`
                                                flex items-center gap-3 p-3 rounded-xl border transition-all
                                                ${player.id === deviceId
                                                ? 'bg-blue-600/20 border-blue-500/50'
                                                : isTeammate
                                                    ? 'bg-indigo-600/20 border-indigo-500/50'
                                                    : 'bg-gray-700/30 border-white/5'}
                                            `}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${player.isOnline !== false ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                                        <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm shadow-inner relative group/avatar">
                                            {player.avatar || '👤'}
                                            {player.id === deviceId && (
                                                <div className="absolute inset-0 bg-blue-500/10 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                                                    🔒
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-bold truncate ${isTeammate ? 'text-indigo-300' : ''}`}>{player.nickname}</span>
                                                <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-black ml-auto">{player.score || 0}</span>
                                            </div>
                                        </div>

                                        {/* Friend Actions */}
                                        {player.id !== deviceId && player.userId && (
                                            <div className="flex items-center gap-1">
                                                {friends.includes(player.userId) ? (
                                                    <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-black">صديق</span>
                                                ) : pendingRequests.includes(player.userId) ? (
                                                    <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded animate-pulse font-black">انتظار</span>
                                                ) : (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); sendFriendRequest(player.userId, player.nickname); }}
                                                        className="text-[10px] bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                                                        title="إضافة صديق"
                                                    >
                                                        👤+
                                                    </button>
                                                )}

                                                {/* Kick Button (Host Only) */}
                                                {isHost && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleKick(player.id, player.nickname); }}
                                                        className="text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 w-6 h-6 flex items-center justify-center rounded-lg transition-colors border border-red-500/20"
                                                        title="طرد اللاعب"
                                                    >
                                                        🚷
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {getPlayerStatus(player)}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-6 flex flex-col gap-3">
                            {!isHost && isPreGame && (
                                <button
                                    onClick={toggleReady}
                                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${isReady ? 'bg-green-600 text-white shadow-lg shadow-green-900/30' : 'bg-gray-700 text-gray-400'}`}
                                >
                                    {isReady ? '✅ جاهز' : '⏳ استعداد'}
                                </button>
                            )}
                            {isHost && isPreGame && (
                                <button
                                    onClick={handleStartGame}
                                    className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/30"
                                >
                                    🚀 ابدأ اللعبة
                                </button>
                            )}
                            {isHost && isBetweenQuestions && (
                                <button
                                    onClick={startNextQuestion}
                                    className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-900/30"
                                >
                                    {currentQuestion === totalQuestions ? '🏁 إنهاء الجولة' : '➡️ السؤال التالي'}
                                </button>
                            )}
                            {mode === 'finished' && (
                                <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl mb-4 text-center">
                                    <p className="text-blue-200 font-bold mb-1">🎉 الجولة انتهت!</p>
                                    <p className="text-[10px] text-blue-400">يمكنك اختيار حزمة أسئلة جديدة واللعب مرة أخرى.</p>
                                </div>
                            )}

                            {isHost && mode === 'finished' && (
                                <div className="space-y-3 mb-4">
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest text-right mb-2">اختر حزمة جديدة 👇</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { id: 'pack_autocomplete', name: 'Auto-Complete', emoji: '🔍' },
                                            { id: 'pack_truth', name: 'Truth', emoji: '⚖️' },
                                            { id: 'pack_teammeat', name: 'Team Meat', emoji: '🥩' },
                                            { id: 'pack_football', name: 'Football', emoji: '⚽' },
                                            { id: 'pack_easy', name: 'Easy Questions', emoji: '✨' }
                                        ].map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => realtime.broadcast('play_again', { roomCode, newPackId: p.id })}
                                                className="p-3 rounded-xl bg-gray-800/50 border border-white/5 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-right group"
                                            >
                                                <span className="text-xs font-bold block group-hover:text-blue-400">{p.name} {p.emoji}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isHost && mode === 'finished' && (
                                <button
                                    onClick={handlePlayAgain}
                                    className="w-full py-4 rounded-xl font-black text-sm bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-900/30 animate-bounce-in flex items-center justify-center gap-2"
                                >
                                    <span>🚀 إعادة اللعب بنفس الحزمة</span>
                                    <span>🔄</span>
                                </button>
                            )}
                            {mode === 'finished' && (
                                <button
                                    onClick={handleReturnHome}
                                    className="w-full py-3 rounded-xl font-bold text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all mt-2"
                                >
                                    🏠 العودة للقائمة الرئيسية
                                </button>
                            )}
                            {!isHost && isBetweenQuestions && (
                                <div className="p-3 bg-gray-700/30 rounded-xl text-center text-[10px] text-gray-500">
                                    بانتظار المضيف للسؤال التالي...
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Host Actions (Start/Cancel) */}
                    {isHost && (
                        <div className="flex gap-4 mb-6">
                            {isPreGame && (
                                <button
                                    onClick={handleStartGame}
                                    disabled={players.length === 0}
                                    className={`flex-1 bg-gradient-to-r from-green-500 to-emerald-600 p-4 rounded-xl flex items-center justify-center gap-2 font-black text-white shadow-lg shadow-green-900/20 hover:scale-105 active:scale-95 transition-all ${players.length === 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                                >
                                    <span className="text-xl">🚀</span>
                                    <span>ابدأ اللعبة</span>
                                </button>
                            )}

                            {isBetweenQuestions && (
                                <button
                                    onClick={startNextQuestion}
                                    className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 p-4 rounded-xl flex items-center justify-center gap-2 font-black text-white shadow-lg shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all"
                                >
                                    <span className="text-xl">➡️</span>
                                    <span>السؤال التالي</span>
                                </button>
                            )}

                            {/* Play Again Button (Visible after game or round/manual end) */}
                            {/* We show it if we are NOT in pre-game, to allow abortion/restart */}
                            {!isPreGame && (
                                <button
                                    onClick={handlePlayAgainClick}
                                    className="bg-gray-700/50 hover:bg-gray-700 p-4 rounded-xl flex items-center justify-center gap-2 font-bold text-gray-300 transition-all border border-white/10"
                                    title="إعادة تشغيل اللعبة"
                                >
                                    <span className="text-xl">🔄</span>
                                    <span className="hidden md:inline">العب مجددًا</span>
                                </button>
                            )}

                            <button
                                onClick={handleCancelGame}
                                className="bg-red-500/10 hover:bg-red-500/20 p-4 rounded-xl flex items-center justify-center text-red-500 transition-all border border-red-500/20"
                                title="إلغاء الغرفة"
                            >
                                <span className="text-xl">💣</span>
                            </button>
                        </div>
                    )}


                    {/* Play Again Pack Selection Modal */}
                    {showPackModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                            <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-scale-up">
                                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/50 rounded-t-3xl">
                                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                        <span>🔄</span> اختر حزمة للجولة الجديدة
                                    </h2>
                                    <button
                                        onClick={() => setShowPackModal(false)}
                                        className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-all"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                    {availablePacks.length === 0 ? (
                                        <div className="text-center text-gray-400 py-10">جاري تحميل الحزم...</div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {availablePacks.map(pack => (
                                                <div
                                                    key={pack.id}
                                                    onClick={() => setSelectedNewPackId(pack.id)}
                                                    className={`
                                                relative p-4 rounded-2xl border-2 transition-all cursor-pointer group
                                                ${selectedNewPackId === pack.id
                                                            ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-900/20'
                                                            : 'bg-gray-800/50 border-gray-700 hover:border-gray-500 hover:bg-gray-800'
                                                        }
                                            `}
                                                >
                                                    <div className="flex items-start justify-between mb-2">
                                                        <span className="text-3xl">{pack.icon || '📦'}</span>
                                                        {selectedNewPackId === pack.id && (
                                                            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">مختار</span>
                                                        )}
                                                    </div>
                                                    <h3 className="font-bold text-lg text-gray-200 mb-1">{pack.title || pack.name}</h3>
                                                    <div className="flex flex-wrap gap-2 text-xs font-bold text-gray-500">
                                                        <span className="bg-black/20 px-2 py-1 rounded-md">❓ {pack.questionCount} سؤال</span>
                                                        {pack.timeLimit && <span className="bg-black/20 px-2 py-1 rounded-md">⏱️ {pack.timeLimit} ثانية</span>}
                                                    </div>

                                                    {/* Hover Effect Details */}
                                                    <div className="absolute inset-x-0 bottom-0 top-auto h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 border-t border-gray-800 bg-gray-800/50 rounded-b-3xl flex justify-end gap-3">
                                    <button
                                        onClick={() => setShowPackModal(false)}
                                        className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:bg-gray-800 transition-all"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        onClick={handleConfirmPlayAgain}
                                        disabled={!selectedNewPackId}
                                        className={`
                                    px-8 py-3 rounded-xl font-black text-white shadow-lg transition-all flex items-center gap-2
                                    ${!selectedNewPackId
                                                ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                                                : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:scale-105 active:scale-95 shadow-blue-900/20'
                                            }
                                `}
                                    >
                                        <span>🚀</span>
                                        <span>ابدأ الجولة الجديدة</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* How to Play Section */}
                    <div className="bg-gray-800/40 backdrop-blur-md rounded-3xl border border-gray-700/50 p-6 overflow-hidden transition-all duration-300">
                        <button
                            onClick={() => setShowRules(!showRules)}
                            className="w-full flex justify-between items-center group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                                    📖
                                </div>
                                <h2 className="text-xl font-bold">كيف تلعب؟</h2>
                            </div>
                            <span className={`text-gray-500 transform transition-transform duration-300 ${showRules ? 'rotate-180' : ''}`}>▼</span>
                        </button>

                        {showRules && (
                            <div className="mt-6 space-y-6 text-sm text-gray-300 animate-fade-in custom-scrollbar max-h-[400px] overflow-y-auto">
                                <div className="bg-blue-600/10 p-4 rounded-2xl border border-blue-500/20">
                                    <p className="font-bold text-white mb-2 text-right">أهلاً بك في صفحة الانتظار! 👋</p>
                                    <p className="text-[10px] text-blue-200 text-right">إليك آلية عمل وضع Team Meat وكيفية اللعب:</p>
                                </div>

                                <section dir="rtl">
                                    <h3 className="font-bold text-white mb-3 flex items-center gap-2 text-right">
                                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                        1. تكوين الفريق:
                                    </h3>
                                    <ul className="space-y-2 text-xs list-disc list-inside pr-2 text-gray-400 text-right">
                                        <li>يتكون كل فريق من لاعبين اثنين.</li>
                                        <li>ستظهر لك مربعات قابلة للضغط (صندوقان لكل فريق).</li>
                                        <li>اضغط على صندوق فارغ للانضمام إلى ذلك الفريق.</li>
                                        <li>عندما يتم ملء الصندوقين، يصبح الفريق مكتملاً.</li>
                                        <li>يمكنك رؤية اسم زميلك وصورته الرمزية في الوقت الفعلي.</li>
                                        <li>لا يمكنك تغيير الفريق بعد الانضمام، ما لم يسمح المضيف بذلك.</li>
                                    </ul>
                                </section>

                                <section dir="rtl">
                                    <h3 className="font-bold text-white mb-3 flex items-center gap-2 text-right">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                        2. طريقة اللعب:
                                    </h3>
                                    <ul className="space-y-2 text-xs list-disc list-inside pr-2 text-gray-400 text-right">
                                        <li>بمجرد تكوين الفرق، يبدأ المضيف أسئلة Team Meat.</li>
                                        <li>يقوم كل لاعب بكتابة إجابته بشكل فردي.</li>
                                        <li>إذا قدم الزميلان <span className="text-white font-bold">نفس الإجابة الصحيحة</span> ← يربح الفريق نقطة.</li>
                                        <li>بعد الإجابة، تعود تلقائياً إلى صفحة الانتظار.</li>
                                    </ul>
                                </section>

                                <section dir="rtl">
                                    <h3 className="font-bold text-white mb-3 flex items-center gap-2 text-right">
                                        <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                                        3. حزم الأسئلة الأخرى:
                                    </h3>
                                    <div className="pr-6 space-y-1 text-right">
                                        <p className="text-[10px] text-gray-500">أكمل الإجابة، صراحة، كورة، أسئلة مبتكرة</p>
                                        <p className="text-xs text-gray-400">في هذه الأوضاع، يجيب كل لاعب بشكل فردي وتعود للانتظار فوراً.</p>
                                    </div>
                                </section>

                                <section dir="rtl" className="bg-white/5 p-4 rounded-xl">
                                    <h3 className="text-xs font-bold text-white mb-2 underline decoration-blue-500 text-right">نصائح:</h3>
                                    <ul className="space-y-1 text-[10px] text-gray-500 text-right">
                                        <li>• تأكد من اختيار فريقك قبل أن يضغط المضيف على "ابدأ".</li>
                                        <li>• راقب نقاط فريقك وحالتك في الوقت الفعلي هنا.</li>
                                    </ul>
                                </section>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Chat Column */}
                <div className="lg:col-span-2 bg-gray-800/40 backdrop-blur-md rounded-3xl border border-gray-700/50 flex flex-col h-[500px] lg:h-[600px] overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex items-center gap-3">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <h3 className="font-bold">💬 المحادثة</h3>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex flex-col ${msg.type === 'system' ? 'items-center' : (msg.sender_id === deviceId ? 'items-end' : 'items-start')}`}>
                                {msg.type === 'system' ? (
                                    <div className="bg-blue-500/10 text-blue-400 text-[10px] px-3 py-1 rounded-full border border-blue-500/10">
                                        📢 {msg.content}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className={`text-[10px] font-bold ${msg.sender_id === deviceId ? 'text-blue-400' : 'text-purple-400'}`}>
                                                {msg.sender_id === deviceId ? 'أنت' : msg.sender_nickname}
                                            </span>
                                        </div>
                                        <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-sm ${msg.sender_id === deviceId ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-700 text-gray-200 rounded-tl-none'}`}>
                                            {msg.content}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Typing Indicator */}
                    {typingUsers.length > 0 && (
                        <div className="px-4 py-1 flex items-center gap-2 animate-fade-in">
                            <div className="flex gap-0.5">
                                <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></span>
                                <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce delay-100"></span>
                                <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce delay-200"></span>
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold">
                                {typingUsers.join('، ')} {typingUsers.length > 1 ? 'يكتبون الآن...' : 'يكتب الآن...'}
                            </span>
                        </div>
                    )}

                    <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 flex gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={handleInputChange}
                            placeholder="اكتب رسالة..."
                            disabled={chatDisabled}
                            className="flex-1 bg-gray-900 border border-gray-600 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim() || chatDisabled || !canSendMessage}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-bold text-sm disabled:opacity-50"
                        >
                            {canSendMessage ? 'أرسل' : `${spamCountdown}s`}
                        </button>
                    </form>
                </div>
            </div>


            {/* Fixed Profile Display (No Editing) */}
            {
                showProfileModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-800 border border-gray-700 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center flex flex-col items-center animate-zoom-in">
                            <div className="w-24 h-24 bg-blue-600/20 rounded-3xl flex items-center justify-center text-5xl mb-6 shadow-xl border border-blue-500/30">
                                {avatar}
                            </div>
                            <h3 className="text-3xl font-black mb-2">{nickname}</h3>
                            <p className="text-gray-400 text-sm mb-6">هذه هي هويتك الدائمة في اللعبة.</p>

                            <div className="w-full bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl mb-8">
                                <p className="text-blue-400 font-bold text-sm">🔒 الاسم والصورة ثابتان</p>
                                <p className="text-[10px] text-blue-500/70">لا يمكن تغيير الملف الشخصي حالياً.</p>
                            </div>

                            <button onClick={() => setShowProfileModal(false)} className="w-full py-4 rounded-2xl bg-gray-700 hover:bg-gray-600 text-white font-bold transition-all">
                                إغلاق
                            </button>
                        </div>
                    </div>
                )
            }
        </div>
    );
};

export default WaitingRoom;

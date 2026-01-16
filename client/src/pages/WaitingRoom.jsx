import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import socket from '../socket';
import SoundManager from '../utils/SoundManager';
import { useFriendSystem } from '../hooks/useFriendSystem';
import { useToast } from '../context/ToastContext';

const WaitingRoom = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const {
        roomCode,
        nickname,
        avatar: initialAvatar, // Receive avatar from state
        players: initialPlayers,
        isLateJoin: initialLateJoin = false,
        mode = initialLateJoin ? 'late-join' : 'pre-game', // 'pre-game' | 'between-questions' | 'late-join'
        currentQuestion = 0,
        totalQuestions = 0,
        lastAnswer = null,
        roundResults = null,
        userId
    } = location.state || {};

    const [players, setPlayers] = useState(initialPlayers || []);
    const [isTeamMode, setIsTeamMode] = useState(location.state?.isTeamMode || false);
    const [teams, setTeams] = useState(location.state?.room?.teams || null);
    const [roundResultsState, setRoundResultsState] = useState(roundResults);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isReady, setIsReady] = useState(false);
    const [chatDisabled, setChatDisabled] = useState(false);
    const { showToast } = useToast();
    const [canSendMessage, setCanSendMessage] = useState(true);
    const [spamCountdown, setSpamCountdown] = useState(0);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [editName, setEditName] = useState(nickname);
    const [editAvatar, setEditAvatar] = useState(initialAvatar || '👤');
    const [showRules, setShowRules] = useState(false);
    const [joinLoading, setJoinLoading] = useState(false);

    // Dynamic Player Identification
    const [currentNickname, setCurrentNickname] = useState(nickname);
    const myself = players.find(p => p.id === socket.id) || players.find(p => p.nickname === currentNickname);
    const isHost = myself?.isHost || false;

    const { friends, pendingRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest } = useFriendSystem();

    const messagesEndRef = useRef(null);
    const spamTimerRef = useRef(null);

    const MAX_MESSAGE_LENGTH = 100;
    const SPAM_DELAY_SECONDS = 3;

    const isPreGame = mode === 'pre-game';
    const isBetweenQuestions = mode === 'between-questions';
    const isLateJoinMode = mode === 'late-join';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (!roomCode) {
            navigate('/');
            return;
        }

        console.log('Mounting WaitingRoom', { mode, roomCode });
        SoundManager.init();

        // Initial setup based on mode
        if (isPreGame) {
            addSystemMessage(`${nickname} انضم للغرفة`);
        } else if (isBetweenQuestions) {
            addSystemMessage(`${nickname} عاد للانتظار`);
        } else if (isLateJoinMode) {
            addSystemMessage(`${nickname} انضم للمشاهدة (اللعبة بدأت)`);
        }

        // Listen for full player list updates (Primary Source of Truth)
        const handlePlayerListUpdate = (updatedPlayers) => {
            console.log('Player list updated:', updatedPlayers);
            setPlayers(updatedPlayers);

            // Check for new joiners for sound effects
            if (updatedPlayers.length > players.length && players.length > 0) {
                const newPlayer = updatedPlayers[updatedPlayers.length - 1];
                if (newPlayer.nickname !== nickname) {
                    addSystemMessage(`${newPlayer.nickname} انضم`);
                    SoundManager.playJoin();
                }
            }
        };

        const handleWaitingMessage = (msg) => {
            setMessages((prev) => [...prev, msg]);
        };

        const handleGameStarting = (firstQuestion) => {
            addSystemMessage('🚀 اللعبة تبدأ الآن!');
            setChatDisabled(true);
            setTimeout(() => {
                navigate('/game', {
                    state: {
                        roomCode,
                        nickname,
                        role: isHost ? 'host' : 'player',
                        initialQuestion: firstQuestion
                    }
                });
            }, 1000);
        };

        const handleNextQuestion = (questionData) => {
            addSystemMessage('➡️ السؤال التالي!');
            setTimeout(() => {
                navigate('/game', {
                    state: {
                        roomCode,
                        nickname,
                        role: isHost ? 'host' : 'player',
                        initialQuestion: questionData
                    }
                });
            }, 500);
        };

        const handleConnect = () => {
            console.log('CLIENT: Socket reconnected. Resyncing status.');
            socket.emit('enter_waiting_room', { roomCode, nickname, userId, mode, avatar: initialAvatar });
        };

        // Listeners
        socket.on('connect', handleConnect);
        socket.on('player_joined', handlePlayerListUpdate);
        socket.on('waiting_message', handleWaitingMessage);
        socket.on('update_players', handlePlayerListUpdate);
        socket.on('new_message', handleWaitingMessage);
        socket.on('game_started', handleGameStarting);
        socket.on('new_question', handleNextQuestion);

        socket.on('room_info', (data) => {
            console.log('CLIENT: Room info received:', data);
            setIsTeamMode(data.isTeamMode);
            if (data.teams) setTeams(data.teams);
        });

        socket.on('team_update', (updatedTeams) => {
            console.log('CLIENT: Teams updated received:', updatedTeams);
            setTeams(updatedTeams);
            setIsTeamMode(!!updatedTeams);
            setJoinLoading(false);
        });

        socket.on('team_error', (data) => {
            setJoinLoading(false);
            showToast(data.message, "error");
        });

        socket.on('player_kicked', () => {
            alert("تم طردك");
            navigate('/');
        });

        socket.on('profile_updated', (data) => {
            if (data.success) {
                setCurrentNickname(data.nickname);
                showToast("تم تحديث الملف الشخصي بنجاح! ✨", "success");
            } else {
                showToast(data.error || "فشل تحديث الملف الشخصي", "error");
            }
        });

        // Emit initial entry event
        socket.emit('enter_waiting_room', { roomCode, nickname, userId, mode, avatar: initialAvatar });

        return () => {
            socket.off('connect', handleConnect);
            socket.off('player_joined', handlePlayerListUpdate);
            socket.off('waiting_message', handleWaitingMessage);
            socket.off('update_players', handlePlayerListUpdate);
            socket.off('new_message', handleWaitingMessage);
            socket.off('game_started', handleGameStarting);
            socket.off('new_question', handleNextQuestion);
            socket.off('room_info');
            socket.off('team_update');
            socket.off('team_error');
            socket.off('player_kicked');
            socket.off('profile_updated');
        };
    }, [roomCode, navigate, nickname, isHost, mode, initialAvatar, userId]);

    const handleUpdateProfile = () => {
        if (!editName.trim()) return;
        socket.emit('update_profile', { roomCode, nickname: editName, avatar: editAvatar });
        setShowProfileModal(false);
    };

    const addSystemMessage = (content) => {
        setMessages((prev) => [...prev, {
            id: Date.now() + Math.random(),
            type: 'system',
            content,
            timestamp: new Date().toISOString()
        }]);
    };

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || chatDisabled || !canSendMessage) return;

        socket.emit('send_waiting_message', { roomCode, message: newMessage.trim(), nickname: currentNickname });
        setNewMessage('');

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

    const toggleReady = () => {
        const newReadyState = !isReady;
        setIsReady(newReadyState);
        socket.emit('toggle_ready', { roomCode, isReady: newReadyState });
    };

    const joinTeam = (teamIndex, spotIndex) => {
        if (joinLoading) return;
        console.log(`CLIENT: Attempting to join team ${teamIndex} at spot ${spotIndex}. Room: ${roomCode}, Socket: ${socket.id}`);
        if (!isPreGame) {
            console.log('CLIENT: joinTeam failed - not in pre-game mode (actual mode:', mode, ')');
            return;
        }
        setJoinLoading(true);
        SoundManager.playClick();
        socket.emit('join_team', { roomCode, teamIndex, spotIndex });
    };

    const startGameNow = () => {
        socket.emit('start_game', { roomCode });
    };

    const startNextQuestion = () => {
        socket.emit('next_question', { roomCode });
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
            if (player.status === 'waiting') {
                return <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-lg">✅ أنهى</span>;
            }
            return <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-lg">🎯 يجيب</span>;
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
                        <div className="mt-4 flex justify-center">
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
                    )}
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

                            {/* Team Result Card (only between questions) */}
                            {isTeamMode && isBetweenQuestions && roundResultsState && (
                                <div className="bg-blue-600/10 border border-blue-500/30 rounded-2xl p-6 mb-6 animate-slide-up">
                                    <h3 className="text-blue-400 text-xs uppercase tracking-widest font-black mb-4 flex items-center gap-2">
                                        <span>🤝</span> تحدي الفريق
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                                            <span className="text-gray-400 text-sm">إجابتك:</span>
                                            <span className="font-bold text-white">{lastAnswer}</span>
                                        </div>

                                        {roundResultsState.waitingForTeammate ? (
                                            <div className="flex items-center justify-center gap-3 text-yellow-500 animate-pulse py-4 bg-yellow-500/5 rounded-xl border border-yellow-500/10">
                                                <span className="text-xl">⏳</span>
                                                <span className="font-bold text-sm">بانتظار إجابة زميلك ليكمل التحدي...</span>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                                                    <span className="text-gray-400 text-sm">إجابة زميلك:</span>
                                                    <span className={`font-bold ${roundResultsState.teamMatched ? 'text-green-400' : 'text-red-400'}`}>
                                                        {roundResultsState.teammateAnswer || '...'}
                                                    </span>
                                                </div>
                                                <div className={`p-4 rounded-xl text-center font-black ${roundResultsState.teamMatched && roundResultsState.isCorrect ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-500 border border-red-500/30'}`}>
                                                    {roundResultsState.teamMatched && roundResultsState.isCorrect ? '✨ تطابق رائع! ربحتم نقطة 🥩' : '❌ لم تتطابق الإجابات الصحيحة'}
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
                                                    {team.spots.map((spotId, sIdx) => {
                                                        const occupier = players.find(p => p.id === spotId);
                                                        const isMe = spotId === socket.id;
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
                                                ${player.id === socket.id
                                                    ? 'bg-blue-600/20 border-blue-500/50'
                                                    : isTeammate
                                                        ? 'bg-indigo-600/20 border-indigo-500/50'
                                                        : 'bg-gray-700/30 border-white/5'}
                                            `}
                                        >
                                            <div className={`w-2 h-2 rounded-full ${player.isOnline !== false ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                                            <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm shadow-inner relative group/avatar">
                                                {player.avatar || '👤'}
                                                {player.id === socket.id && (
                                                    <div onClick={() => setShowProfileModal(true)} className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 cursor-pointer">
                                                        ✏️
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
                                            {player.id !== socket.id && player.userId && (
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
                                        onClick={startGameNow}
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
                                        ➡️ السؤال التالي
                                    </button>
                                )}
                                {!isHost && isBetweenQuestions && (
                                    <div className="p-3 bg-gray-700/30 rounded-xl text-center text-[10px] text-gray-500">
                                        بانتظار المضيف للسؤال التالي...
                                    </div>
                                )}
                            </div>
                        </div>

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
                    <div className="lg:col-span-2 bg-gray-800/40 backdrop-blur-md rounded-3xl border border-gray-700/50 flex flex-col h-[600px]">
                        <div className="p-4 border-b border-white/5 flex items-center gap-3">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            <h3 className="font-bold">💬 المحادثة</h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex flex-col ${msg.type === 'system' ? 'items-center' : (msg.senderId === socket.id ? 'items-end' : 'items-start')}`}>
                                    {msg.type === 'system' ? (
                                        <div className="bg-blue-500/10 text-blue-400 text-[10px] px-3 py-1 rounded-full border border-blue-500/10">
                                            📢 {msg.content}
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <span className={`text-[10px] font-bold ${msg.senderId === socket.id ? 'text-blue-400' : 'text-purple-400'}`}>
                                                    {msg.senderId === socket.id ? 'أنت' : msg.sender}
                                                </span>
                                            </div>
                                            <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-sm ${msg.senderId === socket.id ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-700 text-gray-200 rounded-tl-none'}`}>
                                                {msg.text}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 flex gap-2">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
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
            </div>

            {/* Profile Modal */}
            {showProfileModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-800 border border-gray-700 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-center">تعديل الملف الشخصي</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-xs mb-2 text-right">الاسم</label>
                                <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 text-center"
                                />
                            </div>
                            <div>
                                <label className="block text-gray-400 text-xs mb-2 text-right">الصورة الرمزية</label>
                                <div className="flex flex-wrap justify-center gap-2 max-h-40 overflow-y-auto p-2">
                                    {['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '👽', '🤖', '👾', '👻'].map((av) => (
                                        <button
                                            key={av}
                                            onClick={() => setEditAvatar(av)}
                                            className={`w-10 h-10 text-xl rounded-full border-2 flex items-center justify-center transition-all ${editAvatar === av ? 'bg-blue-500/20 border-blue-500 scale-110' : 'bg-gray-700/50 border-gray-600'}`}
                                        >
                                            {av}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setShowProfileModal(false)} className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-300 font-bold">إلغاء</button>
                                <button onClick={handleUpdateProfile} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold">حفظ</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WaitingRoom;

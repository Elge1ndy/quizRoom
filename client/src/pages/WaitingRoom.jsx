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
        avatar: initialAvatar,
        players: initialPlayers,
        mode = 'pre-game',
        userId: stateUserId,
        pack: initialPack,
        gameSettings: initialSettings,
    } = location.state || {};

    // Restore user/nickname from localStorage if missing (direct link case)
    const [nickname] = React.useState(stateNickname || localStorage.getItem('quiz_nickname') || '');
    const [userId] = React.useState(stateUserId || getPersistentUserId());

    const [players, setPlayers] = React.useState(initialPlayers || []);
    const [isTeamMode, setIsTeamMode] = React.useState(location.state?.isTeamMode || false);
    const [teams, setTeams] = React.useState(location.state?.room?.teams || null);

    // Check ref pattern for event listeners
    const playersRef = React.useRef(players);
    React.useEffect(() => {
        playersRef.current = players;
    }, [players]);

    // Pack & Settings State
    const [packInfo, setPackInfo] = React.useState(initialPack || null);
    const [settings, setSettings] = React.useState(initialSettings || null);

    const packInfoRef = React.useRef(packInfo);
    React.useEffect(() => {
        packInfoRef.current = packInfo;
    }, [packInfo]);

    const [messages, setMessages] = React.useState([]);
    const [newMessage, setNewMessage] = React.useState('');
    const [isReady, setIsReady] = React.useState(false);

    // Audio recording states
    const [isRecording, setIsRecording] = React.useState(false);
    const [isUploadingAudio, setIsUploadingAudio] = React.useState(false);
    const mediaRecorderRef = React.useRef(null);
    const audioChunksRef = React.useRef([]);

    // Host Logic State
    const { showToast } = useToast();
    const [canSendMessage, setCanSendMessage] = React.useState(true);
    const [spamCountdown, setSpamCountdown] = React.useState(0);
    const [showRules, setShowRules] = React.useState(false);
    const [joinLoading, setJoinLoading] = React.useState(false);
    const [typingUsers, setTypingUsers] = React.useState([]);
    const typingTimeoutRef = React.useRef(null);
    const navigatingRef = React.useRef(false);
    const cleanupRefs = React.useRef({});

    React.useEffect(() => {
        navigatingRef.current = false;
    }, []);

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
            title: p.name || p.title || 'بدون عنوان',
            questions: p.data || [],
            questionCount: (p.data || []).length
        }))];
        setAvailablePacks(allPacks);
        setJoinLoading(false);
        setShowPackModal(true);
        if (packInfo) setSelectedNewPackId(packInfo.id);
    };

    const handleConfirmPlayAgain = async () => {
        if (!selectedNewPackId) return;
        const pack = availablePacks.find(p => p.id === selectedNewPackId);
        const timeLimit = settings?.timeLimit || 30;
        const timerEnd = new Date(Date.now() + timeLimit * 1000).toISOString();

        await supabase.from('rooms').update({
            state: 'playing',
            pack_data: pack,
            current_question_index: 0,
            timer_end_at: timerEnd,
            settings: { ...settings, questionStartTime: new Date().toISOString(), timeLimit }
        }).eq('room_code', roomCode);

        // Reset player answers/results for the new session
        await supabase.from('room_players')
            .update({ last_answer: null, is_correct: null, has_answered: false })
            .eq('room_code', roomCode);

        // Clear old answers
        await supabase.from('answers').delete().eq('room_code', roomCode);

        const firstQuestionPayload = {
            ...pack.questions[0],
            index: 0,
            total: pack.questions.length,
            allQuestions: pack.questions,
            timeLeft: timeLimit,
            timer_end_at: timerEnd
        };
        realtime.broadcast('game_started', firstQuestionPayload);
        setShowPackModal(false);
    };

    // Dynamic Player Identification
    const deviceId = getPersistentDeviceId();
    const myself = players.find(p => p.id === deviceId) || players.find(p => p.player_id === deviceId) || players.find(p => p.nickname === nickname);

    // Force host override (set during migration to guarantee immediate UI update)
    const [forceIsHost, setForceIsHost] = React.useState(false);
    const isHost = forceIsHost || myself?.isHost || myself?.is_host || false;

    const { friends, pendingRequests, sendFriendRequest } = useFriendSystem();

    const messagesEndRef = React.useRef(null);
    const spamTimerRef = React.useRef(null);

    const MAX_MESSAGE_LENGTH = 100;
    const SPAM_DELAY_SECONDS = 3;

    const isPreGame = mode === 'pre-game';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load packs for host during pre-game
    React.useEffect(() => {
        if (isHost && isPreGame) {
            const loadPacks = async () => {
                const { data: customPacks } = await supabase.from('custom_packs').select('*');
                const allPacks = [...defaultPacks, ...(customPacks || []).map(p => ({
                    id: `custom_${p.id}`,
                    title: p.name || p.title || 'بدون عنوان',
                    questions: p.data || [],
                    questionCount: (p.data || []).length
                }))];
                setAvailablePacks(allPacks);
            };
            loadPacks();
        }
    }, [isHost, isPreGame]);

    // Event Handlers for Socket
    // Event Handlers for Realtime
    const handleConnect = React.useCallback(async () => {
        await realtime.joinRoom(roomCode, { deviceId: getPersistentDeviceId(), nickname, avatar: initialAvatar, userId });
    }, [roomCode, nickname, userId, initialAvatar]);

    const handlePlayerListUpdate = React.useCallback((updatedPlayers) => {
        setPlayers(updatedPlayers);
    }, []);

    const handleWaitingMessage = React.useCallback((msg) => {
        setMessages(prev => {
            // Use msg.id for deduplication (fallback to content+created_at if id missing)
            const msgId = msg.id || `${msg.content}-${msg.created_at}`;
            if (prev.find(m => (m.id || `${m.content}-${m.created_at}`) === msgId)) return prev;

            return [...prev, msg].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
    }, []);

    const handleGameStarting = React.useCallback((questionData) => {
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        navigate('/game', {
            state: {
                roomCode,
                nickname: nickname,
                userId,
                initialQuestion: questionData,
                role: isHost ? 'host' : 'player',
                pack: packInfoRef.current,
                settings: settings
            }
        });
    }, [navigate, roomCode, nickname, userId, isHost, settings]);

    const handleNewQuestionReceived = React.useCallback((q) => {
        if (navigatingRef.current) return;
        navigatingRef.current = true;
        navigate('/game', {
            state: {
                roomCode,
                nickname: nickname,
                userId,
                initialQuestion: q,
                role: isHost ? 'host' : 'player',
                pack: packInfoRef.current,
                settings: settings
            }
        });
    }, [navigate, roomCode, nickname, userId, isHost, settings]);

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

        // SoundManager will initialize lazily on first sound play (user interaction)

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
                    .maybeSingle();

                if (roomError || !roomData) {
                    console.error("Room fetch error:", roomError);
                    showToast("❌ الغرفة غير موجودة أو تم إغلاقها", "error");
                    navigate('/join');
                    return;
                }

                setIsTeamMode(roomData.settings?.isTeamMode || false);
                setSettings(roomData.settings);
                setPackInfo(roomData.pack_data);

                // Late Join / Re-entry Logic: If room is already playing, jump into GameScreen
                const myPlayerData = roomData.room_players?.find(p => p.player_id === deviceId);
                const amIHost = myPlayerData?.is_host === true;
                const hasAnsweredCurrent = myPlayerData?.has_answered === true;

                // Save roomCode for hydration/recovery
                localStorage.setItem('last_room_code', roomCode);

                if (roomData.state === 'playing' && mode !== 'between-questions' && mode !== 'results' && !navigatingRef.current) {
                    const qIndex = roomData.current_question_index || 0;
                    const pack = roomData.pack_data;
                    const question = pack?.questions[qIndex];

                    if (question) {
                        let initialTimeLeft = 30;
                        const timerEndAt = roomData.timer_end_at;
                        if (timerEndAt) {
                            const end = new Date(timerEndAt).getTime();
                            const now = Date.now();
                            initialTimeLeft = Math.max(0, Math.ceil((end - now) / 1000));
                        } else {
                            const startTime = roomData.settings?.questionStartTime;
                            if (startTime) {
                                const diffSeconds = Math.floor((new Date() - new Date(startTime)) / 1000);
                                const timeLimit = roomData.settings?.timeLimit || 30;
                                initialTimeLeft = Math.max(0, timeLimit - diffSeconds);
                            }
                        }

                        if (amIHost || initialTimeLeft > 3 || hasAnsweredCurrent) {
                            navigatingRef.current = true;
                            navigate('/game', {
                                state: {
                                    roomCode,
                                    nickname,
                                    role: amIHost ? 'host' : 'player',
                                    initialQuestion: { ...question, index: qIndex, total: pack.questions.length, timeLeft: initialTimeLeft, timer_end_at: timerEndAt },
                                    userId,
                                    pack: roomData.pack_data,
                                    preAnswered: hasAnsweredCurrent,
                                    settings: roomData.settings
                                }
                            });
                            return;
                        }
                    }
                }

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
                const { data: chatData, error: chatFetchError } = await supabase
                    .from('chat_messages')
                    .select('*')
                    .eq('room_code', roomCode)
                    .order('created_at', { ascending: true })
                    .limit(50);

                if (chatData) {
                    const mappedMessages = chatData.map(m => ({
                        id: m.id,
                        room_code: m.room_code,
                        sender_id: m.sender_id,
                        sender_nickname: m.sender_nickname,
                        content: m.content,
                        type: m.type,
                        created_at: m.created_at
                    }));
                    setMessages(mappedMessages);
                }

                // 5. Restore Host State if refreshed
                if (isHost) {
                    const savedState = sessionStorage.getItem(`host_state_${roomCode}`);
                    if (savedState) {
                        const { pack } = JSON.parse(savedState);
                        if (pack) setPackInfo(pack);
                    }
                }

                // 4. Set Listeners
                const onPresenceSync = async () => {
                    const state = realtime.getPresenceState();
                    const onlineDeviceIds = Object.values(state)
                        .flat()
                        .map(p => p.deviceId);

                    // Use Ref to get latest players without stale closure
                    const currentPlayers = playersRef.current;

                    const updated = currentPlayers.map(p => ({
                        ...p,
                        isOnline: onlineDeviceIds.includes(p.player_id)
                    }));

                    // Instant Host Migration Logic
                    const currentHost = updated.find(p => p.isHost);
                    const isHostOffline = currentHost && !onlineDeviceIds.includes(currentHost.player_id);

                    let finalPlayers = updated;

                    if (isHostOffline) {
                        const onlinePlayers = updated.filter(p => onlineDeviceIds.includes(p.player_id))
                            .sort((a, b) => a.player_id.localeCompare(b.player_id));

                        if (onlinePlayers.length > 0) {
                            const newHostCandidate = onlinePlayers[0];
                            const isMeNewHost = newHostCandidate.player_id === deviceId;

                            if (isMeNewHost) {
                                // Side effects here are safe (not during render)
                                supabase.from('rooms').update({ host_id: deviceId }).eq('room_code', roomCode).then();
                                supabase.from('room_players').update({ is_host: false }).eq('room_code', roomCode).eq('is_host', true).then();
                                supabase.from('room_players').update({ is_host: true }).eq('room_code', roomCode).eq('player_id', deviceId).then();

                                showToast("👑 لقد أصبحت المضيف الجديد للغرفة!", "info");

                                // Force UI to recognize host immediately
                                setForceIsHost(true);
                            }

                            // Update local state to reflect new host immediately
                            finalPlayers = updated.map(p => {
                                if (p.player_id === newHostCandidate.player_id) {
                                    return { ...p, isHost: true, is_host: true };
                                }
                                if (p.isHost || p.is_host) {
                                    return { ...p, isHost: false, is_host: false };
                                }
                                return p;
                            });
                        }
                    }

                    setPlayers(finalPlayers);
                };

                const onNewMessage = (msg) => {
                    handleWaitingMessage(msg);
                };

                const onGameStarting = (questionData) => {
                    handleGameStarting(questionData);
                };

                const onNewQuestion = (questionData) => {
                    handleNewQuestionReceived(questionData);
                };

                const onSettingsUpdated = (newSettings) => {
                    setSettings(newSettings);
                };

                const onPlayerKicked = ({ kickedDeviceId, playerId }) => {
                    if ((kickedDeviceId || playerId) === deviceId) {
                        alert("تم طردك");
                        navigate('/');
                    }
                };

                const onTyping = ({ nickname: typingNick, isTyping }) => {
                    setTypingUsers(prev => {
                        if (isTyping) {
                            if (prev.includes(typingNick)) return prev;
                            return [...prev, typingNick];
                        } else {
                            return prev.filter(n => n !== typingNick);
                        }
                    });
                };

                const onGameOver = (results) => {
                    navigate('/results', { state: { ...results, role: isHost ? 'host' : 'player', roomCode, nickname, userId } });
                };

                // Store refs for cleanup
                cleanupRefs.current = {
                    onPresenceSync, onNewMessage, onGameStarting, onNewQuestion,
                    onSettingsUpdated, onPlayerKicked, onTyping, onGameOver
                };

                realtime.on('presence_sync', onPresenceSync);
                realtime.on('new_message', onNewMessage);
                realtime.on('game_started', onGameStarting);
                realtime.on('new_question', onNewQuestion);
                realtime.on('settings_updated', onSettingsUpdated);
                realtime.on('player_kicked', onPlayerKicked);
                realtime.on('typing', onTyping);
                realtime.on('game_over', onGameOver);
            } catch (err) {
                console.error("Realtime init error:", err);
            }
        };

        initializeRealtime();

        return () => {
            // Clean up ONLY this component's listeners using refs
            const h = cleanupRefs.current;
            if (h.onPresenceSync) realtime.off('presence_sync', h.onPresenceSync);
            if (h.onNewMessage) realtime.off('new_message', h.onNewMessage);
            if (h.onGameStarting) realtime.off('game_started', h.onGameStarting);
            if (h.onNewQuestion) realtime.off('new_question', h.onNewQuestion);
            if (h.onSettingsUpdated) realtime.off('settings_updated', h.onSettingsUpdated);
            if (h.onPlayerKicked) realtime.off('player_kicked', h.onPlayerKicked);
            if (h.onTyping) realtime.off('typing', h.onTyping);
            if (h.onGameOver) realtime.off('game_over', h.onGameOver);
            cleanupRefs.current = {};
            
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
        };
    }, [roomCode]); // Reduced dependencies to prevent unnecessary reconnections

    // Cleanup Room when last player leaves (Tab close / Navigate away)
    React.useEffect(() => {
        const handleUnload = () => {
            const deviceId = getPersistentDeviceId();
            if (!roomCode || !deviceId) return;

            // Only remove self — cleanupIfEmpty handles room deletion if empty
            supabase.from('room_players').delete()
                .eq('room_code', roomCode)
                .eq('player_id', deviceId);
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [roomCode]);

    // Heartbeat: keep room alive while players are present
    React.useEffect(() => {
        if (!roomCode) return;
        const interval = setInterval(() => {
            supabase.from('rooms').update({ last_activity_at: new Date().toISOString() }).eq('room_code', roomCode).then();
        }, 30000);
        return () => clearInterval(interval);
    }, [roomCode]);

    // Auto-cleanup empty rooms on mount
    React.useEffect(() => {
        if (!roomCode) return;
        const checkAndCleanup = async () => {
            try {
                const { data: roomPlayers } = await supabase
                    .from('room_players')
                    .select('player_id')
                    .eq('room_code', roomCode);
                if (!roomPlayers || roomPlayers.length === 0) {
                    await supabase.from('rooms').delete().eq('room_code', roomCode);
                    navigate('/join');
                }
            } catch (e) {}
        };
        checkAndCleanup();
    }, [roomCode]);

    const addSystemMessage = async (content) => {
        const msg = {
            id: Date.now() + Math.random(),
            room_code: roomCode,
            content,
            type: 'system',
            created_at: new Date().toISOString()
        };
        // 1. Add locally
        handleWaitingMessage(msg);

        // 2. Broadcast for others
        realtime.broadcast('new_message', msg);

        // 3. Also save to DB (Match Schema)
        const msgToInsert = {
            room_code: roomCode,
            sender_nickname: 'System',
            content: content,
            type: 'system',
            created_at: msg.created_at
        };
        await supabase.from('chat_messages').insert(msgToInsert);
    };




    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await uploadAndSendAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            showToast("فشل الوصول إلى الميكروفون. يرجى التأكد من السماح للمتصفح.", "error");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const uploadAndSendAudio = async (audioBlob) => {
        setIsUploadingAudio(true);
        try {
            // Convert Blob to Base64 to bypass Supabase Storage limitations
            const base64Audio = await blobToBase64(audioBlob);

            const deviceId = getPersistentDeviceId();
            const msg = {
                id: Date.now() + Math.random(),
                room_code: roomCode,
                sender_id: deviceId,
                sender_nickname: nickname,
                content: base64Audio,
                type: 'audio',
                created_at: new Date().toISOString()
            };

            realtime.broadcast('new_message', msg);
            
            const msgToInsert = {
                room_code: roomCode,
                sender_id: deviceId,
                sender_nickname: nickname,
                content: base64Audio,
                type: 'audio',
                created_at: msg.created_at
            };
            await supabase.from('chat_messages').insert(msgToInsert);
        } catch (error) {
            console.error("Error processing audio:", error);
            showToast("حدث خطأ أثناء إرسال الرسالة الصوتية", "error");
        } finally {
            setIsUploadingAudio(false);
        }
    };

    const handleSendMessage = async (e) => {

        e.preventDefault();
        if (!newMessage.trim() || !canSendMessage) return;

        const deviceId = getPersistentDeviceId();
        const msg = {
            id: Date.now() + Math.random(), // Unique ID for local deduplication
            room_code: roomCode,
            sender_id: deviceId,
            sender_nickname: nickname,
            content: newMessage.trim(),
            type: 'user',
            created_at: new Date().toISOString()
        };

        // 1. Add locally first
        handleWaitingMessage(msg);

        // 2. Broadcast immediately for UX
        realtime.broadcast('new_message', msg);

        // 2. Clear Input
        setNewMessage('');

        // 3. Save to DB (Match Schema)
        const msgToInsert = {
            room_code: roomCode,
            sender_id: deviceId,
            sender_nickname: nickname,
            content: newMessage.trim(),
            type: 'user',
            created_at: msg.created_at
        };
        await supabase.from('chat_messages').insert(msgToInsert);

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

    const cleanupIfEmpty = async () => {
        const deviceId = getPersistentDeviceId();
        try {
            await supabase.from('room_players').delete().eq('room_code', roomCode).eq('player_id', deviceId);

            // Check remaining players
            const { data: remaining } = await supabase
                .from('room_players')
                .select('player_id')
                .eq('room_code', roomCode);

            if (!remaining || remaining.length === 0) {
                await supabase.from('rooms').delete().eq('room_code', roomCode);
            } else {
                // Update activity timestamp
                await supabase.from('rooms').update({ last_activity_at: new Date().toISOString() }).eq('room_code', roomCode);
            }
        } catch (err) {
            console.error("Cleanup error:", err);
        }
    };

    const handleReturnHome = async () => {
        if (window.confirm("هل أنت متأكد من العودة للقائمة الرئيسية؟")) {
            await cleanupIfEmpty();
            navigate('/');
        }
    };

    const handleStartGame = async () => {
        if (!packInfo) {
            showToast("❌ لم يتم اختيار الباقة بعد", "error");
            return;
        }

        if (!packInfo.questions || packInfo.questions.length === 0) {
            showToast("❌ الباقة فارغة - لا توجد أسئلة", "error");
            return;
        }

        // 2. Prepare questions (Randomly chosen subset if needed)
        let gameQuestions = [...packInfo.questions];
        // Fisher-Yates shuffle
        for (let i = gameQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gameQuestions[i], gameQuestions[j]] = [gameQuestions[j], gameQuestions[i]];
        }
        const requestedCount = settings?.questionCount || 10;
        gameQuestions = gameQuestions.slice(0, requestedCount);

        const updatedPack = { ...packInfo, questions: gameQuestions, questionCount: gameQuestions.length };

        // 1. Update Room State in DB
        const timeLimit = settings?.timeLimit || 30;
        const timerEnd = new Date(Date.now() + timeLimit * 1000).toISOString();

        const { error } = await supabase
            .from('rooms')
            .update({
                state: 'playing',
                current_question_index: 0,
                timer_end_at: timerEnd,
                updated_at: new Date().toISOString(),
                settings: { ...(settings || {}), questionStartTime: new Date().toISOString(), timeLimit },
                pack_data: updatedPack
            })
            .eq('room_code', roomCode);


        if (error) {
            showToast("❌ فشل بدء اللعبة", "error");
            return;
        }

        // Reset old answers from previous games/tests
        await supabase
            .from('room_players')
            .update({ last_answer: null, is_correct: null, has_answered: false })
            .eq('room_code', roomCode);

        // Update local packInfo to match the shuffled one
        setPackInfo(updatedPack);

        // 3. Broadcast Game Start signal with first question
        const firstQuestionRaw = updatedPack.questions[0];
        const firstQuestionPayload = {
            ...firstQuestionRaw,
            index: 0,
            total: updatedPack.questions.length,
            allQuestions: updatedPack.questions,
            timeLeft: timeLimit,
            timer_end_at: timerEnd
        };


        realtime.broadcast('game_started', firstQuestionPayload);


        realtime.broadcast('new_message', {
            id: Date.now(),
            sender_id: 'system',
            sender_nickname: 'System',
            content: "📢 بدأ السؤال",
            type: 'system',
            room_code: roomCode,
            created_at: new Date().toISOString()
        });

        // 3. Navigation is handled by the receiver and the host themselves
        handleGameStarting(firstQuestionPayload);
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

    const getPlayerStatus = (player) => {
        if (player.isHost) return null;
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
                        {'🎮 اللعبة جاهزة'}
                    </h1>
                    <p className="text-gray-400 text-lg">{'انتظر حتى يبدأ المضيف'}</p>
                </div>

            </div>

            {/* Pack Info Card - [NEW] */}
            <div className="flex flex-col items-center mb-8 gap-4">
                <div className="bg-gray-800/60 backdrop-blur-xl p-4 rounded-2xl border border-gray-700 flex items-center gap-4 animate-fade-in-up w-full max-w-md">
                    <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center text-2xl">
                        {packInfo?.icon || '📦'}
                    </div>
                    <div className="flex-1">
                        <div className="font-bold text-base text-gray-200">{packInfo?.title || packInfo?.name || 'جاري تحميل الحزمة...'}</div>
                        <div className="text-xs text-gray-400 font-bold flex gap-3 mt-1">
                            {packInfo?.questionCount && <span>❓ {packInfo.questionCount} سؤال</span>}
                            {(packInfo?.timeLimit || settings?.timeLimit) && <span>⏱️ {packInfo?.timeLimit || settings?.timeLimit} ثانية</span>}
                        </div>
                    </div>
                </div>

                {/* Pack Selector for Host (during pre-game) */}
                {isHost && isPreGame && availablePacks.length > 0 && (
                    <div className="bg-gray-800/60 backdrop-blur-xl p-4 rounded-3xl border border-gray-700 w-full max-w-md animate-fade-in-up">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">📦 اختر الحزمة</h3>
                            <span className="text-[10px] text-gray-500">انقر للتغيير</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                            {availablePacks.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        setPackInfo(p);
                                        setSelectedNewPackId(p.id);
                                        realtime.broadcast('settings_updated', { packId: p.id });
                                        supabase.from('rooms').update({ pack_data: p }).eq('room_code', roomCode);
                                    }}
                                    className={`p-2 rounded-xl text-center transition-all text-xs font-bold ${
                                        packInfo?.id === p.id
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                                >
                                    <div className="text-lg mb-1">{p.icon || '📦'}</div>
                                    <div className="truncate">{p.title || p.name}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Question Count Selector (Visible to all, editable by host) */}
                {isPreGame && (
                    <div className="bg-gray-800/60 backdrop-blur-xl p-6 rounded-3xl border border-gray-700 w-full max-w-md animate-fade-in-up delay-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">عدد الأسئلة</h3>
                            <span className="bg-blue-600 px-3 py-1 rounded-full text-xs font-black">{settings?.questionCount || 10}</span>
                        </div>

                        {isHost ? (
                            <div className="space-y-4">
                                <input
                                    type="range"
                                    min="1"
                                    max={packInfo?.questions?.length || 50}
                                    value={settings?.questionCount || 10}
                                    onChange={(e) => {
                                        const count = parseInt(e.target.value);
                                        const newSettings = { ...settings, questionCount: count };
                                        setSettings(newSettings);
                                        // Broadcast to all players
                                        realtime.broadcast('settings_updated', newSettings);
                                        // Update DB
                                        supabase.from('rooms').update({ settings: newSettings }).eq('room_code', roomCode).then();
                                    }}
                                    className="w-full accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                                    <span>1</span>
                                    <span>{packInfo?.questions?.length || 50}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-2 bg-gray-700 rounded-lg overflow-hidden relative">
                                <div
                                    className="h-full bg-blue-600 transition-all duration-500"
                                    style={{ width: `${((settings?.questionCount || 10) / (packInfo?.questions?.length || 50)) * 100}%` }}
                                />
                            </div>
                        )}
                        <p className="text-[10px] text-gray-500 mt-3 text-center italic">
                            {isHost ? "اسحب لتحديد عدد الأسئلة لهذه الجولة" : "المضيف يقوم بتحديد عدد الأسئلة..."}
                        </p>
                    </div>
                )}

                {/* Time Limit Selector (Visible to all, editable by host) */}
                {isPreGame && (
                    <div className="bg-gray-800/60 backdrop-blur-xl p-6 rounded-3xl border border-gray-700 w-full max-w-md animate-fade-in-up delay-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">⏱️ مدة السؤال</h3>
                            <span className="bg-purple-600 px-3 py-1 rounded-full text-xs font-black">{settings?.timeLimit || 30} ثانية</span>
                        </div>

                        {isHost ? (
                            <div className="space-y-4">
                                <input
                                    type="range"
                                    min="10"
                                    max="120"
                                    value={settings?.timeLimit || 30}
                                    onChange={(e) => {
                                        const limit = parseInt(e.target.value);
                                        const newSettings = { ...settings, timeLimit: limit };
                                        setSettings(newSettings);
                                        realtime.broadcast('settings_updated', newSettings);
                                        supabase.from('rooms').update({ settings: newSettings }).eq('room_code', roomCode).then();
                                    }}
                                    className="w-full accent-purple-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                                    <span>10 ث</span>
                                    <span>120 ث</span>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-2 bg-gray-700 rounded-lg overflow-hidden relative">
                                <div
                                    className="h-full bg-purple-600 transition-all duration-500"
                                    style={{ width: `${(((settings?.timeLimit || 30) - 10) / 110) * 100}%` }}
                                />
                            </div>
                        )}
                        <p className="text-[10px] text-gray-500 mt-3 text-center italic">
                            {isHost ? "اسحب لتحديد مدة الإجابة على كل سؤال" : "المضيف يقوم بتحديد مدة الإجابة..."}
                        </p>
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
                        </div>

                        {/* Team Selection UI (Pre-game only) */}
                        {isPreGame && isTeamMode && (
                            <div className="mb-6 animate-fade-in bg-black/20 p-4 rounded-2xl border border-white/5">
                                <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-center">
                                    اختر فريقك 🤝
                                </h3>
                                <div className="grid grid-cols-1 gap-3">
                                    {(teams || Array.from({ length: 6 }, (_, i) => ({ id: i, name: `الفريق ${i + 1}`, spots: [null, null] }))).map((team, tIdx) => (
                                        <div key={team.id || `team-${tIdx}`} className="bg-white/5 rounded-xl border border-white/5 p-3">
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
                            {players.map((player, pIdx) => {
                                const isTeammate = isTeamMode && myself?.teammateId === (player.player_id || player.id);
                                return (
                                    <div
                                        key={player.player_id || player.id || `p-list-${pIdx}`}
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
                                        {player.id !== deviceId && (
                                            <div className="flex items-center gap-1">
                                                {friends.some(f => f.id === (player.device_id || player.player_id)) ? (
                                                    <span className="text-[8px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded font-black">صديق ✓</span>
                                                ) : pendingRequests.includes(player.device_id || player.player_id) ? (
                                                    <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded animate-pulse font-black">انتظار</span>
                                                ) : (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); sendFriendRequest(player.device_id || player.player_id); }}
                                                        className="text-[10px] bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 w-6 h-6 flex items-center justify-center rounded-lg transition-colors"
                                                        title="إضافة صديق"
                                                    >
                                                        +
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

                            {mode === 'finished' && (
                                <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl mb-4 text-center">
                                    <p className="text-blue-200 font-bold mb-1">🎉 الجولة انتهت!</p>
                                    <p className="text-[10px] text-blue-400">يمكنك اختيار حزمة أسئلة جديدة واللعب مرة أخرى.</p>
                                </div>
                            )}

                            {/* [NEW] Leave Room Button */}
                            <button
                                onClick={async () => {
                                    if (window.confirm("🚪 هل أنت متأكد من مغادرة الغرفة؟")) {
                                        await cleanupIfEmpty();
                                        await realtime.leaveRoom();
                                        navigate('/');
                                    }
                                }}
                                className="w-full py-3 rounded-xl font-bold text-sm bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 transition-all shadow-lg hover:shadow-red-900/30 flex items-center justify-center gap-2 mt-2"
                            >
                                <span>🚪</span>
                                <span>مغادرة</span>
                            </button>
                        </div>
                    </div>
                    {/* Host Actions (Start/Cancel) */}
                    {isHost && (
                        <div className="flex gap-4 mb-6">
                            {isPreGame && (
                                <button
                                    onClick={handleStartGame}
                                    disabled={!packInfo}
                                    className={`flex-1 bg-gradient-to-r from-green-500 to-emerald-600 p-4 rounded-xl flex items-center justify-center gap-2 font-black text-white shadow-lg shadow-green-900/20 hover:scale-105 active:scale-95 transition-all ${!packInfo ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                                >
                                    <span className="text-xl">🚀</span>
                                    <span>ابدأ اللعبة</span>
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
                                                        <span className="bg-black/20 px-2 py-1 rounded-md">❓ {pack?.questionCount || 0} سؤال</span>
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
                                            {msg.type === 'audio' ? (
                                                <audio controls src={msg.content} className="max-w-full w-[200px] h-8 mt-1 rounded-full outline-none" />
                                            ) : (
                                                msg.content
                                            )}
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

                    <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 flex gap-2 items-center">
                        <button
                            type="button"
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={isUploadingAudio}
                            className={`p-2 rounded-full transition-colors flex-shrink-0 w-10 h-10 flex items-center justify-center ${
                                isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            }`}
                            title={isRecording ? "إيقاف التسجيل" : "تسجيل رسالة صوتية"}
                        >
                            {isRecording ? '⏹' : '🎤'}
                        </button>
                        <input
                            type="text"
                            value={newMessage}
                            onChange={handleInputChange}
                            placeholder={isRecording ? "جاري التسجيل..." : isUploadingAudio ? "جاري الرفع..." : "اكتب رسالة..."}
                            disabled={isRecording || isUploadingAudio}
                            className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim() || !canSendMessage || isRecording || isUploadingAudio}
                            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full font-bold text-sm disabled:opacity-50 transition-colors flex-shrink-0 h-10 px-4 flex items-center justify-center"
                        >
                            {canSendMessage ? 'أرسل' : `${spamCountdown}s`}
                        </button>
                    </form>
                </div>
            </div>


        </div >
    );
};

export default WaitingRoom;

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import { useToast } from '../context/ToastContext';
import SoundManager from '../utils/SoundManager';
import { getPersistentDeviceId } from '../utils/userAuth';

const GameScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { roomCode, nickname, role, initialQuestion, userId, pack: statePack, preAnswered, settings: roomSettings, isSpectating: isSpectatingProp } = location.state || {};
    const isSpectating = isSpectatingProp || false;

    const deviceId = getPersistentDeviceId();

    // Core state
    const [question, setQuestion] = React.useState(initialQuestion || null);
    const [packInfo, setPackInfo] = React.useState(statePack || initialQuestion?.allQuestions ? { questions: initialQuestion.allQuestions } : null);
    const [timeLeft, setTimeLeft] = React.useState(initialQuestion?.timeLeft || 30);
    const [hasAnswered, setHasAnswered] = React.useState(preAnswered || false);
    const [selectedAnswer, setSelectedAnswer] = React.useState(null);
    const [score, setScore] = React.useState(0);
    const [isHost, setIsHost] = React.useState(role === 'host');
    const [isConnected, setIsConnected] = React.useState(false);
    const [manualAnswer, setManualAnswer] = React.useState('');
    const [players, setPlayers] = React.useState([]);
    const [roundResults, setRoundResults] = React.useState(null);
    const [view, setView] = React.useState(preAnswered ? 'waiting' : 'question');

    // Bonus tracking
    const [questionStartTime, setQuestionStartTime] = React.useState(null);
    const [consecutiveCorrect, setConsecutiveCorrect] = React.useState(0);

    // Chat state
    const [messages, setMessages] = React.useState([]);
    const [newMessage, setNewMessage] = React.useState('');
    const [canSendMessage, setCanSendMessage] = React.useState(true);
    const [spamCountdown, setSpamCountdown] = React.useState(0);
    const spamTimerRef = React.useRef(null);
    const messagesEndRef = React.useRef(null);

    // Refs
    const navigatingRef = React.useRef(false);
    const roundProcessingRef = React.useRef(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    React.useEffect(() => { scrollToBottom(); }, [messages]);

    const vibrate = (pattern) => {
        try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
    };

    const cleanupIfEmpty = async () => {
        try {
            await supabase.from('room_players').delete().eq('room_code', roomCode).eq('player_id', deviceId);

            const { data: remaining } = await supabase
                .from('room_players')
                .select('player_id')
                .eq('room_code', roomCode);

            if (!remaining || remaining.length === 0) {
                await supabase.from('rooms').delete().eq('room_code', roomCode);
            } else {
                await supabase.from('rooms').update({ last_activity_at: new Date().toISOString() }).eq('room_code', roomCode);
            }
        } catch (err) {
            console.error("Cleanup error:", err);
        }
    };

    // ==================== REALTIME ====================
    React.useEffect(() => {
        const initializeRealtime = async () => {
            if (!roomCode || !nickname) {
                const lastRoomCode = localStorage.getItem('last_room_code');
                if (lastRoomCode) navigate(`/waiting/${lastRoomCode}`);
                else navigate('/');
                return;
            }

            await realtime.joinRoom(roomCode, { deviceId, nickname, isHost });
            setIsConnected(true);

            const handleNewQuestion = (q) => {
                setQuestion(q);
                if (q.allQuestions) setPackInfo({ questions: q.allQuestions });
                setView('question');
                setHasAnswered(false);
                setSelectedAnswer(null);
                setManualAnswer('');
                roundProcessingRef.current = false;
                setRoundResults(null);
                setQuestionStartTime(Date.now());

                if (q.timer_end_at) {
                    const end = new Date(q.timer_end_at).getTime();
                    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
                    setTimeLeft(remaining);
                } else {
                    setTimeLeft(q.timeLeft || 30);
                }
            };

            const handleRoundEnded = (results) => {
                setRoundResults(results);
                setPlayers(results.scores || []);
                setView('results');
                vibrate([200, 100, 200]);
            };

            const handleGameOver = (results) => {
                navigate('/results', { state: { ...results, scores: results.scores || [], role: isHost ? 'host' : 'player', roomCode, nickname, userId } });
            };

            const handleAnswerSubmitted = async () => {
                if (!isHost) return;
                const { count } = await supabase
                    .from('room_players')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_code', roomCode)
                    .eq('has_answered', true);
                const { count: total } = await supabase
                    .from('room_players')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_code', roomCode);
                if (count >= total) {
                    handleEndRound();
                }
            };

            const handleNewMessage = (msg) => {
                setMessages(prev => {
                    const msgId = msg.id || `${msg.content}-${msg.created_at}`;
                    if (prev.find(m => (m.id || `${m.content}-${m.created_at}`) === msgId)) return prev;
                    return [...prev, msg].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                });
            };

            const handlePlayerJoined = (updatedPlayers) => {
                const myself = updatedPlayers.find(p => p.id === deviceId);
                if (myself) setIsHost(myself.isHost);
                setPlayers(updatedPlayers);
            };

            realtime.on('new_question', handleNewQuestion);
            realtime.on('round_ended', handleRoundEnded);
            realtime.on('game_over', handleGameOver);
            realtime.on('answer_submitted', handleAnswerSubmitted);
            realtime.on('new_message', handleNewMessage);
            realtime.on('player_joined', handlePlayerJoined);

            realtime.on('presence_sync', () => {
                const presState = realtime.getPresenceState();
                const onlineDeviceIds = Object.values(presState).flat().map(p => p.deviceId);
                setPlayers(prev => prev.map(p => ({
                    ...p,
                    isOnline: onlineDeviceIds.includes(p.player_id || p.id)
                })));
            });

            // Fetch players
            const { data } = await supabase
                .from('room_players')
                .select('*, players(nickname, avatar)')
                .eq('room_code', roomCode);
            if (data) {
                const mapped = data.map(p => ({
                    ...p,
                    id: p.player_id,
                    isHost: p.is_host,
                    nickname: p.players?.nickname || p.nickname,
                    avatar: p.players?.avatar || p.avatar,
                    isOnline: true
                }));
                setPlayers(mapped);
                const myself = mapped.find(p => p.id === deviceId);
                if (myself) setScore(myself.score || 0);
            }

            // Fetch chat
            const { data: chatData } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('room_code', roomCode)
                .order('created_at', { ascending: true })
                .limit(50);
            if (chatData) setMessages(chatData);
        };

        initializeRealtime();

        return () => {
            realtime.off('new_question');
            realtime.off('round_ended');
            realtime.off('game_over');
            realtime.off('answer_submitted');
            realtime.off('new_message');
            realtime.off('player_joined');
            realtime.off('presence_sync');
        };
    }, [roomCode, navigate, nickname, isHost, userId]);

    React.useEffect(() => {
        const handleUnload = () => cleanupIfEmpty();
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [roomCode]);

    // Heartbeat: keep room alive while players are present
    React.useEffect(() => {
        if (!roomCode) return;
        const interval = setInterval(() => {
            supabase.from('rooms').update({ last_activity_at: new Date().toISOString() }).eq('room_code', roomCode).then();
        }, 30000);
        return () => clearInterval(interval);
    }, [roomCode]);

    // ==================== TIMER ====================
    React.useEffect(() => {
        if (view !== 'question' || !isHost || hasAnswered) return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleEndRound();
                    vibrate([300, 100, 300, 100, 300]);
                    return 0;
                }
                if (prev <= 6 && prev > 0) SoundManager.playTick();
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [view, isHost, question]);

    // Spectator timer: visually count down display
    React.useEffect(() => {
        if (!isSpectating || view !== 'question') return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [isSpectating, view]);

    const isTimerExpired = () => {
        if (!question?.timer_end_at) return false;
        return Date.now() > new Date(question.timer_end_at).getTime();
    };

    // ==================== END ROUND ====================
    const handleEndRound = async () => {
        if (!isHost || roundProcessingRef.current) return;
        roundProcessingRef.current = true;

        const qIndex = question.index;
        const correctAnswer = question.correctAnswer;
        const isAutoBus = question?.id?.startsWith('ab') || packInfo?.id === 'pack_autobus';
        const isSraha = question?.id?.startsWith('sr') || packInfo?.id === 'pack_sraha';

        // 1. Mark unanswered + reset combo for those who didn't answer
        await supabase
            .from('room_players')
            .update({ last_answer: 'No Answer', is_correct: false, has_answered: true, consecutive_correct: 0 })
            .eq('room_code', roomCode)
            .eq('has_answered', false);

        // 2. Fetch all players
        const { data: playersInRoom, error } = await supabase
            .from('room_players')
            .select('*, players(nickname, avatar)')
            .eq('room_code', roomCode);

        if (error) {
            showToast("خطأ في جلب بيانات اللاعبين", "error");
            roundProcessingRef.current = false;
            return;
        }

        let teamResults = [];
        let questionStats = { correct: 0, wrong: 0, unanswered: 0, total: playersInRoom.filter(p => !p.is_host).length };

        if (isAutoBus) {
            // AutoBus: unique answer = +1
            const answerMap = {};
            playersInRoom.forEach(p => {
                if (p.is_host) return;
                const normalized = (p.last_answer || '').toLowerCase().trim();
                if (normalized && normalized !== 'no answer') {
                    if (!answerMap[normalized]) answerMap[normalized] = [];
                    answerMap[normalized].push(p.player_id);
                }
            });
            for (const player of playersInRoom) {
                if (player.is_host) continue;
                const normalized = (player.last_answer || '').toLowerCase().trim();
                const isUnique = answerMap[normalized]?.length === 1;
                const isValid = normalized && normalized !== 'no answer';
                const earnedPoint = isValid && isUnique;
                const pts = earnedPoint ? 1 : 0;

                if (earnedPoint) questionStats.correct++;
                else if (isValid) questionStats.wrong++;
                else questionStats.unanswered++;

                await supabase.from('room_players').update({
                    is_correct: earnedPoint, score: (player.score || 0) + pts
                }).eq('room_code', roomCode).eq('player_id', player.player_id);

                await supabase.from('answers').upsert({
                    room_code: roomCode, player_id: player.player_id,
                    question_index: qIndex, answer: player.last_answer || null,
                    is_correct: earnedPoint, points: pts
                }, { onConflict: 'room_code,player_id,question_index' });
            }
        } else {
            // MCQ / Text / Sraha / Team Meat
            const teams = {};
            playersInRoom.forEach(p => {
                if (p.team_index != null) {
                    if (!teams[p.team_index]) teams[p.team_index] = [];
                    teams[p.team_index].push(p);
                }
            });
            for (const [teamId, members] of Object.entries(teams)) {
                const allCorrect = members.every(m =>
                    m.last_answer && correctAnswer &&
                    m.last_answer.toLowerCase().trim() === correctAnswer.toLowerCase().trim()
                );
                teamResults.push({ teamId, earnedPoint: allCorrect });
            }

            for (const player of playersInRoom) {
                if (player.is_host) continue;
                const answer = player.last_answer;
                let isCorrect = null;
                let pts = 0;
                let speedBonus = false;
                let comboBonus = false;

                if (answer === 'No Answer' || !answer) {
                    isCorrect = false;
                    pts = 0;
                    questionStats.unanswered++;
                } else if (isSraha) {
                    isCorrect = answer.trim().length > 0;
                    pts = isCorrect ? 1 : 0;
                    if (isCorrect) questionStats.correct++; else questionStats.wrong++;
                } else if (correctAnswer) {
                    const norm = answer.toLowerCase().trim();
                    const corr = correctAnswer.toLowerCase().trim();
                    isCorrect = norm === corr;
                    pts = isCorrect ? 10 : 0;
                    if (isCorrect) questionStats.correct++; else questionStats.wrong++;
                }

                // Calculate bonuses (host-side)
                if (isCorrect === true) {
                    // Speed bonus: check answers.submitted_at vs timer_end_at
                    const { data: answerRow } = await supabase
                        .from('answers')
                        .select('submitted_at')
                        .eq('room_code', roomCode)
                        .eq('player_id', player.player_id)
                        .eq('question_index', qIndex)
                        .maybeSingle();
                    
                    if (answerRow && question.timer_end_at) {
                        const questionDuration = (roomSettings?.timeLimit || 30);
                        const timerEnd = new Date(question.timer_end_at).getTime();
                        const questionStart = timerEnd - (questionDuration * 1000);
                        const answeredAt = new Date(answerRow.submitted_at).getTime();
                        const elapsedSec = (answeredAt - questionStart) / 1000;
                        if (elapsedSec <= 5) {
                            speedBonus = true;
                            pts += 2;
                        }
                    }

                    // Combo bonus: 3+ consecutive correct
                    const newCombo = (player.consecutive_correct || 0) + 1;
                    if (newCombo >= 3) {
                        comboBonus = true;
                        pts += 1;
                    }
                }

                await supabase.from('room_players').update({
                    is_correct: isCorrect, score: (player.score || 0) + pts
                }).eq('room_code', roomCode).eq('player_id', player.player_id);

                await supabase.from('answers').upsert({
                    room_code: roomCode, player_id: player.player_id,
                    question_index: qIndex, answer: answer === 'No Answer' ? null : answer,
                    is_correct: isCorrect, points: pts,
                    speed_bonus: speedBonus, combo_bonus: comboBonus
                }, { onConflict: 'room_code,player_id,question_index' });
            }
        }

        const totalAnswered = questionStats.correct + questionStats.wrong;
        questionStats.correctPercent = totalAnswered > 0 ? Math.round((questionStats.correct / totalAnswered) * 100) : 0;

        // Re-fetch players to get updated scores after modifications
        const { data: updatedPlayers } = await supabase
            .from('room_players')
            .select('*, players(nickname, avatar)')
            .eq('room_code', roomCode);

        // Fetch answers with bonus flags for display
        const { data: answerBonuses } = await supabase
            .from('answers')
            .select('player_id, speed_bonus, combo_bonus')
            .eq('room_code', roomCode)
            .eq('question_index', qIndex);

        const bonusMap = {};
        (answerBonuses || []).forEach(a => {
            bonusMap[a.player_id] = { speed_bonus: a.speed_bonus, combo_bonus: a.combo_bonus };
        });

        const sortedScores = (updatedPlayers || playersInRoom)
            .filter(p => !p.is_host)
            .map(p => ({
                ...p, id: p.player_id,
                nickname: p.players?.nickname || p.nickname,
                avatar: p.players?.avatar || p.avatar,
                isHost: p.is_host,
                speed_bonus: bonusMap[p.player_id]?.speed_bonus || false,
                combo_bonus: bonusMap[p.player_id]?.combo_bonus || false
            }))
            .sort((a, b) => (b.score || 0) - (a.score || 0));

        const allScores = [
            ...sortedScores,
            ...(updatedPlayers || playersInRoom).filter(p => p.is_host).map(p => ({
                ...p, id: p.player_id,
                nickname: p.players?.nickname || p.nickname,
                avatar: p.players?.avatar || p.avatar,
                isHost: p.is_host,
                speed_bonus: bonusMap[p.player_id]?.speed_bonus || false,
                combo_bonus: bonusMap[p.player_id]?.combo_bonus || false
            }))
        ];

        const results = {
            scores: allScores, teamResults,
            nextQuestionIndex: qIndex + 1, totalQuestions: question.total,
            correctAnswer, questionStats,
            roundMVP: sortedScores.length > 0 ? sortedScores[0] : null
        };

        const isGameOver = results.nextQuestionIndex >= results.totalQuestions;
        if (isGameOver) {
            realtime.broadcast('game_over', results);
            navigate('/results', { state: { ...results, role: 'host', roomCode, nickname, userId } });
        } else {
            realtime.broadcast('round_ended', results);
            setRoundResults(results);
            setPlayers(allScores);
            setView('results');
        }
    };

    // ==================== NEXT QUESTION ====================
    const handleNextQuestion = async () => {
        if (!isHost || !packInfo) return;
        const nextIndex = question.index + 1;
        const nextQ = packInfo.questions[nextIndex];
        if (nextQ) {
            await supabase.from('room_players').update({
                last_answer: null, is_correct: null, has_answered: false
            }).eq('room_code', roomCode);

            const timeLimit = roomSettings?.timeLimit || 30;
            const timerEnd = new Date(Date.now() + timeLimit * 1000).toISOString();

            await supabase.from('rooms').update({
                current_question_index: nextIndex,
                timer_end_at: timerEnd,
                settings: { ...(roomSettings || {}), questionStartTime: new Date().toISOString(), timeLimit }
            }).eq('room_code', roomCode);

            realtime.broadcast('new_question', {
                ...nextQ, index: nextIndex, total: question.total,
                timer_end_at: timerEnd, timeLeft: timeLimit
            });
        } else {
            realtime.broadcast('game_over', { scores: players });
        }
    };

    // ==================== SUBMIT ANSWER ====================
    const submitAnswer = async (answer) => {
        if (hasAnswered || !answer?.trim() || roundProcessingRef.current) return;
        if (isTimerExpired()) {
            showToast("⏰ انتهى الوقت! لا يمكن تسجيل الإجابة", "error");
            vibrate([100, 50, 100]);
            return;
        }

        setHasAnswered(true);
        setSelectedAnswer(answer);

        const qIndex = question.index;
        const isSraha = question?.id?.startsWith('sr') || packInfo?.id === 'pack_sraha';
        const isAutoBus = question?.id?.startsWith('ab') || packInfo?.id === 'pack_autobus';
        const correctAnswer = question.correctAnswer;

        let isCorrect = null;
        let pts = 0;

        if (isAutoBus) {
            isCorrect = null;
            pts = 0;
        } else if (isSraha) {
            isCorrect = answer.trim().length > 0;
            pts = isCorrect ? 1 : 0;
        } else if (correctAnswer) {
            isCorrect = answer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
            pts = isCorrect ? 10 : 0;
        }

        // Calculate bonuses
        let speedBonus = false;
        let comboBonus = false;
        let newConsecutiveCorrect = consecutiveCorrect;

        if (isCorrect === true) {
            // Speed bonus: +2 if answered within first 5 seconds
            if (questionStartTime) {
                const elapsed = (Date.now() - questionStartTime) / 1000;
                if (elapsed <= 5) {
                    speedBonus = true;
                    pts += 2;
                }
            }

            // Combo bonus: +1 after 3+ consecutive correct
            newConsecutiveCorrect = consecutiveCorrect + 1;
            if (newConsecutiveCorrect >= 3) {
                comboBonus = true;
                pts += 1;
            }
        } else {
            newConsecutiveCorrect = 0;
        }

        setConsecutiveCorrect(newConsecutiveCorrect);

        const updateData = { last_answer: answer, is_correct: isCorrect, has_answered: true };
        // Score is calculated by handleEndRound (host) to avoid race conditions
        updateData.consecutive_correct = newConsecutiveCorrect;

        await supabase.from('room_players').update(updateData)
            .eq('room_code', roomCode).eq('player_id', deviceId);

        await supabase.from('answers').upsert({
            room_code: roomCode, player_id: deviceId,
            question_index: qIndex, answer, is_correct: isCorrect, points: pts,
            speed_bonus: speedBonus, combo_bonus: comboBonus
        }, { onConflict: 'room_code,player_id,question_index' });

        if (isCorrect === true) { SoundManager.playCorrect(); vibrate([100]); }
        else if (isCorrect === false) { SoundManager.playWrong(); vibrate([200, 100, 200]); }

        realtime.broadcast('answer_submitted', { deviceId });
        setView('waiting');
    };

    // ==================== CHAT ====================
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !canSendMessage) return;
        const msg = {
            id: Date.now() + Math.random(), room_code: roomCode,
            sender_id: deviceId, sender_nickname: nickname,
            content: newMessage.trim(), type: 'user',
            created_at: new Date().toISOString()
        };
        realtime.broadcast('new_message', msg);
        setMessages(prev => [...prev, msg].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
        setNewMessage('');
        await supabase.from('chat_messages').insert({
            room_code: roomCode, sender_id: deviceId,
            sender_nickname: nickname, content: msg.content,
            type: 'user', created_at: msg.created_at
        });
        setCanSendMessage(false);
        setSpamCountdown(3);
        if (spamTimerRef.current) clearInterval(spamTimerRef.current);
        spamTimerRef.current = setInterval(() => {
            setSpamCountdown(prev => {
                if (prev <= 1) { clearInterval(spamTimerRef.current); setCanSendMessage(true); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    // ==================== RENDER ====================
    if (!question || !isConnected) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-400 font-bold">جاري الاتصال...</p>
            </div>
        );
    }

    const isSraha = question?.id?.startsWith('sr') || packInfo?.id === 'pack_sraha';
    const isAutoBus = question?.id?.startsWith('ab') || packInfo?.id === 'pack_autobus';
    const scoreLabel = isSraha || isAutoBus ? '+1' : '+10';

    // Sorted players for display (non-host only)
    const sortedPlayers = [...players]
        .filter(p => !p.is_host)
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    const answeredCount = sortedPlayers.filter(p => p.has_answered).length;
    const totalCount = sortedPlayers.length;

    // ==================== 📝 PLAYERS SECTION (persistent) ====================
    const renderPlayersSection = () => {
        if (roundResults) {
            // RESULTS MODE
            return (
                <div className="bg-gray-800/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden h-full flex flex-col">
                    <div className="p-4 border-b border-white/5 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 flex items-center justify-between">
                        <h3 className="text-sm font-black text-white flex items-center gap-2">📝 إجابات اللاعبين</h3>
                        {roundResults.correctAnswer && (
                            <div className="text-[10px] bg-green-500/20 text-green-400 px-3 py-1 rounded-full font-black">
                                ✅ {roundResults.correctAnswer}
                            </div>
                        )}
                    </div>
                    {roundResults.questionStats && (
                        <div className="flex gap-2 p-3 border-b border-white/5">
                            <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-1 rounded font-bold">✅ {roundResults.questionStats.correct}</span>
                            <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded font-bold">❌ {roundResults.questionStats.wrong}</span>
                            <span className="text-[10px] bg-orange-500/10 text-orange-400 px-2 py-1 rounded font-bold">⏳ {roundResults.questionStats.unanswered}</span>
                            {roundResults.questionStats.correctPercent != null && (
                                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded font-bold ml-auto">{roundResults.questionStats.correctPercent}%</span>
                            )}
                        </div>
                    )}
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-right">
                            <thead className="bg-black/30 text-[9px] text-gray-500 uppercase font-black">
                                <tr>
                                    <th className="px-3 py-2 text-center">#</th>
                                    <th className="px-3 py-2 text-right">اللاعب</th>
                                    <th className="px-3 py-2 text-right">الإجابة</th>
                                    <th className="px-3 py-2 text-center">النتيجة</th>
                                    <th className="px-3 py-2 text-center">النقاط</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {roundResults.scores.filter(p => !p.is_host).map((p, idx) => {
                                    const answer = p.last_answer;
                                    const displayAnswer = !answer || answer === 'No Answer' ? 'لم يجب' : answer;
                                    const hasAns = answer && answer !== 'No Answer';
                                    const isCorrect = p.is_correct === true;
                                    const isMe = (p.player_id || p.id) === deviceId;
                                    const medals = ['🥇', '🥈', '🥉'];
                                    return (
                                        <tr key={p.player_id || p.id || idx} className={`${isMe ? 'bg-blue-600/10' : ''}`}>
                                            <td className="px-3 py-2 text-center text-sm">{medals[idx] || ''}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center text-xs">{p.avatar || '👤'}</div>
                                                    <span className={`text-xs font-bold ${isMe ? 'text-blue-400' : 'text-gray-200'}`}>{p.nickname}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`text-xs ${!hasAns ? 'text-gray-600 italic' : 'text-white'}`}>{displayAnswer}</span>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {hasAns ? (isCorrect ? <span className="text-sm">✅</span> : <span className="text-sm">❌</span>) : <span className="text-gray-700">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`text-xs font-black ${isCorrect ? 'text-yellow-400' : 'text-gray-600'}`}>
                                                    {isCorrect ? scoreLabel : '0'}
                                                </span>
                                                {p.speed_bonus && <span className="text-[8px] bg-yellow-500/20 text-yellow-300 px-1 py-0.5 rounded ml-1">⚡+2</span>}
                                                {p.combo_bonus && <span className="text-[8px] bg-orange-500/20 text-orange-300 px-1 py-0.5 rounded ml-1">🔥+1</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        // QUESTION/WAITING MODE
        return (
            <div className="bg-gray-800/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden h-full flex flex-col">
                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">📝 إجابات اللاعبين</h3>
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-black">
                        {answeredCount}/{totalCount}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {sortedPlayers.map((p, idx) => {
                        const answered = p.has_answered || false;
                        const isOnline = p.isOnline !== false;
                        const medals = ['🥇', '🥈', '🥉'];
                        return (
                            <div key={p.player_id || p.id || idx}
                                className={`flex items-center justify-between px-4 py-3 border-b border-white/5 last:border-0 ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs w-5 text-center text-gray-500">{medals[idx] || ''}</span>
                                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                                    <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm border border-white/10">
                                        {p.avatar || '👤'}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-gray-200">{p.nickname}</span>
                                        <span className="text-[9px] text-gray-500">{isOnline ? '🟢 Online' : '🔴 Offline'}</span>
                                    </div>
                                    <span className="text-[8px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-black">{p.score || 0}</span>
                                </div>
                                <div>
                                    {answered ? (
                                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-lg font-bold">✅ أجاب</span>
                                    ) : (
                                        <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-lg font-bold animate-pulse">⏳ يفكر...</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ==================== MAIN LAYOUT ====================
    return (
        <div className="min-h-screen flex flex-col bg-[#0a0a0c] text-white font-sans overflow-hidden relative">
            {/* Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2"></div>
            </div>

            {/* Header */}
            <header className="w-full bg-white/5 backdrop-blur-md border-b border-white/10 px-4 py-3 relative z-10">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <div className="text-center">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block">السؤال</span>
                        <span className="text-lg font-black text-white">{question?.index + 1}/{question?.total}</span>
                    </div>
                    <div className="text-center">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block">الوقت</span>
                        <div className={`text-2xl font-black font-mono ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                            {timeLeft}
                        </div>
                    </div>
                    <div className="text-center">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block">النقاط</span>
                        <span className="text-2xl font-black text-yellow-400">{score}</span>
                    </div>
                </div>
            </header>

            {/* Spectator Banner */}
            {isSpectating && (
                <div className="w-full bg-yellow-500/20 border-b border-yellow-500/30 px-4 py-2.5 text-center relative z-10">
                    <span className="text-sm font-black text-yellow-300">👀 أنت في وضع المشاهدة — ستنضم في الجولة القادمة</span>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col md:flex-row relative z-10 overflow-hidden">
                {/* LEFT: Question or Chat */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Question View (before answering) */}
                    {view === 'question' && !hasAnswered && (
                        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
                            <div className="w-full max-w-3xl mb-6">
                                <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-6 md:p-10 border border-white/10 shadow-2xl">
                                    <h2 className="text-xl md:text-3xl font-black leading-relaxed text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-100 via-white to-blue-100" dir="auto">
                                        {question.question}
                                    </h2>
                                </div>
                            </div>

                            {!question.options || question.options.length === 0 ? (
                                isSpectating ? (
                                    <div className="w-full max-w-2xl flex flex-col items-center gap-4">
                                        <div className="w-full bg-white/5 border border-white/10 p-5 md:p-8 rounded-3xl text-xl md:text-3xl font-bold text-center text-gray-500">
                                            إجابة نصية
                                        </div>
                                    </div>
                                ) : (
                                <div className="w-full max-w-2xl flex flex-col items-center gap-4">
                                    <input
                                        type="text"
                                        value={manualAnswer}
                                        onChange={(e) => setManualAnswer(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && manualAnswer.trim() && submitAnswer(manualAnswer)}
                                        disabled={hasAnswered}
                                        placeholder="اكتب إجابتك هنا..."
                                        className="w-full bg-white/10 border border-white/20 p-5 md:p-8 rounded-3xl text-xl md:text-3xl font-bold text-center focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition-all placeholder:text-gray-600"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => submitAnswer(manualAnswer)}
                                        disabled={hasAnswered || !manualAnswer.trim()}
                                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-12 py-4 rounded-2xl font-black text-xl shadow-xl transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                                    >
                                        إرسال الإجابة 🚀
                                    </button>
                                </div>
                                )
                            ) : (
                                isSpectating ? (
                                    <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                        {question.options.map((option, idx) => (
                                            <div
                                                key={idx}
                                                className="p-5 md:p-7 rounded-2xl text-lg md:text-xl font-bold bg-white/5 text-gray-400 border border-white/5"
                                            >
                                                {option}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                    {question.options.map((option, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => submitAnswer(option)}
                                            disabled={hasAnswered}
                                            className="group relative overflow-hidden p-5 md:p-7 rounded-2xl text-lg md:text-xl font-bold transition-all duration-300 transform bg-white/10 hover:bg-white/20 text-white hover:scale-[1.02] hover:shadow-xl border border-white/5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                                            <span className="relative z-10">{option}</span>
                                        </button>
                                    ))}
                                </div>
                                )
                            )}
                        </div>
                    )}

                    {/* Waiting View (after answering) — shows Chat */}
                    {(view === 'waiting' || hasAnswered) && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-white/5 bg-green-500/10 flex items-center gap-3">
                                <div className="text-2xl">✅</div>
                                <div>
                                    <h2 className="text-sm font-black text-green-400">تم تسجيل إجابتك!</h2>
                                    <p className="text-[10px] text-green-300/70 font-bold">في انتظار باقي اللاعبين — تقدر تستخدم الشات</p>
                                </div>
                                {selectedAnswer && (
                                    <div className="mr-auto bg-white/5 rounded-xl px-3 py-1 border border-white/10">
                                        <span className="text-[9px] text-gray-500 font-bold block">إجابتك</span>
                                        <span className="text-xs font-black text-white">{selectedAnswer}</span>
                                    </div>
                                )}
                                {consecutiveCorrect >= 2 && (
                                    <div className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded-lg text-xs font-black animate-pulse">
                                        🔥 {consecutiveCorrect}x Combo!
                                    </div>
                                )}
                            </div>
                            {/* Chat */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                                {messages.map((msg, idx) => (
                                    <div key={msg.id || idx} className={`${msg.type === 'system' ? 'text-center' : ''}`}>
                                        {msg.type === 'system' ? (
                                            <span className="text-[10px] text-gray-500 italic">{msg.content}</span>
                                        ) : (
                                            <div className={`flex gap-2 ${msg.sender_id === deviceId ? 'flex-row-reverse' : ''}`}>
                                                <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center text-[10px] flex-shrink-0">
                                                    {msg.sender_nickname?.[0] || '?'}
                                                </div>
                                                <div className={`max-w-[80%] ${msg.sender_id === deviceId ? 'text-left' : 'text-right'}`}>
                                                    <span className="text-[10px] text-gray-500 font-bold">{msg.sender_nickname}</span>
                                                    <div className={`text-sm px-3 py-1.5 rounded-xl ${msg.sender_id === deviceId ? 'bg-blue-600/30 text-white' : 'bg-white/5 text-gray-200'}`}>
                                                        {msg.type === 'audio' ? '🔊 رسالة صوتية' : msg.content}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                            <form onSubmit={handleSendMessage} className="p-3 border-t border-white/5 flex gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value.slice(0, 100))}
                                    placeholder="اكتب رسالة..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all"
                                    disabled={!canSendMessage}
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim() || !canSendMessage}
                                    className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                                >
                                    {canSendMessage ? 'إرسال' : spamCountdown}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Results View (host sees question + next button) */}
                    {view === 'results' && roundResults && (
                        <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
                            <div className="w-full max-w-2xl">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">📊 نتائج الجولة</h2>
                                    {roundResults.correctAnswer && (
                                        <div className="inline-block bg-green-500/20 text-green-400 px-6 py-2 rounded-full font-black border border-green-500/30">
                                            ✅ الإجابة الصحيحة: {roundResults.correctAnswer}
                                        </div>
                                    )}
                                </div>

                                {roundResults.roundMVP && (
                                    <div className="text-center mb-4">
                                        <div className="inline-block bg-yellow-500/10 border border-yellow-500/30 px-4 py-2 rounded-xl">
                                            <span className="text-xs font-bold text-yellow-400">🏆 أفضل لاعب في الجولة: {roundResults.roundMVP.nickname}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-col gap-3 w-full max-w-md mx-auto mt-6">
                                    {isHost ? (
                                        <button
                                            onClick={handleNextQuestion}
                                            className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xl rounded-2xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
                                        >
                                            <span>السؤال التالي</span>
                                            <span className="text-2xl">➡️</span>
                                        </button>
                                    ) : (
                                        <div className="w-full px-8 py-4 bg-white/[0.03] border-2 border-dashed border-white/10 text-gray-400 font-bold rounded-2xl text-center">
                                            ⏳ بانتظار المضيف للسؤال التالي
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT: 📝 إجابات اللاعبين (persistent) */}
                <div className="w-full md:w-[380px] border-t md:border-t-0 md:border-l border-white/5 flex flex-col overflow-hidden bg-gray-900/30">
                    {renderPlayersSection()}
                </div>
            </main>
        </div>
    );
};

export default GameScreen;

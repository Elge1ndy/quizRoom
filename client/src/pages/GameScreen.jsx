import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import WaitingScreen from '../components/WaitingScreen';
import { useToast } from '../context/ToastContext';
import SoundManager from '../utils/SoundManager';
import { getPersistentDeviceId } from '../utils/userAuth';

const GameScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { roomCode, nickname, role, initialQuestion, userId, pack: statePack } = location.state || {}; // role: 'host' or 'player'

    const deviceId = getPersistentDeviceId();

    const cleanupIfEmpty = async () => {
        try {
            // 1. Remove from room_players
            await supabase.from('room_players').delete().eq('room_code', roomCode).eq('player_id', deviceId);

            // 2. Check online players
            const state = realtime.getPresenceState();
            const onlineCount = Object.values(state).flat().length;

            if (onlineCount <= 1) {
                console.log("🗑️ Empty room detected in game - closing room:", roomCode);
                await supabase.from('rooms').delete().eq('room_code', roomCode);
            }
        } catch (err) {
            console.error("Cleanup error in game:", err);
        }
    };

    const [question, setQuestion] = React.useState(initialQuestion || null);
    const [packInfo, setPackInfo] = React.useState(statePack || initialQuestion?.allQuestions ? { questions: initialQuestion.allQuestions } : null);

    const [view, setView] = React.useState('question'); // 'question' | 'waiting'
    const [roundResults, setRoundResults] = React.useState(null);
    const [timeLeft, setTimeLeft] = React.useState(initialQuestion?.timeLeft || 30);
    const [selectedAnswer, setSelectedAnswer] = React.useState(null);
    const [hasAnswered, setHasAnswered] = React.useState(false);
    const [score, setScore] = React.useState(0);

    // Dynamic Role Handling
    const [isHost, setIsHost] = React.useState(role === 'host');

    const [isConnected, setIsConnected] = React.useState(false);

    React.useEffect(() => {
        // SoundManager will initialize lazily on first sound play (user interaction)


        const initializeRealtime = async () => {
            if (!roomCode || !nickname) {
                const lastRoomCode = localStorage.getItem('last_room_code');
                if (lastRoomCode) {
                    console.log("🔄 State lost in GameScreen, redirecting for recovery:", lastRoomCode);
                    navigate(`/waiting/${lastRoomCode}`);
                } else {
                    navigate('/');
                }
                return;
            }

            const deviceId = getPersistentDeviceId();


            // Ensure we are connected
            await realtime.joinRoom(roomCode, { deviceId, nickname, isHost });
            setIsConnected(true);

            // Listeners
            realtime.on('new_question', (q) => {
                setQuestion(q);
                if (q.allQuestions) setPackInfo({ questions: q.allQuestions });

                setView('question');
                setHasAnswered(false);
                setSelectedAnswer(null);
                setTimeLeft(q.timeLeft || 30);
                setProcessingRound(false);
            });

            realtime.on('round_ended', (results) => {
                setRoundResults(results);
                setView('waiting');
                showToast("↩️ العودة إلى صفحة الانتظار", "info");
                navigate('/waiting', {
                    state: {
                        roomCode,
                        nickname,
                        userId,
                        isHost,
                        players: results.scores || [],
                        mode: 'between-questions',
                        currentQuestion: results.nextQuestionIndex,
                        totalQuestions: results.totalQuestions,
                        lastAnswer: selectedAnswer,
                        roundResults: results
                    }
                });
            });

            realtime.on('game_over', (results) => {
                navigate('/results', { state: { ...results, role: isHost ? 'host' : 'player', roomCode, nickname } });
            });

            // Host: Check for all answers
            realtime.on('answer_submitted', async () => {
                if (!isHost) return;
                // Fetch count of answered players
                const { count } = await supabase
                    .from('room_players')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_code', roomCode)
                    .not('last_answer', 'is', null);

                // Get total players
                const { count: total } = await supabase
                    .from('room_players')
                    .select('*', { count: 'exact', head: true })
                    .eq('room_code', roomCode);

                if (count >= total) {
                    handleEndRound();
                }
            });

            // Watch for host migration (still needed for dynamic host changes)
            realtime.on('player_joined', (updatedPlayers) => {
                const myself = updatedPlayers.find(p => p.id === deviceId); // Use deviceId for identification
                if (myself) {
                    setIsHost(myself.isHost);
                    if (myself.isHost && !isHost) {
                        // Notify that I am now host
                        SoundManager.playCorrect(); // Or some other sound
                    }
                }
            });
        }; // Close initializeRealtime

        initializeRealtime();

        return () => {
            realtime.off('new_question');
            realtime.off('round_ended');
            realtime.off('game_over');
            realtime.off('player_joined');
            realtime.off('answer_submitted'); // Ensure this is also removed if added
        };
    }, [roomCode, navigate, nickname, isHost, userId, selectedAnswer]);

    // Cleanup Room when last player leaves (Tab close / Navigate away)
    React.useEffect(() => {
        const handleUnload = () => {
            cleanupIfEmpty();
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [roomCode]);

    // Host Timer & Logic
    React.useEffect(() => {
        if (view !== 'question' || !isHost) return;

        const timer = setInterval(async () => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleEndRound();
                    return 0;
                }
                if (prev <= 6 && prev > 0) { // Keep local tick sound for host
                    SoundManager.playTick();
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [view, isHost, question]); // Added question to dependencies for handleEndRound

    const [processingRound, setProcessingRound] = React.useState(false);

    const handleEndRound = async () => {
        if (!isHost || processingRound) return;
        setProcessingRound(true);

        // 0. Mark unanswered players as "No Answer"
        await supabase
            .from('room_players')
            .update({ last_answer: 'No Answer', is_correct: false })
            .eq('room_code', roomCode)
            .is('last_answer', null);

        // 1. Fetch all answers for this room (now includes "No Answer" entries)
        const { data: playersInRoom, error } = await supabase
            .from('room_players')
            .select('*, players(nickname, avatar)')
            .eq('room_code', roomCode);

        if (error) {
            console.error("Error fetching players for round end:", error);
            showToast("خطأ في جلب بيانات اللاعبين", "error");
            setProcessingRound(false);
            return;
        }

        // Detect AutoBus mode
        const isAutoBus = initialQuestion?.id?.startsWith('ab') || packInfo?.id === 'pack_autobus';

        if (isAutoBus) {
            // AutoBus Complete Logic: Duplicate answers lose
            const answerMap = {};

            // Normalize and count answers
            playersInRoom.forEach(p => {
                const normalized = (p.last_answer || '').toLowerCase().trim();
                if (normalized && normalized !== 'no answer') {
                    if (!answerMap[normalized]) {
                        answerMap[normalized] = [];
                    }
                    answerMap[normalized].push(p.player_id);
                }
            });

            // Update scores based on uniqueness
            for (const player of playersInRoom) {
                const normalized = (player.last_answer || '').toLowerCase().trim();
                const isUnique = answerMap[normalized]?.length === 1;
                const isValid = normalized && normalized !== 'no answer';
                const earnedPoint = isValid && isUnique;

                await supabase
                    .from('room_players')
                    .update({
                        is_correct: earnedPoint,
                        score: earnedPoint ? (player.score + 1) : player.score
                    })
                    .eq('room_code', roomCode)
                    .eq('player_id', player.player_id);
            }

            // Refresh player data after scoring
            const { data: updatedPlayers } = await supabase
                .from('room_players')
                .select('*, players(nickname, avatar)')
                .eq('room_code', roomCode);

            const results = {
                scores: updatedPlayers || playersInRoom,
                nextQuestionIndex: question.index + 1,
                totalQuestions: question.total,
                correctAnswer: null // No single correct answer in AutoBus
            };

            const isGameOver = results.nextQuestionIndex >= results.totalQuestions;

            if (isGameOver) {
                realtime.broadcast('game_over', results);
            } else {
                realtime.broadcast('round_ended', results);
            }
            return;
        }

        // 2. Calculate Team Results (Team Meat Logic)
        let teamResults = [];
        const teams = {};

        // Group by team
        playersInRoom.forEach(p => {
            if (p.team_id) {
                if (!teams[p.team_id]) teams[p.team_id] = [];
                teams[p.team_id].push(p);
            }
        });

        // Check for steaks (All members must answer correctly)
        for (const [teamId, members] of Object.entries(teams)) {
            const allCorrect = members.every(m =>
                m.last_answer &&
                question.correctAnswer &&
                m.last_answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim()
            );

            if (allCorrect) {
                teamResults.push({ teamId, earnedPoint: true });
            } else {
                teamResults.push({ teamId, earnedPoint: false });
            }
        }

        // 3. Prepare Results
        const results = {
            scores: playersInRoom,
            teamResults: teamResults, // Add team results
            nextQuestionIndex: question.index + 1,
            totalQuestions: question.total,
            correctAnswer: question.correctAnswer
        };

        const isGameOver = results.nextQuestionIndex >= results.totalQuestions;

        // 4. Broadcast to all
        if (isGameOver) {
            realtime.broadcast('game_over', results);
        } else {
            realtime.broadcast('round_ended', results);
        }
    };


    const handleNextQuestion = async () => {
        if (!isHost || !packInfo) return;
        const nextIndex = question.index + 1;
        const nextQ = packInfo.questions[nextIndex];

        if (nextQ) {
            // Reset player answers in DB first
            await supabase
                .from('room_players')
                .update({ last_answer: null, is_correct: null })
                .eq('room_code', roomCode);

            realtime.broadcast('new_question', { ...nextQ, index: nextIndex, total: question.total });
        } else {
            // Game Over logic
            realtime.broadcast('game_over', { scores: [] }); // Simplification
        }
    };

    const [lastAnswerResult, setLastAnswerResult] = React.useState(null);

    const returnToWaiting = () => {
        if (!roundResults) return;
        navigate('/waiting', {
            state: {
                roomCode,
                nickname,
                isHost: isHost,
                players: roundResults.scores || [],
                mode: 'between-questions',
                currentQuestion: roundResults.nextQuestionIndex,
                totalQuestions: roundResults.totalQuestions,
                lastAnswer: selectedAnswer,
                roundResults: roundResults
            }
        });
    };

    const [manualAnswer, setManualAnswer] = React.useState('');

    const submitAnswer = async (answer) => {
        if (hasAnswered) return;
        setHasAnswered(true);
        setSelectedAnswer(answer);

        const isSraha = initialQuestion?.id?.startsWith('sr') || packInfo?.id === 'pack_sraha';
        const isAutoBus = initialQuestion?.id?.startsWith('ab') || packInfo?.id === 'pack_autobus';

        const deviceId = getPersistentDeviceId();

        // For AutoBus mode, skip immediate scoring (will be done by host at round end)
        if (isAutoBus) {
            await supabase
                .from('room_players')
                .update({
                    last_answer: answer,
                    is_correct: null // Will be determined by host
                })
                .eq('room_code', roomCode)
                .eq('player_id', deviceId);

            realtime.broadcast('answer_submitted', { deviceId });

            showToast("✅ تم إرسال إجابتك - بانتظار البقية", "success");
            navigate('/waiting', {
                state: {
                    roomCode,
                    nickname,
                    userId,
                    isHost,
                    mode: 'between-questions',
                    currentQuestion: question.index,
                    totalQuestions: question.total,
                    lastAnswer: answer,
                    waitingForResults: true,
                }
            });
            return;
        }

        // Standard scoring logic for other modes
        const isCorrect = isSraha ? (answer?.trim().length > 0) : (question.correctAnswer ? (answer?.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim()) : null);

        // 1. Update Player Status in DB
        await supabase
            .from('room_players')
            .update({
                last_answer: answer,
                is_correct: isCorrect,
                score: isCorrect ? (score + 10) : score // Simplistic score update
            })
            .eq('room_code', roomCode)
            .eq('player_id', deviceId);

        if (isCorrect) {
            setScore(prev => prev + 10);
            SoundManager.playCorrect();
        } else if (isCorrect === false) {
            SoundManager.playWrong();
        }

        // Notify Host that an answer was submitted
        realtime.broadcast('answer_submitted', { deviceId });

        // Restore Immediate Redirect: Player moves to /waiting to wait for others
        showToast("✅ تم إرسال إجابتك - بانتظار البقية", "success");
        navigate('/waiting', {
            state: {
                roomCode,
                nickname,
                userId,
                isHost,
                mode: 'between-questions',
                currentQuestion: question.index,
                totalQuestions: question.total,
                lastAnswer: answer,
                waitingForResults: true, // Flag to show "waiting for other players" UI in WaitingRoom
            }
        });
    };


    if (!question || !isConnected) return <div className="min-h-screen bg-black text-white flex items-center justify-center">جاري الاتصال...</div>;

    return (
        <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-indigo-950 via-gray-900 to-black text-white p-4 font-sans overflow-hidden relative">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2"></div>

            {/* Header - Always Visible */}
            <header className="w-full max-w-5xl flex justify-between items-center bg-white/5 backdrop-blur-md p-4 rounded-2xl mb-8 border border-white/10 shadow-lg relative z-10 mx-4 mt-4">
                <div className="flex flex-col items-start min-w-[100px]">
                    <span className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-1">النقاط</span>
                    <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 drop-shadow-sm">{score}</span>
                </div>

                {/* Timer UI removed as requested */}

                <div className="flex flex-col items-end min-w-[100px]">
                    <span className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-1">اللاعب</span>
                    <span className="text-xl font-bold text-white truncate max-w-[150px]">{nickname}</span>
                </div>
            </header>

            {/* QUESTION VIEW */}
            {view === 'question' && (
                <>
                    {/* Question Area */}
                    <div className="flex-1 overflow-y-auto px-4 py-6">
                        <div className="max-w-3xl mx-auto space-y-6">
                            {/* Question Header & Timer */}
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl shadow-lg ${timeLeft <= 5 ? 'bg-red-500 animate-pulse' : 'bg-blue-600'}`}>
                                        {timeLeft}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">الوقت المتبقي</p>
                                        <p className={`text-sm font-black ${timeLeft <= 5 ? 'text-red-400' : 'text-blue-400'}`}>
                                            {timeLeft <= 5 ? '⏲️ أسرع!' : '⏱️ ثانية'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">السؤال</p>
                                    <p className="text-white text-lg font-black">{question?.index + 1} / {question?.total}</p>
                                </div>
                            </div>

                            <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] p-8 border border-white/10 shadow-2xl relative overflow-hidden group">
                                {hasAnswered && (
                                    <div className="absolute inset-0 bg-blue-600/90 backdrop-blur-md z-20 flex flex-col items-center justify-center text-center p-6 animate-fade-in">
                                        <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4 animate-bounce">
                                            <span className="text-4xl">✅</span>
                                        </div>
                                        <h3 className="text-2xl font-black text-white mb-2">تم إرسال إجابتك</h3>
                                        <p className="text-blue-100 font-bold">في انتظار باقي اللاعبين...</p>
                                    </div>
                                )}
                                <h2 className="text-2xl md:text-4xl font-black leading-relaxed text-transparent bg-clip-text bg-gradient-to-r from-blue-100 via-white to-blue-100 drop-shadow-lg" dir="auto">
                                    {question.question}
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* Answers Grid or Text Input */}
                    {!question.options || question.options.length === 0 ? (
                        <div className="w-full max-w-4xl flex flex-col items-center gap-6 relative z-10 px-4 animate-slide-up">
                            <input
                                type="text"
                                value={manualAnswer}
                                onChange={(e) => setManualAnswer(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && manualAnswer.trim() && submitAnswer(manualAnswer)}
                                disabled={hasAnswered}
                                placeholder="اكتب إجابتك هنا..."
                                className="w-full bg-white/10 border border-white/20 p-6 md:p-10 rounded-3xl text-2xl md:text-4xl font-bold text-center focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition-all placeholder:text-gray-600 shadow-inner"
                                autoFocus
                            />
                            <button
                                onClick={() => submitAnswer(manualAnswer)}
                                disabled={hasAnswered || !manualAnswer.trim()}
                                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-16 py-5 rounded-2xl font-black text-2xl shadow-xl shadow-blue-900/30 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed group"
                            >
                                <span className="group-hover:mr-2 transition-all">إرسال الإجابة</span>
                                🚀
                            </button>
                        </div>
                    ) : (
                        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 relative z-10 px-4">
                            {question.options.map((option, idx) => {
                                const isSelected = selectedAnswer === option;

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => submitAnswer(option)}
                                        disabled={hasAnswered}
                                        className={`
                                            group relative overflow-hidden p-6 md:p-8 rounded-2xl text-lg md:text-2xl font-bold transition-all duration-300 transform
                                            ${hasAnswered
                                                ? isSelected
                                                    ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-black scale-[1.02] shadow-[0_0_20px_rgba(245,158,11,0.5)] ring-2 ring-yellow-300'
                                                    : 'bg-gray-800/50 text-gray-500 scale-95 opacity-50 cursor-not-allowed grayscale'
                                                : 'bg-white/10 hover:bg-white/20 text-white hover:scale-[1.02] hover:shadow-xl border border-white/5 active:scale-95'
                                            }
                                        `}
                                    >
                                        {!hasAnswered && (
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                                        )}
                                        <span className="relative z-10">{option}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {hasAnswered && (
                        <div className="mt-8 text-center animate-bounce-in relative z-10">
                            <div className="inline-block bg-black/30 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 text-gray-300 shadow-lg">
                                <span className="mr-2">✨</span> تم إرسال إجابتك! انتظر النتيجة...
                            </div>
                        </div>
                    )}

                    {/* End Round action removed during active questions as per request */}
                </>
            )}
        </div>
    );
};

export default GameScreen;

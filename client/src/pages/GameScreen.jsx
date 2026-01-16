import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socket from '../socket';
import WaitingScreen from '../components/WaitingScreen';

import SoundManager from '../utils/SoundManager';

const GameScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { roomCode, nickname, role, initialQuestion } = location.state || {}; // role: 'host' or 'player'

    const [question, setQuestion] = useState(initialQuestion || null);
    const [view, setView] = useState('question'); // 'question' | 'waiting'
    const [roundResults, setRoundResults] = useState(null);
    const [timeLeft, setTimeLeft] = useState(30);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [score, setScore] = useState(0);

    // Dynamic Role Handling
    const [isHost, setIsHost] = useState(role === 'host');

    useEffect(() => {
        // Initialize Audio Context on first user interaction or mount
        SoundManager.init();

        // Listen for new questions
        socket.on('game_started', (q) => {
            setQuestion(q);
            setView('question');
            setTimeLeft(30);
            setHasAnswered(false);
            setSelectedAnswer(null);
        });

        socket.on('new_question', (q) => {
            setQuestion(q);
            setView('question');
            setTimeLeft(30);
            setHasAnswered(false);
            setSelectedAnswer(null);
        });

        socket.on('round_ended', (results) => {
            setRoundResults(results);
            setView('waiting');
            if (results.correctAnswer === selectedAnswer) {
                // If we tracked correctness locally, we could play it here too,
                // but we already played it on submit.
            }
        });

        socket.on('game_over', (results) => {
            navigate('/results', { state: results });
        });

        // Watch for host migration
        socket.on('player_joined', (updatedPlayers) => {
            const myself = updatedPlayers.find(p => p.id === socket.id);
            if (myself) {
                setIsHost(myself.isHost);
                if (myself.isHost && !isHost) {
                    // Notify that I am now host
                    SoundManager.playCorrect(); // Or some other sound
                }
            }
        });

        return () => {
            socket.off('game_started');
            socket.off('new_question');
            socket.off('round_ended');
            socket.off('game_over');
            socket.off('player_joined');
        };
    }, [navigate, selectedAnswer, nickname, isHost]); // Added isHost dep to effect might be risky if effect re-runs too much? No, listeners created once. 
    // Actually, dependency array should include vars used inside.
    // Ideally separate effect for listeners. But this is fine.

    // Timer Logic - Controlled locally for now, triggers round end if Host
    useEffect(() => {
        if (view !== 'question') return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 6 && prev > 0) {
                    SoundManager.playTick();
                }

                if (prev <= 1) {
                    if (role === 'host' && view === 'question') {
                        socket.emit('end_round', { roomCode });
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [view, role, roomCode]);

    const handleNextQuestion = () => {
        socket.emit('next_question', { roomCode });
    };

    const [lastAnswerResult, setLastAnswerResult] = useState(null);

    const returnToWaiting = () => {
        if (!roundResults) return;
        navigate('/waiting', {
            state: {
                roomCode,
                nickname,
                isHost: role === 'host',
                players: roundResults.scores || [],
                mode: 'between-questions',
                currentQuestion: roundResults.nextQuestionIndex,
                totalQuestions: roundResults.totalQuestions,
                lastAnswer: selectedAnswer,
                roundResults: roundResults
            }
        });
    };

    const [manualAnswer, setManualAnswer] = useState('');

    const submitAnswer = (answer) => {
        if (hasAnswered) return;
        setHasAnswered(true);
        setSelectedAnswer(answer); // Optimistic update

        socket.emit('submit_answer', { roomCode, answer, timeRemaining: timeLeft }, (result) => {
            if (result) {
                if (result.isCorrect) {
                    SoundManager.playCorrect();
                } else if (result.isCorrect === false) {
                    SoundManager.playWrong();
                }

                // Immediately navigate to waiting room
                navigate('/waiting', {
                    state: {
                        roomCode,
                        nickname,
                        isHost: role === 'host',
                        mode: 'between-questions',
                        currentQuestion: (question.index || 0) + 1,
                        totalQuestions: location.state?.totalQuestions || 10,
                        lastAnswer: answer,
                        roundResults: {
                            correctAnswer: result.correctAnswer || "...",
                            scores: [],
                            teamMatched: result.teamMatched,
                            teammateAnswer: result.teammateAnswer,
                            waitingForTeammate: result.waitingForTeammate
                        },
                        isCorrect: result.isCorrect,
                        isTeamMode: question.isTeamMode
                    }
                });
            }
        });
    };

    if (!question) return <div className="min-h-screen bg-black text-white flex items-center justify-center">جاري تحميل اللعبة...</div>;

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

                {view === 'question' && (
                    <div className="flex flex-col items-center">
                        <div className="relative">
                            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                                <path className="text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                <path className={`${timeLeft < 10 ? 'text-red-500' : 'text-blue-500'} transition-all duration-1000 ease-linear`} strokeDasharray={`${(timeLeft / 30) * 100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            <span className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl font-black font-mono ${timeLeft < 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{timeLeft}</span>
                        </div>
                    </div>
                )}

                <div className="flex flex-col items-end min-w-[100px]">
                    <span className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-1">اللاعب</span>
                    <span className="text-xl font-bold text-white truncate max-w-[150px]">{nickname}</span>
                </div>
            </header>

            {/* QUESTION VIEW */}
            {view === 'question' && (
                <>
                    {/* Question Card */}
                    <div className="w-full max-w-4xl mb-8 relative z-10 perspective-1000">
                        <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl p-8 md:p-12 rounded-3xl shadow-2xl border border-white/10 text-center transform transition-all duration-500 hover:scale-[1.01]">
                            <h2 className="text-2xl md:text-4xl font-black leading-relaxed text-transparent bg-clip-text bg-gradient-to-r from-blue-100 via-white to-blue-100 drop-shadow-lg" dir="auto">
                                {question.question}
                            </h2>
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

                    {isHost && (
                        <div className="fixed bottom-6 right-6 z-50 animate-slide-in-right opacity-50 hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => socket.emit('end_round', { roomCode })}
                                className="bg-red-500/20 hover:bg-red-500/40 text-red-200 border border-red-500/50 px-4 py-2 rounded-full text-xs font-bold"
                            >
                                إنهاء الجولة فوراً ⏹️
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default GameScreen;

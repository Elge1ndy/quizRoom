import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socket from '../socket';
import WaitingScreen from '../components/WaitingScreen';
import { useToast } from '../context/ToastContext';

import SoundManager from '../utils/SoundManager';

const GameScreen = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { roomCode, nickname, role, initialQuestion, userId } = location.state || {}; // role: 'host' or 'player'

    const [question, setQuestion] = React.useState(initialQuestion || null);
    const [view, setView] = React.useState('question'); // 'question' | 'waiting'
    const [roundResults, setRoundResults] = React.useState(null);
    const [timeLeft, setTimeLeft] = React.useState(initialQuestion?.timeLeft || 30);
    const [selectedAnswer, setSelectedAnswer] = React.useState(null);
    const [hasAnswered, setHasAnswered] = React.useState(false);
    const [score, setScore] = React.useState(0);

    // Dynamic Role Handling
    const [isHost, setIsHost] = React.useState(role === 'host');

    React.useEffect(() => {
        // Initialize Audio Context on first user interaction or mount
        SoundManager.init();

        // Listen for new questions
        socket.on('game_started', (q) => {
            setQuestion(q);
            setView('question');
            setHasAnswered(false);
            setSelectedAnswer(null);
            setTimeLeft(q.timeLeft || 30);
        });

        socket.on('new_question', (q) => {
            setQuestion(q);
            setView('question');
            setHasAnswered(false);
            setSelectedAnswer(null);
            setTimeLeft(q.timeLeft || 30);
        });

        socket.on('round_ended', (results) => {
            setRoundResults(results);
            setView('waiting');
            showToast("↩️ العودة إلى صفحة الانتظار", "info");

            // Navigate to waiting room to see results and answers table
            navigate('/waiting', {
                state: {
                    roomCode,
                    nickname,
                    userId,
                    role: isHost ? 'host' : 'player',
                    isHost: isHost,
                    players: results.scores || [],
                    mode: 'between-questions',
                    currentQuestion: results.nextQuestionIndex,
                    totalQuestions: results.totalQuestions,
                    lastAnswer: selectedAnswer,
                    roundResults: results
                }
            });
        });

        socket.on('game_over', (results) => {
            navigate('/results', { state: { ...results, role: isHost ? 'host' : 'player', roomCode, nickname } });
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
    }, [navigate, selectedAnswer, nickname, isHost, roomCode]); // Added isHost dep to effect might be risky if effect re-runs too much? No, listeners created once. 
    // Actually, dependency array should include vars used inside.
    // Ideally separate effect for listeners. But this is fine.

    // Local Timer Effect for UI smoothness
    React.useEffect(() => {
        if (view !== 'question') return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 6 && prev > 0) {
                    SoundManager.playTick();
                }
                if (prev <= 1) {
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [view]);

    const handleNextQuestion = () => {
        socket.emit('next_question', { roomCode });
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

    const submitAnswer = (answer) => {
        if (hasAnswered) return;
        setHasAnswered(true);
        setSelectedAnswer(answer); // Optimistic update

        socket.emit('submit_answer', { roomCode, answer, timeRemaining: 0 }, (result) => {
            if (result) {
                if (result.isCorrect) {
                    SoundManager.playCorrect();
                } else if (result.isCorrect === false) {
                    SoundManager.playWrong();
                }
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

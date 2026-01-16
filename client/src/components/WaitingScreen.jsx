import React, { useEffect, useState } from 'react';
import ChatBox from '../components/ChatBox';

const WaitingScreen = ({ roomCode, nickname, roundResults, role, onNextQuestion }) => {
    const [timer, setTimer] = useState(10); // 10 seconds review time

    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) {
                    if (role === 'host') {
                        onNextQuestion(); // Auto-advance by host
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [role, onNextQuestion]);

    const calculateProgress = () => {
        if (!roundResults) return 0;
        return (roundResults.nextQuestionIndex / roundResults.totalQuestions) * 100;
    };

    return (
        <div className="flex flex-col items-center w-full max-w-4xl animate-fade-in">
            {/* Round Summary Card */}
            <div className="bg-gray-800/90 backdrop-blur-md rounded-3xl p-8 w-full shadow-2xl border border-gray-700 mb-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 h-2 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000" style={{ width: `${calculateProgress()}%` }}></div>

                <h2 className="text-gray-400 text-sm uppercase tracking-widest font-bold mb-4 text-center">الإجابة الصحيحة</h2>
                <div className="text-3xl md:text-5xl font-black text-center text-green-400 mb-8 drop-shadow-lg">
                    {roundResults.correctAnswer}
                </div>

                {/* Mini Leaderboard */}
                <div className="space-y-3 max-h-60 overflow-y-auto">
                    <h3 className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-2">ترتيب الجولة</h3>
                    {roundResults.scores.slice(0, 5).map((player, idx) => (
                        <div key={idx} className={`flex justify-between items-center p-3 rounded-xl ${player.nickname === nickname ? 'bg-blue-600/20 border border-blue-500' : 'bg-gray-700/30'}`}>
                            <div className="flex items-center gap-3">
                                <span className={`font-mono font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs ${idx === 0 ? 'bg-yellow-500 text-black' : 'bg-gray-600'}`}>
                                    {idx + 1}
                                </span>
                                <span className="font-bold">{player.nickname}</span>
                            </div>
                            <span className="font-mono text-yellow-500">{player.score}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Timer & Controls */}
            <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                    <p className="text-gray-400 text-sm mb-2">السؤال التالي خلال</p>
                    <div className="text-4xl font-black font-mono text-white animate-pulse">
                        {timer}
                    </div>
                </div>

                {role === 'host' && (
                    <button
                        onClick={onNextQuestion}
                        className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full text-sm transition-colors border border-white/10"
                    >
                        تخطي الانتظار ⏭️
                    </button>
                )}
            </div>

            {/* Playing Chat (Visible during Waiting) */}
            <div className="w-full mt-8 h-64 relative">
                <ChatBox
                    roomCode={roomCode}
                    nickname={nickname}
                    isOpen={true} // Always open embedded in waiting screen
                    onClose={() => { }} // No close
                />
            </div>
        </div>
    );
};

export default WaitingScreen;

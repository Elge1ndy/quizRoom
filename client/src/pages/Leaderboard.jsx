import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socket from '../socket';

const Leaderboard = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { scores, winner, roomCode, role, nickname } = location.state || { scores: [], winner: null };

    useEffect(() => {
        if (roomCode) {
            const handleGameReset = () => {
                // Navigate back to appropriate lobby based on role
                if (role === 'host') {
                    navigate(`/host/${roomCode}`);
                } else {
                    const myself = sortedScores.find(p => p.id === socket.id);
                    // Pass current name/avatar back to preserve changes
                    navigate('/lobby', {
                        state: {
                            roomCode,
                            nickname: myself?.nickname || nickname,
                            avatar: myself?.avatar,
                            role: 'player'
                        }
                    });
                }
            };

            socket.on('game_reset', handleGameReset);
            return () => socket.off('game_reset', handleGameReset);
        }
    }, [roomCode, role, nickname, navigate]);

    // Sort scores desc
    const sortedScores = [...(scores || [])].sort((a, b) => b.score - a.score);

    return (
        <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-indigo-950 via-gray-900 to-black text-white p-4 font-sans overflow-hidden relative">
            {/* Celebration Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-10 left-1/4 w-2 h-2 bg-yellow-400 rounded-full animate-ping"></div>
                <div className="absolute top-20 right-1/4 w-3 h-3 bg-blue-400 rounded-full animate-ping delay-300"></div>
                <div className="absolute bottom-1/4 left-1/3 w-2 h-2 bg-pink-400 rounded-full animate-ping delay-700"></div>
                <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-yellow-500/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 animate-pulse"></div>
            </div>

            <div className="relative z-10 w-full max-w-4xl flex flex-col items-center">
                <h1 className="text-5xl md:text-7xl font-black mb-12 text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-100 to-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] tracking-tight">
                    النتائج النهائية
                </h1>

                {/* Podium Section */}
                {sortedScores.length > 0 && (
                    <div className="flex justify-center items-end gap-4 mb-16 w-full max-w-2xl min-h-[300px]">
                        {/* 2nd Place */}
                        {sortedScores[1] && (
                            <div className="flex flex-col items-center w-1/3 animate-slide-up delay-100">
                                <div className="mb-2 text-center flex flex-col items-center">
                                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center text-3xl mb-1 shadow-lg border border-gray-400/30">
                                        {sortedScores[1].avatar || '👤'}
                                    </div>
                                    <span className="block text-xl font-bold truncate max-w-[120px]">{sortedScores[1].nickname}</span>
                                    <span className="text-gray-400 text-sm">{sortedScores[1].score} نقطة</span>
                                </div>
                                <div className="w-full h-32 bg-gradient-to-b from-gray-300 to-gray-500 rounded-t-xl border-t-4 border-gray-400 shadow-2xl flex items-center justify-center relative group">
                                    <span className="text-4xl font-black text-white/50 group-hover:text-white transition-colors">2</span>
                                </div>
                            </div>
                        )}

                        {/* 1st Place */}
                        {sortedScores[0] && (
                            <div className="flex flex-col items-center w-1/3 z-20 -mx-2 animate-slide-up">
                                <div className="mb-4 text-center flex flex-col items-center">
                                    <div className="text-5xl mb-2 animate-bounce">👑</div>
                                    <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center text-5xl mb-2 shadow-2xl border-2 border-yellow-400 animate-pulse">
                                        {sortedScores[0].avatar || '👤'}
                                    </div>
                                    <span className="block text-2xl font-black text-yellow-400 truncate max-w-[150px]">{sortedScores[0].nickname}</span>
                                    <span className="text-yellow-200 text-lg font-bold">{sortedScores[0].score} نقطة</span>
                                </div>
                                <div className="w-full h-48 bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 rounded-t-xl border-t-4 border-yellow-300 shadow-[0_0_30px_rgba(234,179,8,0.4)] flex items-center justify-center relative group overflow-hidden">
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                                    <span className="text-6xl font-black text-white/80 relative z-10">1</span>
                                </div>
                            </div>
                        )}

                        {/* 3rd Place */}
                        {sortedScores[2] && (
                            <div className="flex flex-col items-center w-1/3 animate-slide-up delay-200">
                                <div className="mb-2 text-center flex flex-col items-center">
                                    <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-2xl mb-1 shadow-lg border border-amber-600/30">
                                        {sortedScores[2].avatar || '👤'}
                                    </div>
                                    <span className="block text-xl font-bold truncate max-w-[120px]">{sortedScores[2].nickname}</span>
                                    <span className="text-gray-400 text-sm">{sortedScores[2].score} نقطة</span>
                                </div>
                                <div className="w-full h-24 bg-gradient-to-b from-amber-600 to-amber-800 rounded-t-xl border-t-4 border-amber-500 shadow-2xl flex items-center justify-center relative group">
                                    <span className="text-4xl font-black text-white/50 group-hover:text-white transition-colors">3</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Remaining Players List */}
                {sortedScores.length > 3 && (
                    <div className="w-full bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 shadow-xl mb-8 max-h-64 overflow-y-auto custom-scrollbar">
                        <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-4 font-bold sticky top-0 bg-gray-900/50 backdrop-blur pb-2">باقي المتصدرين</h3>
                        <div className="space-y-3">
                            {sortedScores.slice(3).map((player, index) => (
                                <div key={index + 3} className="flex justify-between items-center bg-white/5 p-4 rounded-xl hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <span className="text-gray-500 font-mono font-bold">#{index + 4}</span>
                                        <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-xl border border-white/5">
                                            {player.avatar || '👤'}
                                        </div>
                                        <span className="font-bold">{player.nickname}</span>
                                    </div>
                                    <span className="text-yellow-500 font-bold">{player.score}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-4">
                    {role === 'host' && (
                        <button
                            onClick={() => socket.emit('play_again', { roomCode })}
                            className="group relative px-8 py-4 bg-blue-600 text-white font-black text-xl rounded-full shadow-2xl transition-all hover:scale-105 hover:bg-blue-500"
                        >
                            <span>🔄 العب مجدداً</span>
                        </button>
                    )}

                    <button
                        onClick={() => navigate('/')}
                        className="group relative px-8 py-4 bg-white text-black font-black text-xl rounded-full shadow-2xl transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] overflow-hidden"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            <span>العودة للرئيسية</span>
                            <span className="group-hover:rotate-180 transition-transform">🏠</span>
                        </span>
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Leaderboard;

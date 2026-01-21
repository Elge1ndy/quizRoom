import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import { getPersistentDeviceId } from '../utils/userAuth';

const Leaderboard = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { scores, winner, roomCode, role, nickname, packData } = location.state || { scores: [], winner: null };

    const deviceId = getPersistentDeviceId();

    const cleanupIfEmpty = async () => {
        try {
            // 1. Remove from room_players
            await supabase.from('room_players').delete().eq('room_code', roomCode).eq('player_id', deviceId);

            // 2. Check online players
            const state = realtime.getPresenceState();
            const onlineCount = Object.values(state).flat().length;

            if (onlineCount <= 1) {
                console.log("🗑️ Empty room detected in leaderboard - closing room:", roomCode);
                await supabase.from('rooms').delete().eq('room_code', roomCode);
            }
        } catch (err) {
            console.error("Cleanup error in leaderboard:", err);
        }
    };

    React.useEffect(() => {
        if (!roomCode) return;

        const handleRoomReset = (data) => {
            console.log('Leaderboard: Room reset received, navigating to waiting room...');
            navigate(`/waiting/${roomCode}`, {
                state: {
                    roomCode,
                    nickname,
                    userId: location.state?.userId,
                    isHost: role === 'host',
                    players: data?.players || [],
                    mode: 'pre-game'
                }
            });
        };

        realtime.on('room_reset', handleRoomReset);

        return () => {
            realtime.off('room_reset');
        };
    }, [roomCode, role, nickname, navigate, location.state?.userId]);

    // Cleanup Room when last player leaves (Tab close / Navigate away)
    // Cleanup Room when last player leaves (Tab close / Navigate away)
    React.useEffect(() => {
        const handleUnload = () => {
            const deviceId = getPersistentDeviceId();
            if (!roomCode || !deviceId) return;

            // Use keepalive fetch for reliable cleanup on close
            const headers = {
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            };

            // 1. Delete Player Row
            const playerUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/room_players?room_code=eq.${roomCode}&player_id=eq.${deviceId}`;
            fetch(playerUrl, {
                method: 'DELETE',
                headers: headers,
                keepalive: true
            });

            // If Host, also try to delete the room (optimistic)
            if (role === 'host') {
                const roomUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rooms?room_code=eq.${roomCode}`;
                fetch(roomUrl, {
                    method: 'DELETE',
                    headers: headers,
                    keepalive: true
                });
            }
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => {
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [roomCode, role]);

    // Sort scores desc and calculate ranks (standard competition ranking: 1, 2, 2, 4)
    const sortedScores = [...(scores || [])].sort((a, b) => b.score - a.score);
    let currentRank = 1;
    const rankedScores = sortedScores.map((player, index, array) => {
        if (index > 0 && player.score < array[index - 1].score) {
            currentRank = index + 1;
        }
        return { ...player, rank: currentRank };
    });


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
                <h1 className="text-5xl md:text-7xl font-black mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-100 to-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] tracking-tight">
                    🏆 الفائزون
                </h1>


                {/* Winner Announcement Text - Top Banner */}
                {sortedScores[0] && (
                    <div className="mb-12 w-full max-w-2xl bg-gradient-to-r from-yellow-500/20 via-yellow-400/30 to-yellow-500/20 backdrop-blur-xl border-y border-yellow-400/30 py-6 px-4 text-center animate-bounce-in shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center justify-center gap-4 text-3xl md:text-5xl font-black">
                                <span className="animate-pulse">🎉</span>
                                <p className="bg-clip-text text-transparent bg-gradient-to-b from-white to-yellow-400">
                                    تهانينا <span className="text-yellow-400 underline decoration-wavy decoration-yellow-600/50">{sortedScores[0].nickname}</span>!
                                </p>
                                <span className="animate-pulse">🎉</span>
                            </div>
                            <p className="text-xl md:text-2xl font-bold text-yellow-200/80">لقد فزت بالمركز الأول باكتساح!</p>
                        </div>
                    </div>
                )}

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
                                    <span className="block text-xl font-bold truncate max-w-[120px]">{rankedScores[1].nickname}</span>
                                    <span className="text-gray-400 text-sm">{rankedScores[1].score} نقطة</span>

                                </div>
                                <div className="w-full h-32 bg-gradient-to-b from-gray-300 to-gray-500 rounded-t-xl border-t-4 border-gray-400 shadow-2xl flex items-center justify-center relative group">
                                    <span className="text-4xl font-black text-white/50 group-hover:text-white transition-colors">
                                        {rankedScores[1].rank}
                                    </span>

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
                                    <span className="block text-2xl font-black text-yellow-400 truncate max-w-[150px]">{rankedScores[0].nickname}</span>
                                    <span className="text-yellow-200 text-lg font-bold">{rankedScores[0].score} نقطة</span>

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
                                    <span className="block text-xl font-bold truncate max-w-[120px]">{rankedScores[2].nickname}</span>
                                    <span className="text-gray-400 text-sm">{rankedScores[2].score} نقطة</span>

                                </div>
                                <div className="w-full h-24 bg-gradient-to-b from-amber-600 to-amber-800 rounded-t-xl border-t-4 border-amber-500 shadow-2xl flex items-center justify-center relative group">
                                    <span className="text-4xl font-black text-white/50 group-hover:text-white transition-colors">
                                        {rankedScores[2].rank}
                                    </span>

                                </div>

                            </div>
                        )}
                    </div>
                )}

                {/* Winner Announcement Text */}
                {/* Remaining Players List */}
                {sortedScores.length > 3 && (
                    <div className="w-full bg-white/5 backdrop-blur-md rounded-[2rem] p-6 border border-white/10 shadow-2xl mb-12 max-h-64 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-6 sticky top-0 bg-gray-900/80 backdrop-blur pb-4 border-b border-white/5">
                            <h3 className="text-gray-400 text-xs uppercase tracking-[0.3em] font-black">باقي المتصدرين</h3>
                            <span className="text-[10px] bg-white/10 px-2 py-1 rounded-full text-white/50">{sortedScores.length - 3} لاعبين</span>
                        </div>
                        <div className="space-y-3">
                            {rankedScores.slice(3).map((player, index) => (
                                <div key={index + 3} className="flex justify-between items-center bg-white/[0.03] p-4 rounded-2xl hover:bg-white/[0.07] transition-all border border-transparent hover:border-white/5 group">

                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/40 text-gray-500 font-mono text-xs font-black">
                                            #{player.rank}
                                        </div>


                                        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-2xl border border-white/5 group-hover:scale-110 transition-transform shadow-lg">
                                            {player.avatar || '👤'}
                                        </div>
                                        <span className="font-bold text-lg">{player.nickname}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-yellow-500 font-black text-xl">{player.score}</span>
                                        <span className="text-[10px] text-gray-500 uppercase font-bold">نقطة</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-4 w-full max-w-md animate-slide-up delay-500">
                    {role === 'host' ? (
                        <button
                            onClick={async () => {
                                // 1. Reset Room State in DB
                                await supabase
                                    .from('rooms')
                                    .update({
                                        state: 'waiting',
                                        current_question_index: 0
                                    })
                                    .eq('room_code', roomCode);

                                // 2. Clear Player Scores for this room
                                await supabase
                                    .from('room_players')
                                    .update({ score: 0, is_ready: false, last_answer: null, is_correct: null })
                                    .eq('room_code', roomCode);

                                // 3. Broadcast Reset
                                realtime.broadcast('room_reset', { players: [] });
                            }}
                            className="w-full px-8 py-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-2xl rounded-3xl shadow-[0_10px_40px_rgba(37,99,235,0.4)] transition-all hover:scale-[1.05] active:scale-95 hover:shadow-blue-500/50 flex flex-col items-center justify-center relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                            <span className="relative z-10 flex items-center gap-3">
                                <span>🔄 العب مجدداً</span>
                            </span>
                            <span className="text-xs text-blue-200 mt-1 font-bold opacity-80 relative z-10 uppercase tracking-widest">بدء جولة جديدة الآن</span>
                        </button>
                    ) : (
                        <div className="w-full px-8 py-6 bg-white/[0.03] border-2 border-dashed border-white/10 text-gray-400 font-bold text-lg rounded-3xl flex flex-col items-center justify-center gap-2 backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                                <span>في انتظار المضيف لبدء دور جديد... ⏳</span>
                            </div>
                            <span className="text-[10px] opacity-40 font-black uppercase tracking-widest leading-none">فقط المضيف يملك صلاحية البداية</span>
                        </div>
                    )}

                    <button
                        onClick={async () => {
                            if (role === 'host') {
                                // Reset to waiting state for everyone
                                await supabase.from('rooms').update({ state: 'waiting' }).eq('room_code', roomCode);
                                realtime.broadcast('room_reset', { players: [] });
                            } else {
                                navigate(`/waiting/${roomCode}`, { state: location.state });
                            }
                        }}
                        className="w-full px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-black text-xl rounded-2xl shadow-xl transition-all hover:scale-[1.02] border border-white/10 flex items-center justify-center gap-3"
                    >
                        <span>العودة للانتظار</span>
                        <span className="text-2xl">⏳</span>
                    </button>

                    {role === 'host' && (
                        <button
                            onClick={async () => {
                                if (window.confirm("هل أنت متأكد من إنهاء الغرفة تماماً؟")) {
                                    await supabase.from('rooms').delete().eq('room_code', roomCode);
                                    realtime.broadcast('room_deleted', {});
                                    navigate('/');
                                }
                            }}
                            className="w-full px-8 py-4 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white font-black text-xl rounded-2xl shadow-xl transition-all hover:scale-[0.98] border border-red-500/30 flex items-center justify-center gap-3"
                        >
                            <span>إنهاء الغرفة</span>
                            <span className="text-2xl">❌</span>
                        </button>
                    )}

                    <button
                        onClick={async () => {
                            await cleanupIfEmpty();
                            navigate('/');
                        }}
                        className="w-full px-8 py-4 bg-gray-600/20 hover:bg-gray-600 text-gray-300 hover:text-white font-black text-xl border border-white/5 rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
                    >
                        <span>الرئيسية</span>
                        <span className="text-2xl">🏠</span>
                    </button>

                </div>
            </div>
        </div>
    );
};

export default Leaderboard;

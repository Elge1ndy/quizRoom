import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import { getPersistentDeviceId } from '../utils/userAuth';
import SoundManager from '../utils/SoundManager';

const Leaderboard = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state || {};
    const { scores, roomCode, role, nickname, userId, teamResults, packName } = state;

    const deviceId = getPersistentDeviceId();
    const [statsUpdated, setStatsUpdated] = React.useState(false);

    const cleanupIfEmpty = async () => {
        try {
            await supabase.from('room_players').delete().eq('room_code', roomCode).eq('player_id', deviceId);

            const { data: remaining } = await supabase
                .from('room_players')
                .select('player_id')
                .eq('room_code', roomCode);

            if (!remaining || remaining.length === 0) {
                await supabase.from('rooms').delete().eq('room_code', roomCode);
            }
        } catch (err) {
            console.error("Cleanup error:", err);
        }
    };

    React.useEffect(() => {
        if (!roomCode || statsUpdated) return;

        const updatePlayerStats = async () => {
            try {
                const totalPlayers = (scores || []).filter(p => p.role !== 'host').length || (scores || []).length;

                for (const player of (scores || [])) {
                    const pid = player.player_id || player.id;
                    if (!pid) continue;

                    const { data: existing } = await supabase
                        .from('players')
                        .select('total_points, total_games, total_wins, total_correct, total_questions, xp, level, game_history')
                        .eq('device_id', pid)
                        .single();

                    if (!existing) continue;

                    const playerScore = player.score || 0;
                    const isCorrect = player.is_correct === true;
                    const rank = getRank(pid);
                    const isWinner = rank === 1;

                    const newXp = existing.xp + playerScore;
                    const newLevel = Math.floor(newXp / 1000) + 1;

                    const historyRecord = {
                        pack_name: packName || 'Unknown',
                        date: new Date().toISOString(),
                        rank,
                        score: playerScore,
                        total_players: totalPlayers
                    };

                    const updatedHistory = [...(existing.game_history || []), historyRecord];

                    await supabase
                        .from('players')
                        .update({
                            total_points: existing.total_points + playerScore,
                            total_games: existing.total_games + 1,
                            total_wins: existing.total_wins + (isWinner ? 1 : 0),
                            total_correct: existing.total_correct + (isCorrect ? 1 : 0),
                            total_questions: existing.total_questions + 1,
                            xp: newXp,
                            level: newLevel,
                            game_history: updatedHistory,
                            last_seen: new Date().toISOString()
                        })
                        .eq('device_id', pid);
                }
                setStatsUpdated(true);
            } catch (err) {
                console.error("Error updating stats:", err);
            }
        };

        updatePlayerStats();
    }, [roomCode, scores]);

    const getRank = (pid) => {
        const sorted = [...(scores || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
        for (let i = 0; i < sorted.length; i++) {
            if ((sorted[i].player_id || sorted[i].id) === pid) return i + 1;
        }
        return sorted.length;
    };

    React.useEffect(() => {
        if (!roomCode) return;
        const handleRoomReset = (data) => {
            navigate(`/waiting/${roomCode}`, {
                state: { roomCode, nickname, userId, isHost: role === 'host', players: data?.players || [], mode: 'pre-game' }
            });
        };
        realtime.on('room_reset', handleRoomReset);
        return () => realtime.off('room_reset');
    }, [roomCode, role, nickname, navigate, userId]);

    React.useEffect(() => {
        const handleUnload = () => cleanupIfEmpty();
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [roomCode, role]);

    React.useEffect(() => {
        try { SoundManager.playWin(); } catch (e) {}
    }, []);

    const sortedScores = [...(scores || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
    let currentRank = 1;
    const rankedScores = sortedScores.map((player, index, array) => {
        if (index > 0 && (player.score || 0) < (array[index - 1].score || 0)) {
            currentRank = index + 1;
        }
        return { ...player, rank: currentRank };
    });

    const winner = sortedScores[0];

    return (
        <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-indigo-950 via-gray-900 to-black text-white p-4 font-sans overflow-hidden relative">
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

                {winner && (
                    <div className="mb-12 w-full max-w-2xl bg-gradient-to-r from-yellow-500/20 via-yellow-400/30 to-yellow-500/20 backdrop-blur-xl border-y border-yellow-400/30 py-6 px-4 text-center animate-bounce-in shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center justify-center gap-4 text-3xl md:text-5xl font-black">
                                <span className="animate-pulse">🎉</span>
                                <p className="bg-clip-text text-transparent bg-gradient-to-b from-white to-yellow-400">
                                    تهانينا <span className="text-yellow-400 underline decoration-wavy decoration-yellow-600/50">{winner.nickname}</span>!
                                </p>
                                <span className="animate-pulse">🎉</span>
                            </div>
                            <p className="text-xl md:text-2xl font-bold text-yellow-200/80">لقد فزت بالمركز الأول!</p>
                        </div>
                    </div>
                )}

                {sortedScores.length > 0 && (
                    <div className="flex justify-center items-end gap-4 mb-16 w-full max-w-2xl min-h-[300px]">
                        {sortedScores[1] && (
                            <div className="flex flex-col items-center w-1/3 animate-slide-up delay-100">
                                <div className="mb-2 text-center flex flex-col items-center">
                                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center text-3xl mb-1 shadow-lg border border-gray-400/30">
                                        {sortedScores[1].avatar || '👤'}
                                    </div>
                                    <span className="block text-xl font-bold truncate max-w-[120px]">{rankedScores[1].nickname}</span>
                                    <span className="text-gray-400 text-sm">{rankedScores[1].score || 0} نقطة</span>
                                    {(rankedScores[1].speed_bonus || rankedScores[1].combo_bonus) && (
                                        <div className="flex gap-1 mt-1">
                                            {rankedScores[1].speed_bonus && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1 py-0.5 rounded font-bold">⚡</span>}
                                            {rankedScores[1].combo_bonus && <span className="text-[9px] bg-orange-500/20 text-orange-300 px-1 py-0.5 rounded font-bold">🔥</span>}
                                        </div>
                                    )}
                                    {rankedScores[1].is_correct && <span className="text-[10px] text-green-400">✅</span>}
                                </div>
                                <div className="w-full h-32 bg-gradient-to-b from-gray-300 to-gray-500 rounded-t-xl border-t-4 border-gray-400 shadow-2xl flex items-center justify-center">
                                    <span className="text-4xl font-black text-white/50">{rankedScores[1].rank}</span>
                                </div>
                            </div>
                        )}

                        {sortedScores[0] && (
                            <div className="flex flex-col items-center w-1/3 z-20 -mx-2 animate-slide-up">
                                <div className="mb-4 text-center flex flex-col items-center">
                                    <div className="text-5xl mb-2 animate-bounce">👑</div>
                                    <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center text-5xl mb-2 shadow-2xl border-2 border-yellow-400 animate-pulse">
                                        {sortedScores[0].avatar || '👤'}
                                    </div>
                                    <span className="block text-2xl font-black text-yellow-400 truncate max-w-[150px]">{rankedScores[0].nickname}</span>
                                    <span className="text-yellow-200 text-lg font-bold">{rankedScores[0].score || 0} نقطة</span>
                                    {(rankedScores[0].speed_bonus || rankedScores[0].combo_bonus) && (
                                        <div className="flex gap-1 mt-1">
                                            {rankedScores[0].speed_bonus && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded font-bold">⚡ سريع</span>}
                                            {rankedScores[0].combo_bonus && <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-bold">🔥 كومبو</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="w-full h-48 bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 rounded-t-xl border-t-4 border-yellow-300 shadow-[0_0_30px_rgba(234,179,8,0.4)] flex items-center justify-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-500"></div>
                                    <span className="text-6xl font-black text-white/80 relative z-10">1</span>
                                </div>
                            </div>
                        )}

                        {sortedScores[2] && (
                            <div className="flex flex-col items-center w-1/3 animate-slide-up delay-200">
                                <div className="mb-2 text-center flex flex-col items-center">
                                    <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-2xl mb-1 shadow-lg border border-amber-600/30">
                                        {sortedScores[2].avatar || '👤'}
                                    </div>
                                    <span className="block text-xl font-bold truncate max-w-[120px]">{rankedScores[2].nickname}</span>
                                    <span className="text-gray-400 text-sm">{rankedScores[2].score || 0} نقطة</span>
                                    {(rankedScores[2].speed_bonus || rankedScores[2].combo_bonus) && (
                                        <div className="flex gap-1 mt-1">
                                            {rankedScores[2].speed_bonus && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1 py-0.5 rounded font-bold">⚡</span>}
                                            {rankedScores[2].combo_bonus && <span className="text-[9px] bg-orange-500/20 text-orange-300 px-1 py-0.5 rounded font-bold">🔥</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="w-full h-24 bg-gradient-to-b from-amber-600 to-amber-800 rounded-t-xl border-t-4 border-amber-500 shadow-2xl flex items-center justify-center">
                                    <span className="text-4xl font-black text-white/50">{rankedScores[2].rank}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {sortedScores.length > 3 && (
                    <div className="w-full bg-white/5 backdrop-blur-md rounded-[2rem] p-6 border border-white/10 shadow-2xl mb-12 max-h-64 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-6 sticky top-0 bg-gray-900/80 backdrop-blur pb-4 border-b border-white/5">
                            <h3 className="text-gray-400 text-xs uppercase tracking-[0.3em] font-black">باقي المتصدرين</h3>
                            <span className="text-[10px] bg-white/10 px-2 py-1 rounded-full text-white/50">{sortedScores.length - 3} لاعبين</span>
                        </div>
                        <div className="space-y-3">
                            {rankedScores.slice(3).map((player, index) => (
                                <div key={index + 3} className="flex justify-between items-center bg-white/[0.03] p-4 rounded-2xl hover:bg-white/[0.07] transition-all border border-transparent hover:border-white/5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/40 text-gray-500 font-mono text-xs font-black">
                                            #{player.rank}
                                        </div>
                                        <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center text-2xl border border-white/5">
                                            {player.avatar || '👤'}
                                        </div>
                                        <span className="font-bold text-lg">{player.nickname}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-yellow-500 font-black text-xl">{player.score || 0}</span>
                                        <span className="text-[10px] text-gray-500 uppercase font-bold">نقطة</span>
                                        {(player.speed_bonus || player.combo_bonus) && (
                                            <div className="flex gap-1 mt-1">
                                                {player.speed_bonus && <span className="text-[8px] bg-yellow-500/20 text-yellow-300 px-1 py-0.5 rounded font-bold">⚡</span>}
                                                {player.combo_bonus && <span className="text-[8px] bg-orange-500/20 text-orange-300 px-1 py-0.5 rounded font-bold">🔥</span>}
                                            </div>
                                        )}
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
                                await supabase.from('rooms').update({ state: 'waiting', current_question_index: 0 }).eq('room_code', roomCode);
                                await supabase.from('room_players').update({ score: 0, is_ready: false, last_answer: null, is_correct: null, has_answered: false }).eq('room_code', roomCode);
                                realtime.broadcast('room_reset', { players: [] });
                            }}
                            className="w-full px-8 py-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-2xl rounded-3xl shadow-[0_10px_40px_rgba(37,99,235,0.4)] transition-all hover:scale-[1.05] active:scale-95 hover:shadow-blue-500/50 flex flex-col items-center justify-center relative overflow-hidden group"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                            <span className="relative z-10 flex items-center gap-3">
                                <span>🔄 العب مجدداً</span>
                            </span>
                            <span className="text-xs text-blue-200 mt-1 font-bold opacity-80 relative z-10 uppercase tracking-widest">بدء جولة جديدة</span>
                        </button>
                    ) : (
                        <div className="w-full px-8 py-6 bg-white/[0.03] border-2 border-dashed border-white/10 text-gray-400 font-bold text-lg rounded-3xl flex flex-col items-center justify-center gap-2 backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                                <span>في انتظار المضيف لبدء دور جديد... ⏳</span>
                            </div>
                        </div>
                    )}

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

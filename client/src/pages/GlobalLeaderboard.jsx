import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getPersistentDeviceId } from '../utils/userAuth';

const GlobalLeaderboard = () => {
    const navigate = useNavigate();
    const deviceId = getPersistentDeviceId();
    const [players, setPlayers] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState('points'); // 'points' | 'wins' | 'level'

    React.useEffect(() => {
        const fetchLeaderboard = async () => {
            const { data } = await supabase
                .from('players')
                .select('device_id, nickname, avatar, total_points, total_wins, total_games, total_correct, total_questions, xp, level')
                .order(activeTab === 'points' ? 'total_points' : activeTab === 'wins' ? 'total_wins' : 'level', { ascending: false })
                .limit(50);

            if (data) setPlayers(data);
            setLoading(false);
        };
        fetchLeaderboard();
    }, [activeTab]);

    const getRank = (idx) => {
        const medals = ['🥇', '🥈', '🥉'];
        return medals[idx] || `#${idx + 1}`;
    };

    const getAccuracy = (p) => {
        if (!p.total_questions) return 0;
        return Math.round((p.total_correct / p.total_questions) * 100);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white font-sans">
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-600/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-100 to-yellow-500 mb-2">
                        🏆 لوحة الصدارة
                    </h1>
                    <p className="text-gray-400 text-sm">أفضل اللاعبين في QuizRoom</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-8 justify-center">
                    {[
                        { id: 'points', label: '⭐ النقاط', key: 'total_points' },
                        { id: 'wins', label: '🏆 الفوز', key: 'total_wins' },
                        { id: 'level', label: '📊 المستوى', key: 'level' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
                                activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Top 3 Podium */}
                {players.length >= 3 && (
                    <div className="flex justify-center items-end gap-4 mb-12">
                        {/* 2nd */}
                        <div className="flex flex-col items-center w-1/3">
                            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center text-3xl mb-2 border border-gray-400/30">
                                {players[1]?.avatar || '👤'}
                            </div>
                            <span className="text-sm font-bold truncate max-w-[100px]">{players[1]?.nickname}</span>
                            <span className="text-xs text-gray-400">{players[1]?.[activeTab === 'points' ? 'total_points' : activeTab === 'wins' ? 'total_wins' : 'level'] || 0}</span>
                            <div className="w-full h-28 bg-gradient-to-b from-gray-300 to-gray-500 rounded-t-xl mt-2 flex items-center justify-center">
                                <span className="text-3xl font-black text-white/50">2</span>
                            </div>
                        </div>

                        {/* 1st */}
                        <div className="flex flex-col items-center w-1/3 z-10 -mx-2">
                            <div className="text-4xl mb-1">👑</div>
                            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center text-4xl mb-2 border-2 border-yellow-400">
                                {players[0]?.avatar || '👤'}
                            </div>
                            <span className="text-lg font-black text-yellow-400 truncate max-w-[120px]">{players[0]?.nickname}</span>
                            <span className="text-sm text-yellow-200 font-bold">{players[0]?.[activeTab === 'points' ? 'total_points' : activeTab === 'wins' ? 'total_wins' : 'level'] || 0}</span>
                            <div className="w-full h-40 bg-gradient-to-b from-yellow-400 to-yellow-700 rounded-t-xl mt-2 flex items-center justify-center">
                                <span className="text-5xl font-black text-white/80">1</span>
                            </div>
                        </div>

                        {/* 3rd */}
                        <div className="flex flex-col items-center w-1/3">
                            <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-2xl mb-2 border border-amber-600/30">
                                {players[2]?.avatar || '👤'}
                            </div>
                            <span className="text-sm font-bold truncate max-w-[100px]">{players[2]?.nickname}</span>
                            <span className="text-xs text-gray-400">{players[2]?.[activeTab === 'points' ? 'total_points' : activeTab === 'wins' ? 'total_wins' : 'level'] || 0}</span>
                            <div className="w-full h-24 bg-gradient-to-b from-amber-600 to-amber-800 rounded-t-xl mt-2 flex items-center justify-center">
                                <span className="text-3xl font-black text-white/50">3</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rest of players */}
                <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
                    <div className="p-4 border-b border-white/5">
                        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                            {activeTab === 'points' ? 'أعلى النقاط' : activeTab === 'wins' ? 'أكثر الفوز' : 'أعلى مستوى'}
                        </span>
                    </div>
                    <div className="divide-y divide-white/5">
                        {players.slice(3).map((player, idx) => {
                            const isMe = player.device_id === deviceId;
                            const value = activeTab === 'points' ? player.total_points : activeTab === 'wins' ? player.total_wins : player.level;
                            return (
                                <div key={player.device_id} className={`flex items-center justify-between px-4 py-3 ${isMe ? 'bg-blue-600/10' : idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm w-8 text-center text-gray-500 font-bold">#{idx + 4}</span>
                                        <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-xl border border-white/10">
                                            {player.avatar || '👤'}
                                        </div>
                                        <div>
                                            <span className={`text-sm font-bold ${isMe ? 'text-blue-400' : 'text-gray-200'}`}>{player.nickname}</span>
                                            <div className="flex gap-2 text-[10px] text-gray-500">
                                                <span>{player.total_games} لعبة</span>
                                                <span>•</span>
                                                <span>{getAccuracy(player)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-lg font-black text-yellow-400">{value}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Back button */}
                <button
                    onClick={() => navigate('/')}
                    className="mt-8 w-full py-4 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 font-bold transition-all border border-white/5"
                >
                    ← الرئيسية
                </button>
            </div>
        </div>
    );
};

export default GlobalLeaderboard;

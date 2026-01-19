import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import { useToast } from '../context/ToastContext';

const AdminDashboard = () => {
    const [password, setPassword] = useState('');
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();
    const navigate = useNavigate();

    const handleLogin = (e) => {
        e.preventDefault();
        if (password === 'admin123') {
            setIsAuthorized(true);
            showToast("تم الدخول بصلاحيات المسؤول 🔐", "success");
        } else {
            showToast("كلمة المرور غير صحيحة 🛑", "error");
        }
    };

    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [stats, setStats] = useState(null);
    const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'rooms' | 'chat'
    const [globalMessages, setGlobalMessages] = useState([]);

    React.useEffect(() => {
        if (!isAuthorized) return;

        const fetchDetailedStats = async () => {
            const now = new Date();
            const onlineThreshold = new Date(now.getTime() - 30000).toISOString(); // 30 seconds

            const { data: allPlayers } = await supabase.from('players').select('*').order('last_seen', { ascending: false });
            const { data: rooms } = await supabase.from('rooms').select('*, room_players(*)').neq('state', 'finished');

            setStats({
                totalPlayers: allPlayers?.length || 0,
                onlinePlayers: allPlayers?.filter(p => p.last_seen > onlineThreshold).length || 0,
                activeRooms: rooms?.length || 0,
                players: allPlayers || [],
                rooms: rooms?.map(r => ({
                    roomCode: r.room_code,
                    state: r.state,
                    hostName: r.settings?.nickname || 'Host',
                    playerCount: r.room_players?.length || 0,
                    packName: r.pack_data?.name || 'Unknown',
                    hostId: r.host_id,
                    playerDetails: r.room_players || []
                })) || []
            });
        };

        const fetchGlobalChat = async () => {
            const { data } = await supabase
                .from('chat_messages')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            setGlobalMessages(data || []);
        };

        fetchDetailedStats();
        fetchGlobalChat();

        // Subscription for live updates
        const channel = supabase
            .channel('admin_stats')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fetchDetailedStats)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchDetailedStats)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players' }, fetchDetailedStats)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
                setGlobalMessages(prev => [payload.new, ...prev].slice(0, 50));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isAuthorized]);

    const handleFullReset = async () => {
        if (window.confirm("⚠️ تنبيه حرج: سيتم مسح جميع الغرف وتصفير البيانات. هل أنت متأكد؟")) {
            setIsLoading(true);
            try {
                await supabase.from('room_players').delete().neq('room_code', '');
                await supabase.from('rooms').delete().neq('room_code', '');
                await supabase.from('chat_messages').delete().neq('room_code', '');

                showToast("تم إعادة ضبط النظام بنجاح 🧨", "success");
                setIsLoading(false);
            } catch (err) {
                console.error(err);
                showToast("فشل إعادة الضبط", "error");
                setIsLoading(false);
            }
        }
    };

    const handleBroadcast = () => {
        if (!broadcastMessage.trim()) return;
        realtime.broadcast('admin_broadcast', { message: broadcastMessage });
        showToast("تم إرسال التنبيه للجميع 📨", "success");
        setBroadcastMessage('');
    };

    const handleForceRefresh = () => {
        if (window.confirm("⚠️ هل أنت متأكد؟ سيتم إعادة تحميل الصفحة للجميع!")) {
            realtime.broadcast('admin_force_refresh', {});
            showToast("تم إرسال أمر التحديث 🔄", "success");
        }
    };

    const handleDeleteRoom = async (roomCode) => {
        if (window.confirm(`⚠️ حذف الغرفة #${roomCode}؟`)) {
            await supabase.from('room_players').delete().eq('room_code', roomCode);
            await supabase.from('rooms').delete().eq('room_code', roomCode);
            showToast(`تم حذف الغرفة ${roomCode}`, "info");
        }
    };

    const handleKickPlayer = async (playerId, roomCode) => {
        if (window.confirm("⚠️ طرد هذا اللاعب؟")) {
            await supabase.from('room_players').delete().eq('player_id', playerId).eq('room_code', roomCode);
            realtime.broadcast('player_kicked', { kickedDeviceId: playerId });
            showToast("تم طرد اللاعب", "info");
        }
    };

    if (!isAuthorized) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] text-white flex items-center justify-center p-6 font-sans">
                <div className="w-full max-w-md bg-gray-800/50 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 border border-blue-500/30">
                            🔐
                        </div>
                        <h1 className="text-2xl font-black mb-2">لوحة تحكم المسؤول</h1>
                        <p className="text-gray-500 text-sm">يرجى إدخال كلمة المرور للوصول للصلاحيات</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="كلمة المرور..."
                            className="w-full bg-black/40 border border-gray-700 rounded-2xl px-6 py-4 text-center text-xl focus:border-blue-500 outline-none transition-all"
                            autoFocus
                        />
                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                        >
                            دخول
                        </button>
                    </form>

                    <button
                        onClick={() => navigate('/')}
                        className="w-full mt-4 text-gray-500 text-sm hover:text-gray-400 font-bold"
                    >
                        🏠 العودة للرئيسية
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white p-6 font-sans">
            <div className="max-w-6xl mx-auto pt-20">
                <div className="flex justify-between items-center mb-12">
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-3 bg-gray-800 rounded-xl font-bold border border-white/5 hover:bg-gray-700 transition-all"
                    >
                        🏠 خروج
                    </button>
                    <div className="flex gap-2 bg-gray-900/50 p-1 rounded-2xl border border-white/5 shadow-inner">
                        <button
                            onClick={() => setActiveTab('stats')}
                            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'stats' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >📊 الإحصائيات</button>
                        <button
                            onClick={() => setActiveTab('rooms')}
                            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'rooms' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >🎮 الغرف</button>
                        <button
                            onClick={() => setActiveTab('chat')}
                            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'chat' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >💬 الدردشة</button>
                    </div>
                </div>

                {activeTab === 'stats' && (
                    <>
                        {stats && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                <div className="bg-blue-500/10 rounded-2xl p-6 border border-blue-500/20">
                                    <div className="text-blue-400 text-sm font-bold mb-2">👥 إجمالي اللاعبين</div>
                                    <div className="text-4xl font-black">{stats.totalPlayers}</div>
                                </div>
                                <div className="bg-green-500/10 rounded-2xl p-6 border border-green-500/20">
                                    <div className="text-green-400 text-sm font-bold mb-2">🟢 متصلين الآن</div>
                                    <div className="text-4xl font-black">{stats.onlinePlayers}</div>
                                </div>
                                <div className="bg-purple-500/10 rounded-2xl p-6 border border-purple-500/20">
                                    <div className="text-purple-400 text-sm font-bold mb-2">🎮 غرف نشطة</div>
                                    <div className="text-4xl font-black">{stats.activeRooms}</div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="bg-red-500/5 rounded-3xl p-8 border border-red-500/20 shadow-2xl">
                                <div className="w-16 h-16 bg-red-600/10 rounded-2xl flex items-center justify-center text-3xl mb-6 border border-red-500/20">
                                    🧨
                                </div>
                                <h3 className="text-2xl font-black text-red-500 mb-4">تصفير النظام بالكامل</h3>
                                <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                                    هذا الإجراء سيقوم بحذف جميع الغرف النشطة فوراً، وفصل جميع اللاعبين، ومسح هوياتهم الدائمة. استخدم هذا فقط عند الحاجة لتنظيف النظام بالكامل.
                                </p>
                                <button
                                    onClick={handleFullReset}
                                    disabled={isLoading}
                                    className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black shadow-xl shadow-red-900/20 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isLoading ? 'جاري التنفيذ...' : 'تنفيذ التصفير الشامل 🚀'}
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-gray-800/50 rounded-3xl p-6 border border-blue-500/20 shadow-xl">
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <span>📢</span> إرسال تنبيه للجميع
                                    </h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={broadcastMessage}
                                            onChange={(e) => setBroadcastMessage(e.target.value)}
                                            placeholder="اكتب التنبيه هنا..."
                                            className="flex-1 bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-right focus:border-blue-500 outline-none"
                                        />
                                        <button
                                            onClick={handleBroadcast}
                                            disabled={!broadcastMessage.trim()}
                                            className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50"
                                        >
                                            إرسال
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-gray-800/50 rounded-3xl p-6 border border-green-500/20 shadow-xl flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <span>🔄</span> تحديث إجباري
                                        </h3>
                                        <p className="text-gray-400 text-xs mt-1">إعادة تحميل الصفحة لجميع اللاعبين (لتنزيل التحديثات)</p>
                                    </div>
                                    <button
                                        onClick={handleForceRefresh}
                                        className="bg-green-600 hover:bg-green-500 px-6 py-3 rounded-xl font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95"
                                    >
                                        تحديث الكل
                                    </button>
                                </div>
                            </div>
                        </div>

                        {stats && (
                            <div className="bg-gray-800/30 rounded-3xl p-6 border border-white/5">
                                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <span>👥</span> آخر اللاعبين النشطين ({stats.players.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto pr-2">
                                    {stats.players.map((player, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 hover:border-blue-500/20 transition-all group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl group-hover:scale-110 transition-transform">{player.avatar}</span>
                                                <div className="overflow-hidden">
                                                    <div className="font-bold truncate text-sm">{player.nickname}</div>
                                                    <div className="text-[10px] text-gray-500">
                                                        {new Date(player.last_seen).toLocaleTimeString('ar-EG')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`w-2 h-2 rounded-full ${(() => {
                                                const isOnline = player.last_seen && (new Date() - new Date(player.last_seen)) < 30000;
                                                return isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-700';
                                            })()}`} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'rooms' && stats && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {stats.rooms.length === 0 ? (
                            <div className="col-span-full py-20 text-center text-gray-500 bg-gray-900/20 rounded-3xl border border-dashed border-white/10">
                                لا توجد غرف نشطة حالياً
                            </div>
                        ) : (
                            stats.rooms.map((room, idx) => (
                                <div key={idx} className="bg-gray-800/40 rounded-3xl p-6 border border-white/10 shadow-xl flex flex-col group hover:border-blue-500/30 transition-all">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">كود الغرفة</div>
                                            <div className="text-2xl font-black text-blue-400 font-mono group-hover:text-blue-300 transition-colors">#{room.roomCode}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <div className={`text-[10px] px-2 py-1 rounded-full font-bold shadow-lg ${room.state === 'playing' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                    room.state === 'waiting' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                        'bg-gray-600/20 text-gray-400 border border-gray-600/30'
                                                }`}>
                                                {room.state === 'playing' ? '🎮 يلعب' : room.state === 'waiting' ? '⏳ انتظار' : '✅ انتهى'}
                                            </div>
                                            <button
                                                onClick={() => handleDeleteRoom(room.roomCode)}
                                                className="w-8 h-8 rounded-xl bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white flex items-center justify-center transition-all shadow-lg"
                                                title="حذف الغرفة"
                                            >🗑️</button>
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-6 bg-black/30 p-4 rounded-2xl border border-white/5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">المضيف (Host)</span>
                                            <span className="font-bold text-white">👑 {room.hostName}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">حزمة الأسئلة</span>
                                            <span className="font-bold text-blue-300">{room.packName}</span>
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-2">
                                        <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2 flex items-center justify-between">
                                            <span>👤 اللاعبين ({room.playerCount})</span>
                                        </div>
                                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                            {room.playerDetails.map((p, pIdx) => (
                                                <div key={pIdx} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5 hover:bg-white/10 transition-all">
                                                    <span className="text-[11px] font-bold">{p.is_host && '👑 '}{p.nickname}</span>
                                                    <button
                                                        onClick={() => handleKickPlayer(p.player_id, room.roomCode)}
                                                        className="text-[9px] bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-2 py-1 rounded-lg transition-all font-black uppercase"
                                                    >طرد</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'chat' && (
                    <div className="bg-gray-800/30 rounded-3xl p-8 border border-white/5 shadow-2xl">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="text-2xl font-black flex items-center gap-3">
                                    <span className="p-3 bg-blue-600/20 rounded-2xl border border-blue-500/20 shadow-lg">💬</span>
                                    مراقب الدردشة العام
                                </h3>
                                <p className="text-gray-500 text-sm mt-2">بث حي ومباشر لجميع المحادثات داخل جميع الغرف</p>
                            </div>
                            <div className="text-xs text-blue-400 font-black px-5 py-2.5 bg-blue-400/10 rounded-full border border-blue-400/20 animate-pulse shadow-lg flex items-center gap-2">
                                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                LIVE STREAMING
                            </div>
                        </div>

                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-3 custom-scrollbar">
                            {globalMessages.length === 0 ? (
                                <div className="py-20 text-center text-gray-500 italic bg-black/20 rounded-3xl border border-dashed border-white/5">لا توجد رسائل حالياً في النظام</div>
                            ) : (
                                globalMessages.map((msg, idx) => (
                                    <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/5 hover:bg-white/10 transition-all group animate-fade-in-up">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-lg font-black shadow-lg">#{msg.room_code}</div>
                                                <span className="font-black text-sm text-gray-100">{msg.sender_nickname}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-600 group-hover:text-gray-400 transition-colors">
                                                {new Date(msg.created_at).toLocaleTimeString('ar-EG')}
                                            </span>
                                        </div>
                                        <p className={`text-sm leading-relaxed ${msg.message_type === 'system' ? 'italic text-gray-500' : 'text-gray-300'}`}>
                                            {msg.message_text}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;

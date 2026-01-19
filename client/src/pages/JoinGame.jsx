import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import realtime from '../realtime';
import { getPersistentUserId, getPersistentDeviceId } from '../utils/userAuth';
import Navbar from '../components/Navbar';

const JoinGame = () => {
    const navigate = useNavigate();
    const { roomCode: paramRoomCode } = useParams();
    const [roomCode, setRoomCode] = React.useState(paramRoomCode || '');
    const [nickname, setNickname] = React.useState(localStorage.getItem('quiz_nickname') || '');
    const [avatar, setAvatar] = React.useState('🦊'); // Default avatar
    const [error, setError] = React.useState('');
    const [activeRooms, setActiveRooms] = React.useState([]);
    const [isLoadingRooms, setIsLoadingRooms] = React.useState(true);
    const [isConnected, setIsConnected] = React.useState(true); // Default true for serverless

    React.useEffect(() => {
        const fetchRooms = async () => {
            const { data, error } = await supabase
                .from('rooms')
                .select('*, room_players(count)')
                .neq('state', 'finished')
                .order('created_at', { ascending: false });

            if (data) {
                const formattedRooms = data.map(r => ({
                    roomCode: r.room_code,
                    state: r.state,
                    packName: r.pack_data?.title || r.pack_data?.name || 'Unknown Pack',
                    hostName: r.settings?.nickname || 'Host',
                    playerCount: r.room_players?.[0]?.count || 0
                }));
                setActiveRooms(formattedRooms);
            }
            setIsLoadingRooms(false);
            setIsConnected(true);
        };

        fetchRooms();

        // Realtime Subscription
        const channel = supabase
            .channel('room_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchRooms)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const refreshRooms = () => {
        setIsLoadingRooms(true);
        // fetchRooms is already defined inside useEffect, so I'll replicate or move it
    };

    const handleRoomSelect = (code) => {
        setRoomCode(code);
        // Scroll to the join button or manual input if on mobile
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleJoin = async () => {
        if (!roomCode || !nickname) {
            setError('يرجى إدخال رمز الغرفة والاسم');
            return;
        }

        const deviceId = getPersistentDeviceId();
        const userId = getPersistentUserId();

        try {
            // 1. Check if room exists
            const { data: room, error: roomError } = await supabase
                .from('rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (roomError || !room) {
                setError('❌ الغرفة غير موجودة');
                return;
            }

            // 1.5 Ensure Player exists in 'players' table (Safeguard for FK)
            const { data: playerData, error: regError } = await supabase
                .from('players')
                .upsert({
                    device_id: deviceId,
                    nickname: nickname,
                    avatar: avatar,
                    last_seen: new Date().toISOString()
                }, { onConflict: 'device_id' })
                .select()
                .maybeSingle();

            if (regError) {
                console.error("Join: Player registration failed:", regError);
                throw regError;
            }

            // 2. Add to room_players
            const { error: playerError } = await supabase
                .from('room_players')
                .upsert({
                    room_code: roomCode,
                    player_id: deviceId,
                    status: 'active'
                });

            if (playerError) throw playerError;

            // 3. Join Realtime
            await realtime.joinRoom(roomCode, { deviceId, nickname, avatar, userId });

            // 4. Navigate
            navigate(`/waiting/${roomCode}`, {
                state: {
                    roomCode,
                    nickname,
                    avatar,
                    deviceId,
                    userId,
                    isLateJoin: room.state !== 'waiting',
                    roomState: room.state,
                    pack: room.pack_data,
                    isTeamMode: room.pack_data?.name === 'Team Meat'
                }
            });
        } catch (err) {
            console.error("Join error:", err);
            setError("⚠️ فشل الانضمام. حاول مرة أخرى.");
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white font-sans relative overflow-hidden flex flex-col pt-20">
            <Navbar />

            {/* Background Blobs */}
            <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] -z-10 animate-pulse-slow"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px] -z-10 animate-pulse-slow delay-1000"></div>

            <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Left Panel: Join Form */}
                    <div className="bg-gray-800/40 backdrop-blur-xl rounded-3xl p-8 border border-gray-700 shadow-2xl flex flex-col justify-center animate-fade-in-up">
                        <div className="flex justify-between items-center mb-8">
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full animate-pulse ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isConnected ? 'text-green-500/70' : 'text-red-500/70'}`}>
                                    {isConnected ? 'متصل' : 'قيد الاتصال'}
                                </span>
                            </div>
                            <h1 className="text-4xl font-black text-right bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400 tracking-tight">
                                انضم للعبة 🎮
                            </h1>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 text-red-200 p-4 rounded-xl mb-6 text-center animate-pulse">
                                {error}
                            </div>
                        )}

                        <div className="space-y-6">
                            <div className="text-right">
                                <label className="block text-gray-400 mb-2 text-sm font-bold uppercase tracking-wider">رمز الغرفة</label>
                                <input
                                    type="text"
                                    value={roomCode}
                                    onChange={(e) => setRoomCode(e.target.value)}
                                    placeholder="123456"
                                    className="w-full p-4 rounded-2xl bg-black/40 border border-gray-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-center text-4xl tracking-widest font-black shadow-inner transition-all placeholder:text-gray-800"
                                    maxLength={6}
                                />
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center gap-4 animate-fade-in">
                                <span className="text-gray-500 text-xs font-black uppercase tracking-widest">هويتك الحالية</span>
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-4xl shadow-lg border border-blue-500/30">
                                        {avatar}
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-black text-white">{nickname}</div>
                                        <div className="text-[10px] text-yellow-500/70 font-bold">🔒 الاسم ثابت ومحفوظ</div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleJoin}
                                disabled={!roomCode || !nickname || !isConnected}
                                className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed rounded-2xl font-black text-2xl shadow-lg shadow-blue-900/20 transition-all transform hover:scale-[1.02] active:scale-95 mt-4"
                            >
                                دخول الغرفة 🚀
                            </button>

                            <button
                                onClick={() => navigate('/')}
                                className="w-full py-2 text-gray-500 hover:text-white text-sm transition-colors font-bold"
                            >
                                عودة للقائمة الرئيسية
                            </button>
                        </div>
                    </div>

                    {/* Right Panel: Active Rooms List */}
                    <div className="bg-gray-800/20 backdrop-blur-md rounded-3xl p-8 border border-white/5 shadow-2xl flex flex-col animate-fade-in-up delay-200">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                            <button
                                onClick={refreshRooms}
                                className="group flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-black px-3 py-1.5 rounded-full border border-blue-500/20 transition-all active:scale-90"
                            >
                                <span className={`w-3 h-3 flex items-center justify-center transition-transform group-hover:rotate-180 ${isLoadingRooms ? 'animate-spin' : ''}`}>🔄</span>
                                تحديث القائمة
                            </button>
                            <h2 className="text-2xl font-black">الغرف المتاحة</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 max-h-[500px] pr-2">
                            {isLoadingRooms ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <p className="font-bold">جاري البحث عن غرف...</p>
                                </div>
                            ) : activeRooms.length === 0 ? (
                                <div className="text-center py-20 px-8 bg-black/20 rounded-3xl border border-dashed border-gray-700">
                                    <div className="text-5xl mb-4 grayscale opacity-30">🏜️</div>
                                    <h3 className="text-xl font-bold text-gray-400 mb-2">لا يوجد غرف حالياً</h3>
                                    <p className="text-sm text-gray-500 leading-relaxed">كن أول من ينشئ غرفة ويدعو الآخرين للتنافس!</p>
                                    <button
                                        onClick={() => navigate('/host')}
                                        className="mt-6 text-blue-400 hover:text-blue-300 font-black underline underline-offset-4"
                                    >
                                        أنشئ غرفة الآن
                                    </button>
                                </div>
                            ) : (
                                activeRooms.map((room) => (
                                    <div
                                        key={room.roomCode}
                                        onClick={() => handleRoomSelect(room.roomCode)}
                                        className={`
                                            group relative p-5 rounded-2xl border transition-all cursor-pointer overflow-hidden
                                            ${roomCode === room.roomCode
                                                ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                                                : 'bg-black/40 border-gray-700 hover:border-gray-500 hover:bg-black/60'}
                                        `}
                                    >
                                        <div className="flex justify-between items-center relative z-10">
                                            <div className="text-left flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
                                                    🎮
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`text-lg font-black tracking-widest transition-colors ${roomCode === room.roomCode ? 'text-blue-400' : 'text-white group-hover:text-blue-400'}`}>
                                                            {room.roomCode}
                                                        </div>
                                                        {room.state !== 'waiting' && (
                                                            <span className="text-[8px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded uppercase font-black">جاري اللعب</span>
                                                        )}
                                                        {room.state === 'waiting' && (
                                                            <span className="text-[8px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded uppercase font-black">انتظار</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">{room.packName}</div>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="text-sm font-bold text-gray-300">مضيف: {room.hostName}</div>
                                                <div className="flex items-center justify-end gap-1 mt-1">
                                                    <div className="flex -space-x-2">
                                                        {[...Array(Math.min(3, room.playerCount))].map((_, i) => (
                                                            <div key={i} className="w-6 h-6 rounded-full border-2 border-black bg-gray-700 flex items-center justify-center text-[10px]">👤</div>
                                                        ))}
                                                    </div>
                                                    <span className="text-xs font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md ml-1">
                                                        {room.playerCount}/10
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-gray-500 text-xs text-right">
                            <p>تتم مزامنة حالة الغرف تلقائياً عبر Supabase</p>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                متصل بالنظام السحابي
                            </span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default JoinGame;

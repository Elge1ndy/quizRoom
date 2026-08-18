import React from 'react';
import { supabase } from '../supabaseClient';
import { getPersistentDeviceId, registerOrUpdatePlayer } from '../utils/userAuth';

const OnboardingModal = ({ onComplete }) => {
    const [nickname, setNickname] = React.useState('');
    const [avatar, setAvatar] = React.useState('🦊');
    const [error, setError] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [isConnected, setIsConnected] = React.useState(true);

    const avatars = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '👽', '🤖', '👻', '🧙', '🥷', '🧑‍🚀', '🧛'];

    // Track connection status
    React.useEffect(() => {
        setIsConnected(true); // Always "connected" in serverless sense if we have internet
    }, []);

    // Use a safer UUID generator
    const getDeviceId = () => {
        let id = localStorage.getItem('quiz_device_id');
        if (!id) {
            try {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                    id = crypto.randomUUID();
                } else {
                    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
                }
            } catch (e) {
                id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
            }
            localStorage.setItem('quiz_device_id', id);
        }
        return id;
    };

    const handleSubmit = () => {
        if (!nickname.trim()) {
            setError('يرجى إدخال اسم');
            return;
        }

        if (nickname.length < 2) {
            setError('الاسم قصير جداً');
            return;
        }

        setIsLoading(true);
        setError('');

        const deviceId = getPersistentDeviceId();

        const saveToSupabase = async () => {
            try {
                const regResult = await registerOrUpdatePlayer(supabase, {
                    device_id: deviceId,
                    nickname: nickname.trim(),
                    avatar: avatar,
                    last_seen: new Date().toISOString()
                }, { autoHandleConflict: false }); // User must choose a unique name manually here

                if (regResult.error) {
                    throw regResult.error;
                }

                localStorage.setItem('quiz_nickname', nickname.trim());
                localStorage.setItem('quiz_avatar', avatar);

                setIsLoading(false);
                onComplete({ nickname: nickname.trim(), avatar, deviceId });
            } catch (err) {
                console.error("Registration error:", err);
                if (err.code === '23505' || err.status === 409 || err.customMsg?.includes('taken')) {
                    setError('هذا الاسم مستخدم بالفعل، يرجى اختيار اسم آخر.');
                } else {
                    setError('فشل التسجيل. حاول مرة أخرى.');
                }
                setIsLoading(false);
            }
        };

        saveToSupabase();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="w-full max-w-lg bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden animate-zoom-in">
                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px] -z-10 translate-x-1/2 -translate-y-1/2"></div>

                {error && (
                    <div className="w-full bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl text-sm font-bold animate-shake">
                        {error}
                    </div>
                )}

                <div className="w-full space-y-6">
                    <div className="space-y-2">
                        <label className="block text-gray-500 text-xs font-black uppercase tracking-widest text-right px-4">الاسم المستعار</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value.slice(0, 15))}
                            placeholder="اكتب اسمك هنا..."
                            className="w-full p-6 bg-white/5 border border-white/10 rounded-3xl text-center text-2xl font-black focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>

                    <div className="space-y-4">
                        <label className="block text-gray-500 text-xs font-black uppercase tracking-widest text-right px-4">اختر صورتك الرمزية</label>
                        <div className="flex flex-wrap justify-center gap-3 p-4 bg-white/5 rounded-3xl border border-white/5">
                            {avatars.map(av => (
                                <button
                                    key={av}
                                    onClick={() => setAvatar(av)}
                                    className={`w-12 h-12 text-2xl flex items-center justify-center rounded-2xl transition-all hover:scale-110 ${avatar === av ? 'bg-blue-600 shadow-lg shadow-blue-600/40 scale-110' : 'bg-gray-800 hover:bg-gray-700'}`}
                                >
                                    {av}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={isLoading || !nickname.trim()}
                    className={`w-full py-5 bg-gradient-to-r from-blue-600 to-blue-500 rounded-3xl font-black text-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${isLoading || !nickname.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-blue-500/20 active:from-blue-700'}`}
                >
                    {isLoading ? (
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <span>ابدأ اللعب</span>
                            <span>🚀</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default OnboardingModal;

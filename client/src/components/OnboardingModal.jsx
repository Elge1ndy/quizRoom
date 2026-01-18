import React from 'react';
import socket from '../socket';

const OnboardingModal = ({ onComplete }) => {
    const [nickname, setNickname] = React.useState('');
    const [avatar, setAvatar] = React.useState('🦊');
    const [error, setError] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [step, setStep] = React.useState(1); // 1: Input, 2: Success Message
    const [isConnected, setIsConnected] = React.useState(socket.connected);

    const avatars = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '👽', '🤖', '👻', '🧙', '🥷', '🧑‍🚀', '🧛'];

    // Track connection status
    React.useEffect(() => {
        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []);

    // Simplified Onboarding - logic moved to App.jsx common flow
    React.useEffect(() => {
        // Just focus on clean slate for new users
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

        const deviceId = getDeviceId();

        // 10 Second Timeout
        const timeout = setTimeout(() => {
            if (isLoading) {
                setIsLoading(false);
                setError('السيرفر لا يستجيب حالياً. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.');
            }
        }, 10000);

        socket.emit('register_device', { deviceId, nickname: nickname.trim(), avatar }, (response) => {
            clearTimeout(timeout);
            setIsLoading(false);
            if (response && response.success) {
                // Save to localStorage
                localStorage.setItem('quiz_nickname', nickname.trim());
                localStorage.setItem('quiz_avatar', avatar);

                setStep(2);

                // Wait a bit before completing to show success (reduced to 800ms)
                setTimeout(() => {
                    onComplete({ nickname: nickname.trim(), avatar, deviceId });
                }, 800);
            } else {
                setError((response && response.error) || 'فشل التسجيل. ربما الاسم مستخدم؟');
            }
        });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="w-full max-w-lg bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden animate-zoom-in">
                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-[80px] -z-10 translate-x-1/2 -translate-y-1/2"></div>

                {step === 1 ? (
                    <div className="flex flex-col items-center text-center space-y-8">
                        <div className="w-24 h-24 flex items-center justify-center animate-bounce-slow">
                            <img src="/logo.png" alt="Welcome" className="w-full h-full object-contain drop-shadow-[0_10px_20px_rgba(59,130,246,0.3)]" />
                        </div>

                        <div>
                            <h2 className="text-3xl md:text-4xl font-black mb-4 text-white tracking-tight">مرحباً بك في QuizRoom!</h2>
                            <p className="text-gray-400 leading-relaxed">
                                لتبدأ اللعب، من فضلك اختر اسماً مستعاراً.
                                <br />
                                <span className="text-yellow-500/80 font-bold text-sm">🔒 هذا الاسم سيكون دائمًا ولا يمكن تغييره لاحقاً.</span>
                            </p>
                        </div>

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
                            disabled={isLoading}
                            className={`w-full py-6 bg-gradient-to-r from-blue-600 to-blue-500 rounded-3xl font-black text-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-blue-500/20 active:from-blue-700'}`}
                        >
                            {isLoading ? (
                                <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>حفظ وتأكيد</span>
                                    <span>✨</span>
                                </>
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-center space-y-8 animate-fade-in">
                        <div className="w-32 h-32 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center text-6xl shadow-[0_0_30px_rgba(34,197,94,0.2)] animate-success-ping">
                            ✅
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-4xl font-black text-green-400">تم الحفظ بنجاح!</h2>
                            <p className="text-gray-300 text-xl font-bold">أهلاً بك، <span className="text-blue-400">{nickname}</span> {avatar}</p>
                            <p className="text-gray-500 bg-white/5 p-4 rounded-2xl border border-white/5 italic">
                                🔒 تم قفل الاسم على هذا الجهاز. نتمنى لك وقتاً ممتعاً!
                            </p>
                        </div>

                        <div className="w-12 h-1 border-t-4 border-green-500/50 rounded-full animate-pulse"></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OnboardingModal;

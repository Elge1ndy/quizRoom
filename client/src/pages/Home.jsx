import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

const Home = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden relative">
            <Navbar />

            {/* Hero Section */}
            <div className="relative pt-32 pb-20 px-4 flex flex-col items-center justify-center text-center z-10">
                {/* Background Blobs */}
                <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] -z-10 animate-pulse-slow"></div>
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] -z-10 animate-pulse-slow delay-1000"></div>

                <div className="relative mb-8 animate-fade-in-up">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-3xl -z-10 scale-150"></div>
                    <img
                        src="/logo.png"
                        alt="QuizRoom Logo"
                        className="w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-[0_0_30px_rgba(59,130,246,0.5)] hover:scale-105 transition-transform duration-500"
                    />
                </div>

                <h1 className="text-5xl md:text-7xl font-black mb-2 tracking-tight animate-fade-in-up delay-100">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                        QUIZ
                    </span>
                    <span className="text-white block mt-2">ROOM</span>
                </h1>
                <p className="text-blue-400/60 text-xs font-black uppercase tracking-[0.4em] mb-8 animate-fade-in-up delay-150">
                    by Said Elgendy
                </p>

                <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed animate-fade-in-up delay-200">
                    العب مع أصدقائك في الوقت الفعلي. المئات من الأسئلة في انتظارك.
                    <br />
                    اجمع النقاط، وتصدر قائمة المتصدرين! 🏆
                </p>

                {/* Action Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl px-4 animate-fade-in-up delay-300">

                    {/* Host Card */}
                    <div
                        onClick={() => navigate('/host')}
                        className="group relative bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 hover:border-blue-500 rounded-3xl p-8 cursor-pointer transition-all duration-300 hover:transform hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(59,130,246,0.5)] overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>

                        <div className="relative z-10 flex flex-col items-start h-full">
                            <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-4xl mb-6 group-hover:scale-110 transition-transform">
                                👑
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">استضافة لعبة</h2>
                            <p className="text-gray-400 mb-8 text-right">أنشئ غرفة، اختر حزمة الأسئلة، وادعُ أصدقاءك للتحدي.</p>

                            <div className="mt-auto flex items-center text-blue-400 font-bold group-hover:translate-x-[-5px] transition-transform">
                                <span>البدء الآن</span>
                                <span className="mr-2 text-xl">←</span>
                            </div>
                        </div>
                    </div>

                    {/* Join Card */}
                    <div
                        onClick={() => navigate('/join')}
                        className="group relative bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 hover:border-purple-500 rounded-3xl p-8 cursor-pointer transition-all duration-300 hover:transform hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(168,85,247,0.5)] overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>

                        <div className="relative z-10 flex flex-col items-start h-full">
                            <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center text-4xl mb-6 group-hover:scale-110 transition-transform">
                                🎮
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">انضمام للعبة</h2>
                            <p className="text-gray-400 mb-8 text-right">لديك رمز الغرفة؟ ادخله هنا وانضم للمنافسة فوراً.</p>

                            <div className="mt-auto flex items-center text-purple-400 font-bold group-hover:translate-x-[-5px] transition-transform">
                                <span>دخول الغرفة</span>
                                <span className="mr-2 text-xl">←</span>
                            </div>
                        </div>
                    </div>

                </div>

                <div
                    onClick={() => navigate('/create')}
                    className="mt-8 text-gray-400 hover:text-white cursor-pointer transition-colors flex items-center gap-2 group animate-fade-in-up delay-500"
                >
                    <span className="group-hover:rotate-90 transition-transform">🛠️</span>
                    <span className="underline underline-offset-4">تريد إضافة أسئلة؟ أنشئ حزمة خاصة بك</span>
                </div>
            </div>

            {/* Footer / Stats Teaser */}
            <div className="bg-black/20 border-t border-white/5 py-12">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                    <div>
                        <div className="text-3xl font-black text-white mb-1">100+</div>
                        <div className="text-gray-500 text-sm uppercase tracking-wider">سؤال</div>
                    </div>
                    <div>
                        <div className="text-3xl font-black text-white mb-1">50+</div>
                        <div className="text-gray-500 text-sm uppercase tracking-wider">لاعب نشط</div>
                    </div>
                    <div>
                        <div className="text-3xl font-black text-white mb-1">12</div>
                        <div className="text-gray-500 text-sm uppercase tracking-wider">تصنيف</div>
                    </div>
                    <div>
                        <div className="text-3xl font-black text-white mb-1">∞</div>
                        <div className="text-gray-500 text-sm uppercase tracking-wider">متعة</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Home;

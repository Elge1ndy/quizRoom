import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { useFriendSystem } from '../hooks/useFriendSystem';
import { getPersistentUserId } from '../utils/userAuth';

const Profile = () => {
    const { friends, pendingRequests, acceptFriendRequest, rejectFriendRequest, refreshFriends } = useFriendSystem();

    // Persistent User State from LocalStorage
    const [user, setUser] = useState({
        nickname: localStorage.getItem('quiz_nickname') || "لاعب جديد",
        avatar: localStorage.getItem('quiz_avatar') || "👤",
        level: 5,
        xp: 2450,
        nextLevelXp: 3000
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState(user);

    useEffect(() => {
        // Sync with localStorage
        localStorage.setItem('quiz_nickname', user.nickname);
        localStorage.setItem('quiz_avatar', user.avatar);
    }, [user]);

    const stats = [
        { label: "ألعاب", value: "24", icon: "🕹️", color: "from-blue-500 to-cyan-500" },
        { label: "انتصارات", value: "8", icon: "🏆", color: "from-yellow-400 to-amber-600" },
        { label: "مجموع النقاط", value: "14.5k", icon: "✨", color: "from-purple-500 to-pink-500" },
        { label: "دقة الإجابات", value: "72%", icon: "🎯", color: "from-green-500 to-emerald-600" }
    ];

    const badges = [
        { id: 1, name: "بداية موفقة", form: "🚀", unlocked: true, desc: "لعبت أول لعبة لك" },
        { id: 2, name: "ذكي جداً", form: "🧠", unlocked: true, desc: "فزت بالمركز الأول" },
        { id: 3, name: "سريع البديهة", form: "⚡", unlocked: false, desc: "أجبت في أقل من 3 ثواني" },
        { id: 4, name: "موسوعة", form: "📚", unlocked: false, desc: "أجبت 10 أسئلة متتالية صحيحة" },
    ];

    const history = [
        { id: 1, date: "اليوم", pack: "معلومات عامة", rank: 3, score: 1200 },
        { id: 2, date: "أمس", pack: "تاريخ", rank: 1, score: 2500 },
        { id: 3, date: "20 يناير", pack: "علوم", rank: 5, score: 800 },
    ];

    const xpPercentage = (user.xp / user.nextLevelXp) * 100;
    const avatars = ["👤", "🦊", "🐼", "🐯", "🦁", "🐸", "👻", "🤖", "👽", "🦄"];

    const handleEditClick = () => {
        setEditForm(user);
        setIsEditing(true);
    };

    const handleSave = () => {
        if (!editForm.nickname.trim()) return;
        setUser(editForm);
        setIsEditing(false);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white font-sans relative">
            <Navbar />

            {/* Edit Modal Overlay */}
            {isEditing && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-gray-800 rounded-3xl p-8 w-full max-w-md border border-gray-700 shadow-2xl relative">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
                        >
                            ✕
                        </button>
                        <h2 className="text-2xl font-bold mb-6 text-center">تعديل الملف الشخصي</h2>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-gray-400 text-sm font-bold mb-2">اسم اللاعب</label>
                                <input
                                    type="text"
                                    value={editForm.nickname}
                                    onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm font-bold mb-2">الصورة الرمزية</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {avatars.map((av, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setEditForm({ ...editForm, avatar: av })}
                                            className={`
                                                aspect-square rounded-full flex items-center justify-center text-2xl border-2 transition-all
                                                ${editForm.avatar === av
                                                    ? 'bg-blue-600 border-blue-400 scale-110'
                                                    : 'bg-gray-700 border-transparent hover:bg-gray-600'}
                                            `}
                                        >
                                            {av}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transition-transform hover:scale-[1.02]"
                            >
                                حفظ التغييرات
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto px-4 pt-32 pb-20">
                {/* Header Profile Card */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 mb-8 border border-gray-700 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                    <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                        <div className="w-32 h-32 bg-gray-700 rounded-full flex items-center justify-center text-6xl shadow-xl border-4 border-gray-600">
                            {user.avatar}
                        </div>

                        <div className="flex-1 text-center md:text-right">
                            <h1 className="text-3xl font-bold text-white mb-2">{user.nickname}</h1>
                            <div className="flex items-center justify-center md:justify-end gap-2 text-gray-400 mb-4">
                                <span>Level {user.level}</span>
                                <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                                <span>Next Level: {user.nextLevelXp - user.xp} XP</span>
                            </div>

                            {/* XP Bar */}
                            <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-out"
                                    style={{ width: `${xpPercentage}%` }}
                                ></div>
                            </div>
                        </div>

                        <button
                            onClick={handleEditClick}
                            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-full text-sm font-bold transition-colors border border-gray-600"
                        >
                            ✏️ تعديل
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {stats.map((stat, idx) => (
                        <div key={idx} className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700 hover:bg-gray-800 transition-colors">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-xl mb-3 shadow-lg`}>
                                {stat.icon}
                            </div>
                            <div className="text-2xl font-black text-white">{stat.value}</div>
                            <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">{stat.label}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                    {/* Friends Section - NEW */}
                    <div className="bg-gray-800/30 rounded-3xl p-6 border border-gray-700/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <span>👥</span> الأصدقاء
                            </h3>
                            <button onClick={refreshFriends} className="text-gray-400 hover:text-white transition-colors" title="تحديث">🔄</button>
                        </div>

                        <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                            {pendingRequests.length > 0 && (
                                <div className="mb-6">
                                    <p className="text-gray-500 text-xs font-bold uppercase mb-3">طلبات معلقة ({pendingRequests.length})</p>
                                    <div className="space-y-2">
                                        {pendingRequests.map(pid => (
                                            <div key={pid} className="flex items-center justify-between p-3 bg-blue-600/10 rounded-xl border border-blue-500/30">
                                                <span className="text-sm font-bold">لاعب #{pid.substring(0, 4)}</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => acceptFriendRequest(pid, "لاعب")} className="bg-green-600 hover:bg-green-500 p-1.5 rounded-lg">✅</button>
                                                    <button onClick={() => rejectFriendRequest(pid)} className="bg-red-600/50 hover:bg-red-500 p-1.5 rounded-lg">✕</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {friends.length === 0 ? (
                                <div className="text-center py-10 text-gray-600">
                                    لا يوجد أصدقاء بعد. أضف لاعبين من الغرفة!
                                </div>
                            ) : (
                                friends.map(friend => (
                                    <div key={friend.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-xl border border-gray-700 hover:bg-gray-700/50 transition-colors cursor-pointer">
                                        <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-xl shadow-inner">
                                            {friend.avatar || '👤'}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-bold text-sm">{friend.name || `لاعب #${friend.id.substring(0, 4)}`}</div>
                                            <div className="text-[10px] text-gray-500">تمت الإضافة</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Recent History */}
                    <div className="md:col-span-2 bg-gray-800/30 rounded-3xl p-6 border border-gray-700/50">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <span>📅</span> النشاط الأخير
                        </h3>
                        <div className="space-y-4">
                            {history.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl border border-gray-700">
                                    <div>
                                        <div className="font-bold text-sm">{item.pack}</div>
                                        <div className="text-xs text-gray-500">{item.date}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-sm font-bold ${item.rank === 1 ? 'text-yellow-400' : 'text-gray-300'}`}>
                                            {item.rank === 1 ? '🥇 1st' : `#${item.rank}`}
                                        </div>
                                        <div className="text-xs text-blue-400 font-mono">{item.score} pts</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Badges Section moved down or made smaller */}
                    <div className="bg-gray-800/30 rounded-3xl p-6 border border-gray-700/50">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <span>🎖️</span> الإنجازات
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {badges.map(badge => (
                                <div key={badge.id} className={`p-4 rounded-xl text-center border transition-all ${badge.unlocked ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-800/20 border-gray-800 opacity-50 grayscale'}`}>
                                    <div className="text-3xl mb-2">{badge.form}</div>
                                    <div className="font-bold text-sm mb-1">{badge.name}</div>
                                    <div className="text-[10px] text-gray-400 leading-tight">{badge.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Profile;

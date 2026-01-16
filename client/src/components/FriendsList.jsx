import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriendSystem } from '../hooks/useFriendSystem';

const FriendsList = () => {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();
    const { friends, pendingRequests, acceptFriendRequest, rejectFriendRequest, refreshFriends } = useFriendSystem();

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 border border-white/10 flex items-center justify-center transition-colors relative"
            >
                <span className="text-lg">👥</span>
                <span className="text-lg">👥</span>
                {(friends.length > 0 || pendingRequests.length > 0) && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center border-2 border-gray-900">
                        {friends.length + pendingRequests.length}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    ></div>
                    <div className="absolute right-0 mt-3 w-72 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 z-50 overflow-hidden animate-fade-in-up">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="font-bold text-white">الأصدقاء</h3>
                            <button className="text-xs text-blue-400 hover:text-blue-300 font-bold">+ إضافة</button>
                        </div>

                        <div className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {pendingRequests.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-gray-500 text-[10px] font-bold uppercase px-2 mb-2">طلبات معلقة</p>
                                    {pendingRequests.map(pid => (
                                        <div key={pid} className="flex items-center justify-between p-2 bg-blue-600/10 rounded-lg border border-blue-500/20 mb-1">
                                            <span className="text-xs font-bold">لاعب #{pid.substring(0, 4)}</span>
                                            <div className="flex gap-1">
                                                <button onClick={() => acceptFriendRequest(pid, "لاعب", "👤")} className="bg-green-600 hover:bg-green-500 p-1 rounded text-[10px]">✅</button>
                                                <button onClick={() => rejectFriendRequest(pid)} className="bg-red-600/50 hover:bg-red-500 p-1 rounded text-[10px]">✕</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {friends.length === 0 ? (
                                <div className="text-center py-6 text-gray-500 text-xs text-right px-2">
                                    لا يوجد أصدقاء بعد.
                                </div>
                            ) : (
                                friends.map(friend => (
                                    <div key={friend.id} className="flex items-center gap-3 p-2 hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors group">
                                        <div className="relative">
                                            <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm">
                                                {friend.avatar || '👤'}
                                            </div>
                                        </div>

                                        <div className="flex-1">
                                            <div className="font-bold text-xs text-gray-200">{friend.name || `لاعب #${friend.id.substring(0, 4)}`}</div>
                                            <div className="text-[10px] text-gray-500">متصل</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-3 bg-gray-900/50 text-center border-t border-gray-700">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    navigate('/profile');
                                }}
                                className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                            >
                                إدارة الأصدقاء
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FriendsList;

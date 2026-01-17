import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FriendsList from './FriendsList';

const Navbar = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path) => location.pathname === path;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-white/10 px-6 py-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                {/* Logo */}
                <div
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 cursor-pointer group"
                >
                    <img src="/logo.png" alt="QuizRoom Logo" className="w-10 h-10 object-contain group-hover:rotate-12 transition-transform" />
                    <div className="flex flex-col">
                        <span className="text-xl font-bold text-white tracking-tight leading-none">
                            QUIZ <span className="text-blue-400">ROOM</span>
                        </span>
                        <span className="text-[7px] text-blue-400/50 font-black uppercase tracking-widest mt-1">
                            by Said Elgendy
                        </span>
                    </div>
                </div>

                {/* Navigation Links */}
                <div className="flex bg-gray-800/50 rounded-full p-1 border border-white/5">
                    <button
                        onClick={() => navigate('/')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${isActive('/')
                            ? 'bg-gray-700 text-white shadow-lg'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        🏠 الرئيسية
                    </button>
                    <button
                        onClick={() => navigate('/profile')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${isActive('/profile')
                            ? 'bg-gray-700 text-white shadow-lg'
                            : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        👤 الملف الشخصي
                    </button>
                </div>

                {/* User/Friends Placeholder */}
                <div className="flex items-center gap-4">
                    <FriendsList />
                </div>
            </div>
        </nav>
    );
};

export default Navbar;

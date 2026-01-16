import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socket from '../socket';
import ChatBox from '../components/ChatBox';
import { useToast } from '../context/ToastContext';
import SoundManager from '../utils/SoundManager';

const PlayerLobby = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { roomCode, nickname, players: initialPlayers } = location.state || {};
    const [players, setPlayers] = useState(initialPlayers || []);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const { showToast } = useToast();

    useEffect(() => {
        if (!roomCode) {
            navigate('/join');
            return;
        }

        // Handle Late Join: Redir to WaitingRoom if game is in progress
        if (location.state?.isLateJoin || (location.state?.roomState && location.state.roomState !== 'waiting')) {
            console.log("Late Join Detected - Redirecting to Waiting Room");
            navigate('/waiting', {
                state: {
                    roomCode,
                    nickname,
                    avatar: location.state?.avatar,
                    userId: location.state?.userId,
                    players,
                    isHost: false,
                    isLateJoin: true
                }
            });
            return;
        }

        SoundManager.init();

        const handlePlayerJoined = (updatedPlayers) => {
            if (updatedPlayers.length > players.length) {
                const newPlayer = updatedPlayers[updatedPlayers.length - 1];
                if (newPlayer.nickname !== nickname) {
                    showToast(`${newPlayer.nickname} انضم للغرفة! 👋`, "success");
                    SoundManager.playJoin();
                }
            }
            setPlayers(updatedPlayers);
        };

        const handleGameStarted = (firstQuestion) => {
            navigate('/game', { state: { roomCode, nickname, role: 'player', initialQuestion: firstQuestion } });
        };

        const handleEnterWaiting = () => {
            navigate('/waiting', {
                state: {
                    roomCode,
                    nickname,
                    avatar: location.state?.avatar,
                    userId: location.state?.userId,
                    isHost: false,
                    players
                }
            });
        };

        const handleKicked = () => {
            alert("تم طردك من الغرفة من قبل المضيف.");
            navigate('/');
        };

        socket.on('player_joined', handlePlayerJoined);
        socket.on('game_started', handleGameStarted);
        socket.on('enter_waiting_room', handleEnterWaiting);
        socket.on('player_kicked', handleKicked);

        return () => {
            socket.off('player_joined', handlePlayerJoined);
            socket.off('game_started', handleGameStarted);
            socket.off('enter_waiting_room', handleEnterWaiting);
            socket.off('player_kicked', handleKicked);
        };
    }, [roomCode, navigate, players, nickname]);

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
            {/* Background FX */}
            <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>
            {/* Toast handled by global ToastProvider */}

            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">

                {/* Left Panel: Status */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-gray-800/60 backdrop-blur-xl p-8 rounded-3xl border border-gray-700 shadow-2xl text-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                        <div className="mb-2 text-gray-400 text-sm font-bold uppercase tracking-wider">Room Code</div>
                        <div className="text-5xl font-black text-white tracking-widest mb-6">{roomCode}</div>

                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <div className="w-4 h-4 bg-blue-500 rounded-full animate-ping absolute top-0 right-0"></div>
                                <div className="w-20 h-20 bg-gradient-to-br from-gray-700 to-gray-600 rounded-2xl flex items-center justify-center text-4xl shadow-inner border border-gray-500">
                                    👤
                                </div>
                            </div>
                        </div>

                        <div className="text-xl font-bold mb-1">{nickname}</div>
                        <div className="text-sm text-yellow-400 font-bold bg-yellow-400/10 inline-block px-3 py-1 rounded-full border border-yellow-400/20">Waiting for Host...</div>
                    </div>
                </div>

                {/* Right Panel: Players Grid */}
                <div className="md:col-span-2 bg-gray-800/40 backdrop-blur-md rounded-3xl border border-gray-700/50 p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
                        <h2 className="text-2xl font-bold">المتواجدون حالياً <span className="text-blue-500">({players.length})</span></h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                        {players.map((player, index) => (
                            <div key={index} className={`
                                group relative rounded-xl p-4 flex flex-col items-center gap-2 border transition-all
                                ${player.nickname === nickname
                                    ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                                    : 'bg-gray-700/50 border-white/5 hover:bg-gray-700'}
                            `}>
                                <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full flex items-center justify-center text-2xl shadow-inner relative">
                                    {player.avatar || ['👤', '🦊', '🐼', '🐯', '🦁', '🐸'][player.nickname.length % 6]}
                                </div>
                                <div className="font-bold text-center truncate w-full text-sm">{player.nickname}</div>
                                {player.nickname === nickname && <div className="text-[10px] uppercase font-bold text-blue-400">You</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Chat Toggle Button */}
            {!isChatOpen && (
                <button
                    onClick={() => setIsChatOpen(true)}
                    className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-110 z-50 flex items-center gap-2 group"
                >
                    <span className="text-xl">💬</span>
                </button>
            )}

            {/* Chat Component */}
            <ChatBox
                roomCode={roomCode}
                nickname={nickname}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
            />
        </div>
    );
};

export default PlayerLobby;

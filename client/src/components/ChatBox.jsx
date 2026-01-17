import React from 'react';
import socket from '../socket';

const ChatBox = ({ roomCode, nickname, isOpen, onClose }) => {
    const [messages, setMessages] = React.useState([]);
    const [newMessage, setNewMessage] = React.useState('');
    const [typingUsers, setTypingUsers] = React.useState(new Set());
    const messagesEndRef = React.useRef(null);
    const typingTimeoutRef = React.useRef(null);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages, typingUsers]);

    React.useEffect(() => {
        if (!roomCode) return;

        const handleReceiveMessage = (msg) => {
            setMessages((prev) => [...prev, msg]);
        };

        const handleUserTyping = ({ nickname: typerName, isTyping }) => {
            setTypingUsers((prev) => {
                const newSet = new Set(prev);
                if (isTyping) {
                    newSet.add(typerName);
                } else {
                    newSet.delete(typerName);
                }
                return newSet;
            });
        };

        socket.on('receive_message', handleReceiveMessage);
        socket.on('user_typing', handleUserTyping);

        return () => {
            socket.off('receive_message', handleReceiveMessage);
            socket.off('user_typing', handleUserTyping);
        };
    }, [roomCode]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        socket.emit('send_message', { roomCode, message: newMessage, nickname });
        setNewMessage('');

        // Stop typing immediately after send
        socket.emit('typing', { roomCode, nickname, isTyping: false });
    };

    const handleTyping = (e) => {
        setNewMessage(e.target.value);

        // Emit typing event
        socket.emit('typing', { roomCode, nickname, isTyping: true });

        // Clear previous timeout and set new one to stop typing
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('typing', { roomCode, nickname, isTyping: false });
        }, 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-4 right-4 w-80 md:w-96 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden font-sans animation-slide-up h-[500px]">
            {/* Chat Header */}
            <div className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <h3 className="font-bold text-white">المحادثة الجماعية</h3>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                    ✕
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900/95">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 text-sm mt-10">
                        لا توجد رسائل بعد... ابدأ المحادثة! 👋
                    </div>
                )}

                {messages.map((msg) => {
                    const isMe = msg.sender === nickname;
                    return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-baseline gap-2 mb-1">
                                <span className={`text-xs font-bold ${isMe ? 'text-blue-400' : 'text-purple-400'}`}>
                                    {isMe ? 'أنت' : msg.sender}
                                </span>
                                <span className="text-[10px] text-gray-600">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <div className={`
                                max-w-[85%] px-4 py-2 rounded-2xl text-sm break-words
                                ${isMe
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-gray-700 text-gray-200 rounded-tl-none'
                                }
                            `}>
                                {msg.text}
                            </div>
                        </div>
                    );
                })}

                {/* Typing Indicator */}
                {typingUsers.size > 0 && (
                    <div className="text-xs text-gray-500 italic animate-pulse">
                        {Array.from(typingUsers).join(', ')} يكتب الآن...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="bg-gray-800 p-3 border-t border-gray-700 flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder="اكتب رسالة..."
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    📩
                </button>
            </form>
        </div>
    );
};

export default ChatBox;

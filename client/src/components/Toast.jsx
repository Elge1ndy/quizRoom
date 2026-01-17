import React from 'react';

const Toast = ({ message, type = 'info', onClose }) => {
    React.useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    };

    return (
        <div className={`fixed top-24 right-4 z-[100] ${bgColors[type]} text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in-left border border-white/10`}>
            <span className="text-xl">
                {type === 'success' && '✅'}
                {type === 'error' && '❌'}
                {type === 'info' && 'ℹ️'}
                {type === 'warning' && '⚠️'}
            </span>
            <span className="font-bold">{message}</span>
            <button onClick={onClose} className="ml-4 hover:bg-white/20 rounded-full p-1">✕</button>
        </div>
    );
};

export default Toast;

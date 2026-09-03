import React from 'react';

const Toast = ({ message, type = 'info', onClose, actions }) => {
    React.useEffect(() => {
        if (actions && actions.length > 0) return;
        const timer = setTimeout(() => {
            onClose();
        }, 3000);
        return () => clearTimeout(timer);
    }, [onClose, actions]);

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
            {actions && actions.map((action, i) => (
                <button key={i} onClick={() => { action.onClick(); onClose(); }} className={`ml-2 px-3 py-1 rounded-lg text-sm font-bold ${action.className || 'bg-white/20 hover:bg-white/30'}`}>
                    {action.label}
                </button>
            ))}
            <button onClick={onClose} className="ml-4 hover:bg-white/20 rounded-full p-1">✕</button>
        </div>
    );
};

export default Toast;

import { io } from 'socket.io-client';

// Connect to backend URL (adjust port if needed)
// Connect to backend URL (dynamically based on current host)
const getSocketUrl = () => {
    if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
    // Fallback for local LAN dev: use same hostname but port 3005
    return `${window.location.protocol}//${window.location.hostname}:3005`;
};

const socket = io(getSocketUrl(), {
    transports: ['websocket'],
    withCredentials: true
});

export default socket;

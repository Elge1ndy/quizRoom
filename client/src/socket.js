import { io } from 'socket.io-client';

// Connect to backend URL (adjust port if needed)
// Connect to backend URL (dynamically based on current host)
const socketUrl = import.meta.env.VITE_BACKEND_URL || `${window.location.protocol}//${window.location.hostname}:3005`;

const socket = io(socketUrl, {
    transports: ['websocket'],
    withCredentials: true
});

export default socket;

const io = require('socket.io-client');

const SERVER_URL = 'http://127.0.0.1:3005';
const ADMIN_SECRET = 'admin123';

console.log(`🔌 Connecting to server at ${SERVER_URL}...`);

const socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false
});

socket.on('connect', () => {
    console.log('✅ Connected to server.');
    console.log('🧨 Attempting system reset...');

    socket.emit('system_reset_all', { adminSecret: ADMIN_SECRET }, (response) => {
        if (response && response.success) {
            console.log('🎉 System Reset SUCCESSFUL!');
            console.log('All rooms cleared and clients rebooted.');
        } else {
            console.error('❌ System Reset FAILED:', response ? response.error : 'Unknown error');
        }
        socket.close();
        process.exit(0);
    });
});

socket.on('connect_error', (err) => {
    console.error('❌ Connection Error:', err.message);
    process.exit(1);
});

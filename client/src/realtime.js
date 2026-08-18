import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_API_URL || 'https://concentration-monetary-answered-jet.trycloudflare.com';

class RealtimeService {
    constructor() {
        this.socket = null;
        this.eventHandlers = new Map();
        this.presenceState = {};
        this.roomCode = null;
        this.isJoining = false;
        this.joinPromise = null;
        this.systemJoinPromise = null;
        
        this.initSocket();
    }

    initSocket() {
        if (!this.socket) {
            this.socket = io(SERVER_URL, {
                extraHeaders: {
                    "Bypass-Tunnel-Reminder": "true"
                }
            });
            
            // Global socket listeners for this instance
            this.socket.on('presence_sync', (state) => {
                this.presenceState = state;
                this._triggerEvent('presence_sync', this.presenceState);
            });
            
            this.socket.on('presence_join', ({ key, newPresences }) => {
                this.presenceState[key] = newPresences;
                this._triggerEvent('player_joined_presence', { key, newPresences });
            });
            
            this.socket.on('presence_leave', ({ key, leftPresences }) => {
                delete this.presenceState[key];
                this._triggerEvent('player_left_presence', { key, leftPresences });
            });
            
            this.socket.on('broadcast', (payload) => {
                if (payload && payload.event) {
                    this._triggerEvent(payload.event, payload.payload);
                }
            });
        }
    }

    getPresenceState() {
        return this.presenceState;
    }

    async joinRoom(roomCode, userData) {
        if (this.isJoining && this.roomCode === roomCode && this.joinPromise) {
            return this.joinPromise;
        }

        this.joinPromise = (async () => {
            this.isJoining = true;

            if (this.roomCode && this.roomCode !== roomCode) {
                await this.leaveRoom();
            }

            this.roomCode = roomCode;
            this.initSocket();

            console.log(`📡 Joining channel for room: ${roomCode}`);
            this.socket.emit('join_channel', `room:${roomCode}`, userData);
            
            this.isJoining = false;
            return true;
        })();

        return this.joinPromise;
    }

    async joinSystemChannel(userData) {
        if (this.systemJoinPromise) return this.systemJoinPromise;

        this.systemJoinPromise = (async () => {
            this.initSocket();
            console.log("📡 Joining system-wide channel...");
            this.socket.emit('join_channel', 'system_global', userData);
            return true;
        })();

        return this.systemJoinPromise;
    }

    async leaveRoom() {
        if (this.socket && this.roomCode) {
            console.log(`🔌 Leaving channel room:${this.roomCode}`);
            this.socket.emit('leave_channel', `room:${this.roomCode}`);
            this.roomCode = null;
            this.presenceState = {};
        }
    }

    emit(event, payload) {
        if (!this.socket) {
            console.error(`❌ Cannot emit ${event}: Socket not connected`);
            return;
        }
        
        const channelName = this.roomCode ? `room:${this.roomCode}` : 'system_global';
        this.socket.emit('broadcast', channelName, { event, payload });
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (!this.eventHandlers.has(event)) return;
        if (!handler) {
            this.eventHandlers.delete(event);
            return;
        }
        const handlers = this.eventHandlers.get(event);
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }

    broadcast(event, payload) {
        this.emit(event, payload);
    }

    _triggerEvent(event, payload) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(payload);
                } catch (err) {
                    console.error(`Error in handler for ${event}:`, err);
                }
            });
        }
    }
}

const realtime = new RealtimeService();
export default realtime;

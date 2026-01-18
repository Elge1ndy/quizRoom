import { supabase } from './supabaseClient';

class RealtimeService {
    constructor() {
        this.channel = null;
        this.eventHandlers = new Map();
        this.presenceState = {};
        this.roomCode = null;
    }

    async joinRoom(roomCode, userData) {
        if (this.channel) {
            await this.leaveRoom();
        }

        this.roomCode = roomCode;
        if (!supabase) {
            console.error('Supabase client not initialized');
            return Promise.reject('Supabase client missing');
        }
        this.channel = supabase.channel(`room:${roomCode}`, {
            config: {
                presence: {
                    key: userData.deviceId,
                },
            },
        });

        // Handle Presence
        this.channel
            .on('presence', { event: 'sync' }, () => {
                this.presenceState = this.channel.presenceState();
                this._triggerEvent('presence_sync', this.presenceState);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                this._triggerEvent('player_joined_presence', { key, newPresences });
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                this._triggerEvent('player_left_presence', { key, leftPresences });
            });

        // Handle Broadcasts (Events)
        this.channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
            this._triggerEvent(event, payload);
        });

        // Subscribe
        return new Promise((resolve, reject) => {
            this.channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Track presence
                    await this.channel.track(userData);
                    resolve(true);
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    reject(status);
                }
            });
        });
    }

    async leaveRoom() {
        if (this.channel) {
            await this.channel.unsubscribe();
            this.channel = null;
            this.roomCode = null;
            this.presenceState = {};
        }
    }

    emit(event, payload) {
        if (!this.channel) {
            console.error('Cannot emit: Not joined to a room');
            return;
        }
        this.channel.send({
            type: 'broadcast',
            event,
            payload,
        });
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (!this.eventHandlers.has(event)) return;
        const handlers = this.eventHandlers.get(event);
        const index = handlers.indexOf(handler);
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }

    _triggerEvent(event, payload) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => handler(payload));
        }
    }
}

const realtime = new RealtimeService();
export default realtime;

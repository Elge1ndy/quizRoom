import { supabase } from './supabaseClient';

class RealtimeService {
    constructor() {
        this.channels = new Map();
        this.eventHandlers = new Map();
        this.presenceState = {};
        this.roomCode = null;
    }

    async joinRoom(roomCode, userData) {
        if (this.roomCode === roomCode) return true;

        if (this.roomCode) {
            await this.leaveRoom();
        }

        this.roomCode = roomCode;
        const channelName = `room:${roomCode}`;

        const channel = supabase.channel(channelName, {
            config: { presence: { key: userData?.deviceId || userData?.player_id } }
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                this.presenceState = state;
                this._triggerEvent('presence_sync', state);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                this._triggerEvent('player_joined_presence', { key, newPresences });
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                this._triggerEvent('player_left_presence', { key, leftPresences });
            })
            .on('broadcast', { event: '*' }, ({ event, payload }) => {
                this._triggerEvent(event, payload);
            });

        await channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track(userData || {});
            }
        });

        this.channels.set(channelName, channel);
        return true;
    }

    async joinSystemChannel(userData) {
        const channelName = 'system_global';

        const channel = supabase.channel(channelName, {
            config: { presence: { key: userData?.deviceId || 'system' } }
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                this.presenceState = state;
                this._triggerEvent('presence_sync', state);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                this._triggerEvent('player_joined_presence', { key, newPresences });
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                this._triggerEvent('player_left_presence', { key, leftPresences });
            })
            .on('broadcast', { event: '*' }, ({ event, payload }) => {
                this._triggerEvent(event, payload);
            });

        await channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track(userData || {});
            }
        });

        this.channels.set(channelName, channel);
        return true;
    }

    async leaveRoom() {
        if (this.roomCode) {
            const channelName = `room:${this.roomCode}`;
            const channel = this.channels.get(channelName);
            if (channel) {
                await supabase.removeChannel(channel);
                this.channels.delete(channelName);
            }
            this.roomCode = null;
            this.presenceState = {};
        }
    }

    getPresenceState() {
        return this.presenceState;
    }

    emit(event, payload) {
        const channelName = this.roomCode ? `room:${this.roomCode}` : 'system_global';
        const channel = this.channels.get(channelName);
        if (channel) {
            channel.send({ type: 'broadcast', event, payload });
        } else {
            console.warn(`Channel ${channelName} not joined, cannot emit ${event}`);
        }
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

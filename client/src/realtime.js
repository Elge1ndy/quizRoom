import { supabase } from './supabaseClient';

class RealtimeService {
    constructor() {
        this.channel = null;
        this.eventHandlers = new Map();
        this.presenceState = {};
        this.roomCode = null;
        this.isJoining = false;
        this.joinPromise = null;
    }

    getPresenceState() {
        return this.channel ? this.channel.presenceState() : {};
    }

    async joinRoom(roomCode, userData) {
        // If already joining this exact room, return the existing promise
        if (this.isJoining && this.roomCode === roomCode && this.joinPromise) {
            console.log(`⏳ Already joining room ${roomCode}, waiting for existing process...`);
            return this.joinPromise;
        }

        // If joining a new room or re-joining, start fresh
        this.joinPromise = (async () => {
            this.isJoining = true;

            // Only clean up if joining a different room or if channel exists
            if (this.channel && this.roomCode !== roomCode) {
                await this.leaveRoom();
            }

            // If already in this room and channel is active, don't rejoin
            if (this.channel && this.roomCode === roomCode) {
                console.log('✅ Already in room:', roomCode);
                this.isJoining = false;
                return true;
            }

            this.roomCode = roomCode;

            if (!supabase) {
                console.error(' Supabase client not initialized');
                this.isJoining = false;
                return false;
            }

            console.log(`📡 Creating channel for room: ${roomCode}`);
            this.channel = supabase.channel(`room:${roomCode}`, {
                config: {
                    presence: {
                        key: userData.deviceId,
                    },
                    broadcast: {
                        self: true,
                        ack: false
                    }
                },
            });

            // Handle Presence
            this.channel
                .on('presence', { event: 'sync' }, () => {
                    if (!this.channel) return;
                    try {
                        this.presenceState = this.channel.presenceState();
                        this._triggerEvent('presence_sync', this.presenceState);
                    } catch (err) {
                        console.error('Presence sync error:', err);
                    }
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

            // Subscribe logic
            const subscribe = () => new Promise((resolve) => {
                if (!this.channel) {
                    console.error('❌ Cannot subscribe: channel is null');
                    return resolve(false);
                }

                console.log(`⏳ Subscribing to channel: room:${roomCode}...`);
                this.channel.subscribe(async (status, err) => {
                    console.log(`📡 Channel status for ${roomCode}:`, status, err ? err : '');

                    if (status === 'SUBSCRIBED') {
                        console.log(`✅ Successfully subscribed to room:${roomCode}`);
                        if (this.channel) {
                            try {
                                await this.channel.track(userData);
                                console.log(`👥 Presence tracked for ${userData.nickname}`);
                                resolve(true);
                            } catch (err) {
                                console.error('❌ Track error:', err);
                                resolve(false);
                            }
                        } else {
                            resolve(false);
                        }
                    } else if (status === 'CLOSED') {
                        console.warn(`⚠️ Channel CLOSED for ${roomCode}`);
                        // Don't set this.channel to null immediately if we are in the middle of a purposeful re-join
                        resolve(false);
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error(`❌ Channel subscription failed (${status}):`, err);
                        resolve(false);
                    }
                });
            });

            const success = await subscribe();

            // If subscription failed, clean up
            if (!success) {
                this.channel = null;
            }

            this.isJoining = false;
            return success;
        })();

        return this.joinPromise;
    }

    async leaveRoom() {
        if (this.channel) {
            const chan = this.channel;
            const code = this.roomCode;
            this.channel = null;
            this.roomCode = null;
            this.presenceState = {};
            this.isJoining = false;
            this.joinPromise = null;

            try {
                await supabase.removeChannel(chan);
                console.log(`🔌 Channel for ${code} removed successfully`);
            } catch (error) {
                console.log('Channel removal error:', error);
            }
        }
    }

    emit(event, payload) {
        if (!this.channel) {
            console.error(`❌ Cannot emit ${event}: Not joined to a room`);
            return;
        }
        try {
            this.channel.send({
                type: 'broadcast',
                event,
                payload,
            });
        } catch (err) {
            console.error('Emit error:', err);
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

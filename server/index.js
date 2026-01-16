const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev to fix 400 errors
        methods: ["GET", "POST"]
    }
});

const GameManager = require('./gameManager');
const friendsManager = require('./friendsManager');
const gameManager = new GameManager(io);

// userId -> socketId mapping for notifications
const userSockets = new Map();
// socketId -> { roomCode, userId, nickname } mapping for internal lookups
const socketMetadata = new Map();
// userId -> { timeout, roomCode } for reconnection grace period
const reconnectionTimers = new Map();

const broadcastActiveRooms = () => {
    const activeRooms = gameManager.getActiveRooms();
    io.emit('active_rooms_updated', activeRooms);
};

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('get_active_rooms', (callback) => {
        callback(gameManager.getActiveRooms());
    });

    socket.on('get_packs', (callback) => {
        // Reload packs to get latest custom additions
        gameManager.packs = gameManager.loadPacks();
        const packs = gameManager.getPacks();
        callback(packs);
    });

    socket.on('save_pack', (packData, callback) => {
        try {
            const fs = require('fs');
            const path = require('path');
            const customPath = path.join(__dirname, 'data', 'custom_packs.json');

            let customPacks = [];
            if (fs.existsSync(customPath)) {
                try {
                    customPacks = JSON.parse(fs.readFileSync(customPath, 'utf8'));
                } catch (e) { customPacks = []; }
            }

            // Assign ID
            packData.id = `custom_${Date.now()}`;
            packData.isCustom = true;

            customPacks.push(packData);

            fs.writeFileSync(customPath, JSON.stringify(customPacks, null, 2));

            // Reload manager
            gameManager.packs = gameManager.loadPacks();

            callback({ success: true, id: packData.id });
        } catch (err) {
            console.error(err);
            callback({ success: false, error: err.message });
        }
    });

    socket.on('create_room', (settings, callback) => {
        const { userId } = settings;
        if (userId) userSockets.set(userId, socket.id);

        const roomCode = gameManager.createRoom(socket.id, userId, settings);
        socketMetadata.set(socket.id, { roomCode, userId, nickname: settings.nickname });
        socket.join(roomCode);
        console.log(`Room Created: ${roomCode} by ${socket.id} (${userId})`);
        const room = gameManager.rooms[roomCode];
        broadcastActiveRooms();
        callback({ roomCode, players: room ? room.players : [] });
    });

    socket.on('join_room', ({ roomCode, userId, nickname, avatar }, callback) => {
        if (userId) userSockets.set(userId, socket.id);

        const result = gameManager.joinRoom(roomCode, socket.id, userId, nickname, avatar);
        if (result.error) {
            callback({ error: result.error });
        } else {
            socketMetadata.set(socket.id, { roomCode, userId, nickname });
            socket.join(roomCode);
            // Notify host and other players
            io.to(roomCode).emit('player_joined', result.room.players);
            io.to(roomCode).emit('waiting_message', {
                id: Date.now(),
                type: 'system',
                content: `📢 ${nickname} joined ${result.isLateJoin ? 'the game in progress' : 'Room ' + roomCode}`,
                timestamp: new Date().toISOString()
            });
            broadcastActiveRooms();
            callback({ success: true, room: result.room, isLateJoin: result.isLateJoin });
            console.log(`${nickname} (${userId}) joined room ${roomCode} (Late: ${result.isLateJoin})`);
        }
    });

    socket.on('play_again', ({ roomCode }) => {
        if (gameManager.resetGame(roomCode)) {
            // Emit to everyone to go back to lobby
            io.to(roomCode).emit('game_reset');
        }
    });


    socket.on('start_game', async ({ roomCode }) => {
        const firstQuestion = await gameManager.startGame(roomCode);
        if (firstQuestion) {
            io.to(roomCode).emit('game_started', firstQuestion);
            console.log(`Game started in room ${roomCode}`);
        }
    });

    socket.on('next_question', ({ roomCode }) => {
        const result = gameManager.nextQuestion(roomCode);
        if (result) {
            if (result.gameOver) {
                io.to(roomCode).emit('game_over', result);
            } else {
                io.to(roomCode).emit('new_question', result.question);
            }
        }
    });

    socket.on('end_round', ({ roomCode }) => {
        const result = gameManager.endRound(roomCode);
        if (result) {
            io.to(roomCode).emit('round_ended', result);
        }
    });

    socket.on('submit_answer', ({ roomCode, answer, timeRemaining }, callback) => {
        const result = gameManager.submitAnswer(roomCode, socket.id, answer, timeRemaining);
        if (result && result.player) {
            // Broadcast status update
            const room = gameManager.rooms[roomCode];
            io.to(roomCode).emit('player_joined', room.players);

            // System message for other players
            io.to(roomCode).emit('waiting_message', {
                id: Date.now(),
                type: 'system',
                content: `📢 ${result.player.nickname} finished the question and is now waiting`,
                timestamp: new Date().toISOString()
            });

            // If in team mode and matched, notify specifically if needed (or just rely on player_joined for scores)
            if (result.teamMatched) {
                // We could emit a specific event, but player_joined + system message might be enough.
                // Let's add a system message for the team.
                io.to(roomCode).emit('waiting_message', {
                    id: Date.now() + 1,
                    type: 'system',
                    content: `📢 Team Match! ${result.player.nickname} and their teammate matched answers!`,
                    timestamp: new Date().toISOString()
                });
            }

            // Check if everyone is waiting (to notify host)
            const allWaiting = room.players.every(p => p.status === 'waiting' || p.isHost);
            if (allWaiting) {
                io.to(roomCode).emit('all_players_waiting', { players: room.players });
            }
        }
        callback(result);
    });

    // --- Chat Events ---
    socket.on('send_message', ({ roomCode, message, nickname }) => {
        // Broadcast to everyone in the room INCLUDING sender (for simplicity sync)
        io.to(roomCode).emit('receive_message', {
            id: Date.now() + Math.random(), // Unique ID
            text: message,
            sender: nickname,
            senderId: socket.id, // To identify "me" vs "others"
            timestamp: new Date().toISOString()
        });
    });

    socket.on('typing', ({ roomCode, nickname, isTyping }) => {
        socket.to(roomCode).emit('user_typing', { nickname, isTyping });
    });

    // --- Waiting Room Events ---
    // --- Waiting Room Events ---
    socket.on('enter_waiting_room', ({ roomCode, nickname, userId, mode, avatar }) => {
        if (userId) {
            userSockets.set(userId, socket.id);
            // Clear any pending removal timer
            if (reconnectionTimers.has(userId)) {
                console.log(`Clearing reconnection timer for user: ${userId}`);
                clearTimeout(reconnectionTimers.get(userId).timeout);
                reconnectionTimers.delete(userId);
            }
        }
        socketMetadata.set(socket.id, { roomCode, userId, nickname });
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        console.log(`Player ${nickname} entered waiting room ${roomCode} in mode ${mode}`);

        // Update player's status and handle socket ID changes
        let player = room.players.find(p => p.id === socket.id);

        // If not found by ID (maybe socket changed), try by userId or nickname
        if (!player) {
            player = room.players.find(p => (userId && p.userId === userId) || p.nickname === nickname);
            if (player) {
                console.log(`Updating socket ID for player ${player.nickname}: ${player.id} -> ${socket.id}`);

                // If the player was in a team, update his ID in the teams structure
                let teamSpotUpdated = false;
                if (room.teams) {
                    room.teams.forEach(t => {
                        t.spots.forEach((sId, idx) => {
                            if (sId === player.id) {
                                t.spots[idx] = socket.id;
                                teamSpotUpdated = true;
                            }
                        });
                    });
                }

                // If a team spot was updated, broadcast it to everyone
                if (teamSpotUpdated) {
                    io.to(roomCode).emit('team_update', room.teams);
                }

                // If this was the host, update hostId
                if (room.hostId === player.id) {
                    room.hostId = socket.id;
                }

                player.id = socket.id;
            }
        }

        if (player) {
            player.isOnline = true;
            player.inWaitingRoom = true;
            if (avatar) player.avatar = avatar; // Store/Update avatar

            // If returning from a question, set status to 'waiting'
            if (mode === 'between-questions') {
                player.status = 'waiting';
            }
        } else {
            console.log(`Player ${nickname} NOT found in room ${roomCode} after search.`);
        }

        // Always broadcast full player list update
        io.to(roomCode).emit('player_joined', room.players);

        // Sync teams and mode state for the joining player
        socket.emit('room_info', {
            isTeamMode: room.isTeamMode,
            teams: room.teams,
            settings: room.settings
        });

        if (room.teams) {
            socket.emit('team_update', room.teams);
        }

        // If host enters, ensure everyone knows (redundant but safe)
        if (room.hostId === socket.id && mode !== 'between-questions') {
            socket.to(roomCode).emit('enter_waiting_room', { roomCode });
        }

        // Check if all players are waiting (for between-questions)
        if (mode === 'between-questions') {
            const allWaiting = room.players.every(p => p.status === 'waiting' || p.isHost);
            if (allWaiting) {
                io.to(roomCode).emit('all_players_waiting', { players: room.players });
            }
        }
    });

    socket.on('update_profile', ({ roomCode, nickname, avatar }) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        // Check for name uniqueness (excluding self)
        const nameTaken = room.players.some(p => p.id !== socket.id && p.nickname.toLowerCase() === nickname.toLowerCase());
        if (nameTaken) {
            socket.emit('profile_update_error', { message: 'الاسم مستخدم بالفعل' });
            return;
        }

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            const oldName = player.nickname;
            player.nickname = nickname;
            player.avatar = avatar || player.avatar;

            // Broadcast update
            io.to(roomCode).emit('player_joined', room.players);

            // System message
            if (oldName !== nickname) {
                io.to(roomCode).emit('waiting_message', {
                    id: Date.now(),
                    type: 'system',
                    content: `📢 ${oldName} غير اسمه إلى ${nickname}`,
                    timestamp: new Date().toISOString()
                });
            }

            socket.emit('profile_updated', { nickname, avatar: player.avatar });
        }
    });

    socket.on('player_finished_question', ({ roomCode, nickname }) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.status = 'waiting';
            // Broadcast full list update
            io.to(roomCode).emit('player_joined', room.players);

            const allWaiting = room.players.every(p => p.status === 'waiting' || p.isHost);
            if (allWaiting) {
                io.to(roomCode).emit('all_players_waiting', { players: room.players });
            }
        }
    });

    // Alias for user snippet compatibility
    socket.on('player_waiting', (data) => {
        const room = gameManager.rooms[data.roomCode];
        if (!room) return;
        // reuse logic
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.status = 'waiting';
            io.to(data.roomCode).emit('player_joined', room.players);
        }
    });

    socket.on('toggle_ready', ({ roomCode, isReady }) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.isHost) {
            player.isReady = isReady;
            // Emit full update instead of partial
            io.to(roomCode).emit('player_joined', room.players);
            // Also emit specific event for UI feedback if needed
            io.to(roomCode).emit('ready_changed', {
                playerId: socket.id,
                nickname: player.nickname,
                isReady,
                players: room.players
            });
        }
    });

    socket.on('join_team', ({ roomCode, teamIndex, spotIndex }) => {
        const result = gameManager.joinTeam(roomCode, socket.id, teamIndex, spotIndex);
        if (result.success) {
            // Broadcast the new team state to everyone
            io.to(roomCode).emit('team_update', result.teams);

            // Send system messages
            result.messages.forEach(msg => {
                io.to(roomCode).emit('waiting_message', {
                    id: Date.now() + Math.random(),
                    type: 'system',
                    content: msg,
                    timestamp: new Date().toISOString()
                });
            });
        } else if (result.error) {
            socket.emit('team_error', { message: result.error });
        }
    });

    // Anti-spam tracking
    const lastMessageTime = {};

    socket.on('send_waiting_message', ({ roomCode, message, nickname }) => {
        // Anti-spam check (3 seconds between messages)
        const now = Date.now();
        const lastTime = lastMessageTime[socket.id] || 0;
        if (now - lastTime < 3000) {
            return; // Block spam
        }
        lastMessageTime[socket.id] = now;

        // Limit message length
        const cleanMessage = message.slice(0, 100);

        io.to(roomCode).emit('waiting_message', {
            id: Date.now() + Math.random(),
            text: cleanMessage,
            sender: nickname,
            senderId: socket.id,
            timestamp: new Date().toISOString()
        });
    });

    // Enhanced disconnect handler with timeout
    socket.on('disconnect', () => {
        const metadata = socketMetadata.get(socket.id);
        if (!metadata) {
            console.log(`User Disconnected (No metadata): ${socket.id}`);
            return;
        }

        const { roomCode, userId, nickname } = metadata;
        console.log(`User Disconnected: ${socket.id} (User: ${nickname}, ID: ${userId})`);

        if (userId) {
            // Set a timer to remove the player if they don't reconnect
            const timeout = setTimeout(() => {
                console.log(`Reconnection timeout reached for user: ${userId}. Removing from room ${roomCode}.`);
                reconnectionTimers.delete(userId);
                handleActualRemoval(socket.id, roomCode, userId, nickname);
            }, 10000); // 10 seconds grace period

            reconnectionTimers.set(userId, { timeout, roomCode });

            // Just mark as offline for now
            const room = gameManager.rooms[roomCode];
            if (room) {
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    player.isOnline = false;
                    io.to(roomCode).emit('player_joined', room.players);
                }
            }
        } else {
            // No userId? Remove immediately
            handleActualRemoval(socket.id, roomCode, userId, nickname);
        }
    });

    const handleActualRemoval = (socketId, roomCode, userId, nickname) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.id === socketId || (userId && p.userId === userId));
        if (playerIndex === -1) return;

        const player = room.players[playerIndex];
        const wasHost = player.isHost;

        // Remove player
        room.players.splice(playerIndex, 1);

        // System Message: Player Left
        io.to(roomCode).emit('waiting_message', {
            id: Date.now(),
            type: 'system',
            content: `📢 ${nickname} left the room`,
            timestamp: new Date().toISOString()
        });

        // Host Migration
        if (wasHost && room.players.length > 0) {
            const newHost = room.players[0];
            newHost.isHost = true;
            room.hostId = newHost.id;

            io.to(roomCode).emit('waiting_message', {
                id: Date.now() + 1,
                type: 'system',
                content: `📢 ${newHost.nickname} is now the host`,
                timestamp: new Date().toISOString()
            });
        }

        // Clean up metadata
        socketMetadata.delete(socketId);
        if (userId && userSockets.get(userId) === socketId) {
            userSockets.delete(userId);
        }

        // Notify all clients
        io.to(roomCode).emit('player_joined', room.players);
        io.to(roomCode).emit('player_left', {
            playerId: socketId,
            nickname,
            players: room.players
        });

        broadcastActiveRooms();
    };

    // --- Friend System Events ---
    socket.on('get_friends', (userId, callback) => {
        const data = friendsManager.getFriends(userId);
        callback(data);
    });

    socket.on('send_friend_request', ({ senderId, targetId, senderName }, callback) => {
        const result = friendsManager.sendRequest(senderId, targetId);
        if (result.success) {
            const targetSocketId = userSockets.get(targetId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('friend_request_received', {
                    senderId,
                    senderName,
                    timestamp: new Date().toISOString()
                });
            }
            callback({ success: true });
        } else {
            callback({ error: result.error });
        }
    });

    socket.on('accept_friend_request', ({ userId, targetId, userName, userAvatar, targetName, targetAvatar }, callback) => {
        const result = friendsManager.acceptRequest(userId, targetId, userName, userAvatar, targetName, targetAvatar);
        if (result.success) {
            const targetSocketId = userSockets.get(targetId);
            if (targetSocketId) {
                const targetMeta = socketMetadata.get(targetSocketId);
                const userMeta = socketMetadata.get(socket.id);

                io.to(targetSocketId).emit('friend_request_accepted', { userId, userName, avatar: userAvatar });

                // If both are in the same room, broadcast system message
                if (userMeta && targetMeta && userMeta.roomCode === targetMeta.roomCode) {
                    io.to(userMeta.roomCode).emit('waiting_message', {
                        id: Date.now(),
                        type: 'system',
                        content: `📢 ${userName} و ${targetMeta.nickname} أصبحا أصدقاء الآن!`,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            callback({ success: true });
        } else {
            callback({ error: result.error });
        }
    });

    socket.on('reject_friend_request', ({ userId, targetId }, callback) => {
        const result = friendsManager.rejectRequest(userId, targetId);
        if (result.success) {
            const targetSocketId = userSockets.get(targetId);
            if (targetSocketId) {
                // Optional: notify sender (often quiet, but user requested it)
                io.to(targetSocketId).emit('friend_request_rejected', { userId });
            }
            callback({ success: true });
        } else {
            callback({ error: result.error });
        }
    });
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});

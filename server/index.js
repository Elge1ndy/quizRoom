const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// SPA Fallback: handle React routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev to fix 400 errors
        methods: ["GET", "POST"]
    }
});

const GameManager = require('./gameManager');
const friendsManager = require('./friendsManager');
const db = require('./database');
const gameManager = new GameManager(io);

// === SUPABASE DATABASE (Replaced JSON files) ===
console.log('💾 Using Supabase PostgreSQL for player storage');

// userId -> socketId mapping for notifications
const userSockets = new Map();
// mapping for internal lookups
const socketMetadata = new Map();
// roomCode -> { timer, timeLeft }
const roomTimers = new Map();

const startRoomTimer = (roomCode, duration) => {
    // Clear existing timer if any
    if (roomTimers.has(roomCode)) {
        clearInterval(roomTimers.get(roomCode).interval);
    }

    let timeLeft = duration;
    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(interval);
            roomTimers.delete(roomCode);
            autoEndRound(roomCode);
        } else {
            roomTimers.set(roomCode, { interval, timeLeft });
            // Optional: send sync pulses? 
            // For now we'll just rely on the start event and the final force-close.
        }
    }, 1000);

    roomTimers.set(roomCode, { interval, timeLeft });
};

const autoEndRound = (roomCode) => {
    finalizeRound(roomCode, 'timer');
};

const checkAndFinalizeRound = (roomCode) => {
    const room = gameManager.rooms[roomCode];
    if (!room || room.state !== 'playing') return;

    // A player is "active" if they are not a late-joiner for this specific question
    const playersToWaitFor = room.players.filter(p => p.status !== 'waiting-next-round');
    const stillAnswering = playersToWaitFor.filter(p => p.status === 'answering').map(p => p.nickname);

    console.log(`[TimerSync] Room ${roomCode}: Still answering: [${stillAnswering.join(', ')}]`);

    // If there are players we are waiting for, check if they all have 'waiting' status (answered)
    if (playersToWaitFor.length > 0) {
        const allDone = playersToWaitFor.every(p => p.status === 'waiting');
        if (allDone) {
            console.log(`[TimerSync] All active players answered in room ${roomCode}. Finalizing round early.`);
            finalizeRound(roomCode, 'manual');
        }
    } else {
        // If no one is scheduled to answer (e.g. only host left), end it immediately
        console.log(`[TimerSync] No active players left to wait for in room ${roomCode}. Finalizing round.`);
        finalizeRound(roomCode, 'manual');
    }
};

const finalizeRound = (roomCode, reason = 'manual') => {
    // Clear room timer first
    if (roomTimers.has(roomCode)) {
        clearInterval(roomTimers.get(roomCode).interval);
        roomTimers.delete(roomCode);
    }

    const result = gameManager.endRound(roomCode);
    if (result) {
        io.to(roomCode).emit('round_ended', result);

        const timestamp = new Date().toISOString();
        if (reason === 'timer') {
            io.to(roomCode).emit('waiting_message', {
                id: Date.now(),
                type: 'system',
                content: `⏱️ وقت السؤال انتهى`,
                timestamp
            });
            io.to(roomCode).emit('waiting_message', {
                id: Date.now() + 1,
                type: 'system',
                content: `📢 تم إغلاق السؤال تلقائيًا`,
                timestamp
            });
        } else {
            io.to(roomCode).emit('waiting_message', {
                id: Date.now(),
                type: 'system',
                content: `✅ جميع اللاعبين أكملوا الإجابة`,
                timestamp
            });
        }

        io.to(roomCode).emit('waiting_message', {
            id: Date.now() + 2,
            type: 'system',
            content: `↩️ العودة إلى صفحة الانتظار`,
            timestamp
        });
    }
};

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

    // --- DEVICE BINDING & AUTH SYSTEM (SUPABASE) ---

    // 1. Returning User Check
    socket.on('validate_device', async (deviceId, callback) => {
        if (!deviceId) return callback({ found: false });

        const result = await db.findPlayerByDevice(deviceId);

        if (result.found) {
            // Auto-update socket metadata
            socketMetadata.set(socket.id, {
                ...socketMetadata.get(socket.id),
                nickname: result.nickname,
                deviceId
            });
            callback(result);
        } else {
            callback({ found: false });
        }
    });

    // 2. First-Time Registration
    socket.on('register_device', async ({ deviceId, nickname, avatar }, callback) => {
        if (!deviceId || !nickname || !avatar) {
            return callback({ success: false, error: 'بيانات غير مكتملة' });
        }

        const result = await db.registerPlayer(deviceId, nickname, avatar);

        if (result.success) {
            // Update socket metadata
            socketMetadata.set(socket.id, {
                ...socketMetadata.get(socket.id),
                nickname: nickname.trim(),
                deviceId
            });
        }

        callback(result);
    });

    // --- Nickname Uniqueness Check (SUPABASE) ---
    socket.on('check_nickname_uniqueness', async (nickname, callback) => {
        const nickLower = nickname.toLowerCase().trim();

        // Check database for permanent registrations
        const isTakenInDB = await db.isNicknameTaken(nickLower);

        // Still check active rooms and sockets (temporary reservations)
        const isTakenInRooms = Object.values(gameManager.rooms).some(room =>
            room.players.some(p => p.nickname.toLowerCase() === nickLower)
        );

        const isTakenInMetadata = Array.from(socketMetadata.values()).some(meta =>
            meta.nickname && meta.nickname.toLowerCase() === nickLower
        );

        if (isTakenInRooms || isTakenInMetadata || isTakenInDB) {
            callback({ available: false, error: '❌ هذا الاسم مستخدم بالفعل، من فضلك اختر اسمًا آخر' });
        } else {
            // Reserve it temporarily in metadata
            socketMetadata.set(socket.id, { ...socketMetadata.get(socket.id), nickname: nickname.trim() });
            callback({ available: true });
        }
    });

    socket.on('create_room', (settings, callback) => {
        const { userId, deviceId } = settings; // [UPDATED] Receive deviceId
        if (userId) userSockets.set(userId, socket.id);

        const roomCode = gameManager.createRoom(socket.id, userId, settings);
        socketMetadata.set(socket.id, { roomCode, userId, nickname: settings.nickname, deviceId });
        socket.join(roomCode);
        console.log(`Room Created: ${roomCode} by ${socket.id} (${userId})`);
        const room = gameManager.rooms[roomCode];
        broadcastActiveRooms();
        callback({ roomCode, players: room ? room.players : [] });
    });

    socket.on('join_room', ({ roomCode, userId, nickname, avatar, deviceId }, callback) => { // [UPDATED] Receive deviceId
        if (userId) userSockets.set(userId, socket.id);

        const result = gameManager.joinRoom(roomCode, socket.id, userId, nickname, avatar);
        if (result.error) {
            callback({ error: result.error });
        } else {
            socketMetadata.set(socket.id, { roomCode, userId, nickname, deviceId });
            socket.join(roomCode);

            // Ensure deviceId is in player object for stats lookup later
            const room = gameManager.rooms[roomCode];
            const player = room.players.find(p => p.id === socket.id);
            if (player) player.deviceId = deviceId;

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
            const room = gameManager.rooms[roomCode];
            const duration = room.settings.timeLimit || 30;

            // Add timeLeft to the question payload
            firstQuestion.timeLeft = duration;

            io.to(roomCode).emit('game_started', firstQuestion);
            startRoomTimer(roomCode, duration);
            console.log(`Game started in room ${roomCode} with ${duration}s timer`);
        }
    });

    socket.on('next_question', ({ roomCode }) => {
        const result = gameManager.nextQuestion(roomCode);
        if (result) {
            if (result.gameOver) {
                if (roomTimers.has(roomCode)) {
                    clearInterval(roomTimers.get(roomCode).interval);
                    roomTimers.delete(roomCode);
                }

                // [NEW] Update stats for all players
                const room = gameManager.rooms[roomCode];
                if (room) {
                    const packName = room.pack ? (room.pack.title || room.pack.name) : "لعبة سريعة";
                    const winner = result.winner;

                    room.players.forEach(async (p) => {
                        // Only update for real players (non-host or host if you want host stats?)
                        // Most games don't track host stats if they don't play.
                        if (p.deviceId && !p.isHost) {
                            try {
                                await db.updatePlayerStats(p.deviceId, {
                                    points: p.score || 0,
                                    isWin: winner && p.id === winner.id,
                                    correctAnswers: p.correctAnswers || 0,
                                    totalQuestions: p.totalQuestions || 0,
                                    packName
                                });
                            } catch (e) {
                                console.error(`Failed to update stats for player ${p.nickname}:`, e);
                            }
                        }
                    });
                }

                io.to(roomCode).emit('game_over', result);
                io.to(roomCode).emit('waiting_message', {
                    id: Date.now(),
                    type: 'system',
                    content: `📢 آخر سؤال انتهى`,
                    timestamp: new Date().toISOString()
                });
            } else {
                const room = gameManager.rooms[roomCode];
                const duration = room.settings.timeLimit || 30;

                // Add timeLeft to the question payload
                result.question.timeLeft = duration;

                io.to(roomCode).emit('new_question', result.question);
                startRoomTimer(roomCode, duration);
            }
        }
    });

    socket.on('end_round', ({ roomCode }) => {
        const result = gameManager.endRound(roomCode);
        if (result) {
            io.to(roomCode).emit('round_ended', result);
            io.to(roomCode).emit('waiting_message', {
                id: Date.now() + 5, // Offset to not clash
                type: 'system',
                content: `📢 الجولة انتهت`,
                timestamp: new Date().toISOString()
            });
        }
    });

    socket.on('submit_answer', ({ roomCode, answer, timeRemaining }, callback) => {
        // Enforce server-side timer
        if (roomTimers.has(roomCode) && roomTimers.get(roomCode).timeLeft <= 0) {
            if (callback) callback({ error: '⏱️ وقت السؤال انتهى' });
            return;
        }

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

            // If in team mode and matched
            if (result.teamMatched) {
                io.to(roomCode).emit('waiting_message', {
                    id: Date.now() + 1,
                    type: 'system',
                    content: `📢 Team Match! ${result.player.nickname} and their teammate matched answers!`,
                    timestamp: new Date().toISOString()
                });
            }

            checkAndFinalizeRound(roomCode);
        }
        if (callback) callback(result);
    });

    socket.on('get_profile_stats', async (deviceId, callback) => {
        if (!deviceId) return callback({ success: false, error: 'DeviceId required' });
        const result = await db.getPlayerStats(deviceId);
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



    socket.on('enter_waiting_room', ({ roomCode, nickname, userId, mode, avatar }) => {
        if (userId) {
            userSockets.set(userId, socket.id);
        }
        socketMetadata.set(socket.id, { roomCode, userId, nickname });
        const room = gameManager.rooms[roomCode];
        if (!room) {
            socket.emit('room_error', { message: '❌ هذه الغرفة لم تعد موجودة.' });
            return;
        }

        console.log(`Player ${nickname} entered waiting room ${roomCode} in mode ${mode}`);

        // Update player's status and handle socket ID changes
        let player = room.players.find(p => p.id === socket.id);

        // If not found by ID (maybe socket changed), try by userId or nickname
        if (!player) {
            player = room.players.find(p => (userId && p.userId === userId) || p.nickname === nickname);
            if (player) {
                console.log(`Updating socket ID for player ${player.nickname}: ${player.id} -> ${socket.id}`);

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
            settings: room.settings,
            pack: room.pack // [NEW] Send pack info for UI
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
            // STRICT LOCK: Reject all changes if identity is already set
            // The user requested NO changes after initial setup.
            return socket.emit('profile_updated', { success: false, error: '🔒 الهوية مثبتة ولا يمكن تغييرها' });
        }

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
    });

    socket.on('player_finished_question', ({ roomCode }) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.status = 'waiting';
            io.to(roomCode).emit('player_joined', room.players);
            checkAndFinalizeRound(roomCode);
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

    socket.on('kick_player', ({ roomCode, targetId }) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        // Security check: only host can kick
        if (room.hostId !== socket.id) return;

        const targetPlayer = room.players.find(p => p.id === targetId);
        if (!targetPlayer) return;

        const nickname = targetPlayer.nickname;

        // Perform kick
        const result = gameManager.removePlayer(roomCode, targetId);
        if (result.success) {
            // Notify the kicked player (they might be on a different socket)
            const kickedSocketId = userSockets.get(targetPlayer.userId) || targetPlayer.id;
            io.to(kickedSocketId).emit('player_kicked');

            // Force socket disconnect/leave
            const targetSocket = io.sockets.sockets.get(kickedSocketId);
            if (targetSocket) {
                targetSocket.leave(roomCode);
            }

            // Update room
            io.to(roomCode).emit('player_joined', result.players);
            if (result.teams) {
                io.to(roomCode).emit('team_update', result.teams);
            }

            io.to(roomCode).emit('waiting_message', {
                id: Date.now(),
                type: 'system',
                content: `📢 تم طرد ${nickname} من الغرفة`,
                timestamp: new Date().toISOString()
            });
        }
        checkAndFinalizeRound(roomCode);
    });

    socket.on('play_again_and_start', async ({ roomCode, packId }) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;
        if (room.hostId !== socket.id) return; // Only host

        // 1. Reset Game
        gameManager.resetGame(roomCode, packId);

        // 2. Start Game immediately
        const firstQuestion = await gameManager.startGame(roomCode);
        const duration = room.settings.timeLimit || 30;

        // 3. Notify all players
        io.to(roomCode).emit('room_reset', {
            room: room, // Contains new pack info
            players: room.players
        });

        // 4. Send Game Started event (after a slight delay to allow client reset?)
        // Actually, 'room_reset' causes client reload/navigate. 
        // We should skip 'room_reset' if we want seamless transition to game, 
        // BUT client needs to know pack might be different.
        // My plan in WaitingRoom.jsx: handle 'room_reset' -> navigate '/waiting'.
        // If we want to go straight to game, we should emit 'game_started' directly?
        // But 'game_started' requires client to be on 'GameScreen' or listening for it?
        // Unmounted 'GameScreen' (if on Leaderboard) might not listen?
        // WaitingRoom listens for 'game_started'.

        // If clients are in Leaderboard, they need to be redirected.
        // Leaderboard listens to 'game_started'? 
        // If not, we rely on 'room_reset' to bring them to WaitingRoom.

        // Let's stick to: room_reset -> WaitingRoom -> (Auto) game_started?
        // But users want "Start new round immediately".

        // Let's try emitting 'game_started' and hope client handles it.
        // If client is in 'WaitingRoom', it handles 'game_started' -> navigate '/game'.
        // If client is in 'Leaderboard', it might NOT handle 'game_started'.

        // I should check Leaderboard.jsx quickly to see if it supports 'game_started'.
        // If not, I'll add listener there.

        // For now, I'll emit 'room_reset' AND 'game_started' with delay?
        setTimeout(() => {
            io.to(roomCode).emit('game_started', {
                ...firstQuestion,
                timeLeft: duration
            });
            startRoomTimer(roomCode, duration);
        }, 2000); // 2 seconds for clients to switch to WaitingRoom/Reset
    });

    socket.on('play_again', ({ roomCode, newPackId }) => {
        const room = gameManager.rooms[roomCode];
        if (!room) return;

        // Security check: only host can reset
        if (room.hostId !== socket.id) return;

        const success = gameManager.resetGame(roomCode, newPackId);
        if (success) {
            io.to(roomCode).emit('room_reset', {
                room,
                players: room.players,
                newPackName: room.pack ? room.pack.name : null
            });

            if (newPackId) {
                io.to(roomCode).emit('waiting_message', {
                    id: Date.now(),
                    type: 'system',
                    content: `📢 تم اختيار حزمة أسئلة جديدة: ${room.pack.name}`,
                    timestamp: new Date().toISOString()
                });
            }

            io.to(roomCode).emit('waiting_message', {
                id: Date.now() + 1,
                type: 'system',
                content: `📢 بدأت جولة جديدة`,
                timestamp: new Date().toISOString()
            });
        }
    });

    // Anti-spam tracking
    const lastMessageTime = {};

    socket.on('send_waiting_message', async ({ roomCode, message, nickname }) => {
        // Anti-spam check (3 seconds between messages)
        const now = Date.now();
        const lastTime = lastMessageTime[socket.id] || 0;
        if (now - lastTime < 3000) {
            return; // Block spam
        }
        lastMessageTime[socket.id] = now;

        // Limit message length
        const cleanMessage = message.slice(0, 100);

        // Save to database
        const deviceId = socketMetadata.get(socket.id)?.deviceId;
        await db.saveMessage(roomCode, nickname, cleanMessage, deviceId, 'user');

        io.to(roomCode).emit('waiting_message', {
            id: Date.now() + Math.random(),
            text: cleanMessage,
            sender: nickname,
            senderId: socket.id,
            timestamp: new Date().toISOString()
        });
    });

    socket.on('get_room_messages', async ({ roomCode }, callback) => {
        const messages = await db.getRoomMessages(roomCode);

        // Transform for client if needed (currently client expects similar format)
        const formattedMessages = messages.map(msg => ({
            id: msg.id,
            text: msg.message_text,
            sender: msg.sender_nickname,
            senderId: msg.sender_device_id, // Note: This might not match socket.id for "me" check if not careful, but good enough for history
            timestamp: msg.created_at,
            type: msg.message_type
        })).reverse(); // Client usually expects chronological order if appending, or we can just send as is.
        // Usually chat is displayed top-to-bottom (oldest to newest). 
        // getRoomMessages returns DESC (newest first). 
        // So reverse makes it oldest first.

        callback({ messages: formattedMessages });
    });

    // Enhanced disconnect handler with timeout
    socket.on('system_reset_all', (data, callback) => {
        const { adminSecret } = data || {};
        const SERVER_ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

        if (adminSecret !== SERVER_ADMIN_SECRET) {
            console.warn(`🛑 UNAUTHORIZED RESET ATTEMPT by ${socket.id}`);
            if (callback) callback({ success: false, error: 'كلمة المرور غير صحيحة' });
            return;
        }

        console.log(`🧨 SYSTEM RESET AUTHORIZED by ${socket.id}`);
        gameManager.clearAllRooms();
        io.emit('system_reboot');
    });

    socket.on('admin_broadcast', ({ adminSecret, message }, callback) => {
        const SERVER_ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
        if (adminSecret !== SERVER_ADMIN_SECRET) return callback({ success: false, error: 'Wrong Password' });

        console.log(`📢 Admin Broadcast: ${message}`);
        // Emit system message to all chat boxes
        io.emit('waiting_message', {
            id: Date.now(),
            type: 'admin',
            content: `📢 تنبيه من الإدارة: ${message}`,
            timestamp: new Date().toISOString()
        });
        // Emit toast to all screens
        io.emit('system_show_toast', { message: `📢 ${message}`, type: 'info' });

        callback({ success: true });
    });

    socket.on('admin_force_refresh', ({ adminSecret }, callback) => {
        const SERVER_ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
        if (adminSecret !== SERVER_ADMIN_SECRET) return callback({ success: false, error: 'Wrong Password' });

        console.log('🔄 Forced Client Refresh Triggered');
        io.emit('system_reload'); // Clients should listen to this to reload WITHOUT clearing storage
        callback({ success: true });
    });

    socket.on('admin_get_stats', async ({ adminSecret }, callback) => {
        const SERVER_ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
        if (adminSecret !== SERVER_ADMIN_SECRET) return callback({ success: false, error: 'Wrong Password' });

        // Collect statistics from DB and memory
        const totalPlayers = await db.getPlayerCount();
        const onlinePlayers = Array.from(socketMetadata.values()).filter(m => m.nickname).length;
        const activeRooms = Object.keys(gameManager.rooms).length;

        // Get all players from DB
        const dbPlayers = await db.getAllPlayers();

        // Player list with online status
        const players = dbPlayers.map(player => {
            const isOnline = Array.from(socketMetadata.values()).some(m => m.nickname === player.nickname);
            return {
                nickname: player.nickname,
                avatar: player.avatar,
                createdAt: player.created_at,
                isOnline
            };
        });

        // Active rooms info
        const rooms = Object.entries(gameManager.rooms).map(([code, room]) => ({
            roomCode: code,
            hostName: room.players.find(p => p.isHost)?.nickname || 'Unknown',
            playerCount: room.players.length,
            state: room.state,
            packName: room.pack?.name || 'Unknown'
        }));

        callback({
            success: true,
            stats: {
                totalPlayers,
                onlinePlayers,
                activeRooms,
                players,
                rooms
            }
        });
    });

    socket.on('disconnect', () => {
        const metadata = socketMetadata.get(socket.id);
        if (!metadata) {
            console.log(`User Disconnected (No metadata): ${socket.id}`);
            return;
        }

        const { roomCode, userId, nickname } = metadata;
        console.log(`User Disconnected: ${socket.id} (User: ${nickname}, ID: ${userId})`);

        if (userId) {
            const room = gameManager.rooms[roomCode];
            if (room) {
                // Check if it's the last player
                if (room.players.length <= 1) {
                    console.log(`Last player ${nickname} leaving. Closing room ${roomCode} instantly.`);
                    handleActualRemoval(socket.id, roomCode, userId, nickname);
                    return;
                }

                // If not last player, we still remove immediately as per "no countdown or delay is required"
                // This will trigger host migration instantly in handleActualRemoval
                handleActualRemoval(socket.id, roomCode, userId, nickname);
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

        // Automatic Room Cleanup: If no players remaining, close room instantly
        if (room.players.length === 0) {
            gameManager.deleteRoom(roomCode);
            socketMetadata.delete(socketId);
            if (userId && userSockets.get(userId) === socketId) {
                userSockets.delete(userId);
            }

            // Clear timer if exists
            if (roomTimers.has(roomCode)) {
                clearInterval(roomTimers.get(roomCode).interval);
                roomTimers.delete(roomCode);
            }

            broadcastActiveRooms();
            return; // Room is closed, stop processing
        }

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
        checkAndFinalizeRound(roomCode);
    };

    // --- System Maintenance ---
    socket.on('purge_all_rooms', () => {
        gameManager.clearAllRooms();
        userSockets.clear();
        socketMetadata.clear();

        // Clear all timers
        roomTimers.forEach(t => clearInterval(t.interval));
        roomTimers.clear();

        broadcastActiveRooms();
        console.log('🚨 SYSTEM PURGE: All rooms cleared and timers stopped.');
    });

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

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVER RUNNING ON PORT ${PORT}`);
});

const fs = require('fs');
const path = require('path');

class GameManager {
    constructor(io) {
        this.io = io;
        this.rooms = {}; // { roomCode: { hostId, players: [], state: 'lobby', settings: {} } }
        this.packs = this.loadPacks();
    }

    loadPacks() {
        try {
            const officialData = fs.readFileSync(path.join(__dirname, 'data', 'packs.json'), 'utf8');
            let packs = JSON.parse(officialData);

            const customPath = path.join(__dirname, 'data', 'custom_packs.json');
            if (fs.existsSync(customPath)) {
                try {
                    const customData = fs.readFileSync(customPath, 'utf8');
                    const customPacks = JSON.parse(customData);
                    if (Array.isArray(customPacks)) {
                        packs = [...packs, ...customPacks];
                    }
                } catch (e) {
                    console.error("Error loading custom packs:", e);
                }
            }
            return packs;
        } catch (err) {
            console.error("Error loading packs:", err);
            return [];
        }
    }

    getPacks() {
        // Return packs without the questions (metadata only) to save bandwidth
        return this.packs.map(({ questions, ...metadata }) => ({
            ...metadata,
            questionCount: questions ? questions.length : 0
        }));
    }

    createRoom(hostId, userId, settings = {}) {
        const roomCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code

        // Default to first pack if none selected or invalid
        let selectedPack = this.packs.find(p => p.id === settings.packId);
        if (!selectedPack && this.packs.length > 0) {
            selectedPack = this.packs[0];
        }

        this.rooms[roomCode] = {
            hostId: hostId,
            players: [{
                id: hostId,
                userId: userId,
                deviceId: settings.deviceId, // [NEW] Store deviceId
                nickname: settings.nickname || "Mudeef (Host)",
                avatar: settings.avatar || "👑",
                score: 0,
                correctAnswers: 0, // [NEW] Track correct answers
                totalQuestions: 0, // [NEW] Track total questions seen
                isHost: true,
                isReady: true,
                isOnline: true
            }],
            state: 'waiting',
            settings: {
                ...settings,
                packId: selectedPack ? selectedPack.id : null,
                timeLimit: settings.timeLimit || 30 // Default time
            },
            pack: selectedPack, // Store the full pack reference
            questions: [], // Will be populated on start
            scores: {},
            isTeamMode: (selectedPack && selectedPack.name === 'Team Meat'),
            teams: (selectedPack && selectedPack.name === 'Team Meat') ? Array.from({ length: 6 }, (_, i) => ({
                id: i,
                name: `الفريق ${i + 1}`,
                spots: [null, null]
            })) : null
        };
        return roomCode;
    }

    joinRoom(roomCode, playerId, userId, nickname, avatar) {
        const room = this.rooms[roomCode];
        if (!room) return { error: '❌ هذه الغرفة لم تعد موجودة.' };
        if (room.state === 'finished') return { error: 'اللعبة انتهت بالفعل' };

        // Reconnection Logic: check by userId
        const existingPlayer = room.players.find(p => p.userId === userId);
        if (existingPlayer) {
            console.log(`Reconnecting player: ${existingPlayer.nickname} (${userId}) to room ${roomCode}`);
            existingPlayer.id = playerId;
            existingPlayer.isOnline = true;
            return { success: true, room: room, isLateJoin: room.state !== 'waiting' };
        }

        // Case-insensitive Nickname Uniqueness Check
        if (room.players.some(p => p.nickname.toLowerCase().trim() === nickname.toLowerCase().trim())) {
            return { error: '❌ هذا الاسم مستخدم بالفعل في هذه الغرفة' };
        }

        const isLateJoin = room.state !== 'waiting';

        room.players.push({
            id: playerId,
            userId: userId,
            deviceId: avatar.deviceId || null, // Assuming it might be passed or we'll update index.js to pass it
            nickname: nickname.trim(),
            avatar: avatar,
            score: 0,
            correctAnswers: 0,
            totalQuestions: 0,
            isHost: false,
            isReady: isLateJoin ? true : false,
            isOnline: true,
            status: isLateJoin ? 'waiting-next-round' : 'active'
        });
        return { success: true, room: room, isLateJoin };
    }

    removePlayer(roomCode, playerId) {
        const room = this.rooms[roomCode];
        if (!room) return { error: 'Room found' };

        const player = room.players.find(p => p.id === playerId);
        if (!player) return { error: 'Player not found' };

        const initialCount = room.players.length;
        room.players = room.players.filter(p => p.id !== playerId);

        // Remove from team if any (using userId for robustness)
        if (room.teams && player.userId) {
            room.teams.forEach(team => {
                team.spots.forEach((spotUserId, idx) => {
                    if (spotUserId === player.userId) team.spots[idx] = null;
                });
            });
        }

        return { success: true, players: room.players, teams: room.teams };
    }

    joinTeam(roomCode, playerId, teamIndex, spotIndex) {
        const room = this.rooms[roomCode];
        if (!room) return { error: 'الغرفة غير موجودة' };
        if (room.state !== 'waiting') return { error: 'حالة الغرفة غير صالحة' };
        if (!room.teams) return { error: 'هذا الوضع لا يدعم الفرق' };

        const player = room.players.find(p => p.id === playerId);
        if (!player) return { error: 'اللاعب غير موجود' };

        const userId = player.userId;
        if (!userId) return { error: 'مشكلة في هوية اللاعب' };

        // 1. Remove player from any previous spot (using userId)
        room.teams.forEach(t => {
            t.spots.forEach((sUserId, idx) => {
                if (sUserId === userId) t.spots[idx] = null;
            });
        });

        // 2. Validate new spot
        const team = room.teams[teamIndex];
        if (!team) return { error: 'الفريق غير موجود' };
        if (team.spots[spotIndex] !== null) return { error: 'هذا المكان مشغول' };

        // 3. Assign userId to spot
        team.spots[spotIndex] = userId;

        const messages = [];
        messages.push(`📢 ${player.nickname} انضم إلى ${team.name}`);

        const isFull = team.spots.every(s => s !== null);
        if (isFull) {
            messages.push(`📢 ${team.name} مكتمل الآن!`);
        }

        return { success: true, teams: room.teams, messages };
    }

    async startGame(roomCode) {
        const room = this.rooms[roomCode];
        if (!room) return;

        if (!room.pack || !room.pack.questions) {
            console.error("No pack selected for room " + roomCode);
            return;
        }

        room.state = 'playing';
        room.currentQuestionIndex = 0;
        room.roundSubmissions = {}; // Track answers per player for team matching

        // Team Assignment if pack is 'Team Meat'
        if (room.pack.name === 'Team Meat') {
            // First, process manual teams
            if (room.teams) {
                room.teams.forEach((team, tIdx) => {
                    const [u1Id, u2Id] = team.spots;
                    const p1 = room.players.find(p => p.userId === u1Id);
                    const p2 = room.players.find(p => p.userId === u2Id);

                    const teamId = `team_${tIdx}`;
                    if (p1) {
                        p1.teamId = teamId;
                        p1.teammateId = p2 ? p2.id : null;
                    }
                    if (p2) {
                        p2.teamId = teamId;
                        p2.teammateId = p1 ? p1.id : null;
                    }
                });

                // Handle players not in a team (Lone wolves)
                room.players.forEach(p => {
                    if (!p.isHost && !p.teamId) {
                        p.teamId = `lone_${p.id}`;
                        p.teammateId = null;
                    }
                });
            } else {
                // Fallback to random assignment if no teams provided
                const humanPlayers = room.players.filter(p => !p.isHost);
                const shuffled = [...humanPlayers].sort(() => Math.random() - 0.5);

                for (let i = 0; i < shuffled.length; i += 2) {
                    const p1 = shuffled[i];
                    const p2 = shuffled[i + 1];

                    const teamId = `team_${i / 2}`;
                    p1.teamId = teamId;
                    if (p2) {
                        p1.teammateId = p2.id;
                        p2.teamId = teamId;
                        p2.teammateId = p1.id;
                    } else {
                        p1.teammateId = null;
                    }
                }
            }
        }

        const limit = room.settings.questionCount || room.pack.questions.length;
        const maxQuestions = Math.min(limit, room.pack.questions.length);
        room.questions = room.pack.questions.slice(0, maxQuestions);

        return {
            ...room.questions[0],
            index: 0,
            total: room.questions.length,
            isTeamMode: room.pack.name === 'Team Meat'
        };
    }

    endRound(roomCode) {
        const room = this.rooms[roomCode];
        if (!room) return null;

        room.state = 'intermission';
        const currentQuestion = room.questions[room.currentQuestionIndex];
        const isTeamMode = room.pack && room.pack.name === 'Team Meat';
        const teamResults = [];

        // Mark unanswered players
        room.players.forEach(p => {
            if (p.status === 'answering' || !p.lastRoundAnswer) {
                p.lastRoundAnswer = 'No Answer';
                p.status = 'waiting';
                room.roundSubmissions[p.id] = 'no answer';
            }
        });

        // If Team Mode, calculate which teams earned a point
        if (isTeamMode) {
            const processedTeams = new Set();
            room.players.forEach(p => {
                if (p.teamId && !p.isHost && !processedTeams.has(p.teamId)) {
                    const teammate = room.players.find(t => t.id === p.teammateId);
                    if (teammate) {
                        const a1 = (room.roundSubmissions[p.id] || '').trim().toLowerCase();
                        const a2 = (room.roundSubmissions[teammate.id] || '').trim().toLowerCase();
                        const match = a1 === a2 && a1 !== 'no answer';
                        const correct = !currentQuestion.correctAnswer || a1 === currentQuestion.correctAnswer.toLowerCase();
                        const earnedPoint = match && correct;

                        teamResults.push({
                            teamId: p.teamId,
                            player1: p.nickname,
                            player2: teammate.nickname,
                            match,
                            earnedPoint,
                            a1: p.lastRoundAnswer,
                            a2: teammate.lastRoundAnswer
                        });
                        processedTeams.add(p.teamId);
                    } else {
                        // Lone wolf
                        teamResults.push({
                            teamId: p.teamId,
                            player1: p.nickname,
                            earnedPoint: false,
                            lone: true
                        });
                    }
                }
            });
        }

        const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

        return {
            correctAnswer: currentQuestion.correctAnswer,
            scores: sortedPlayers,
            nextQuestionIndex: room.currentQuestionIndex + 1,
            totalQuestions: room.questions.length,
            teamResults: isTeamMode ? teamResults : null
        };
    }

    nextQuestion(roomCode) {
        const room = this.rooms[roomCode];
        if (!room) return null;

        room.state = 'playing';
        room.currentQuestionIndex++;
        room.roundSubmissions = {}; // Reset for next round

        // Reset player status for next question
        room.players.forEach(p => {
            p.status = 'answering';
            p.lastRoundAnswer = null; // Clear answer for new question
        });

        if (room.currentQuestionIndex >= room.questions.length) {
            room.state = 'finished';
            return { gameOver: true, scores: room.players, winner: this.getWinner(room.players) };
        }

        // Increment total questions for all active players
        room.players.forEach(p => {
            if (p.status !== 'waiting-next-round' && !p.isHost) {
                p.totalQuestions = (p.totalQuestions || 0) + 1;
            }
        });

        return {
            question: {
                ...room.questions[room.currentQuestionIndex],
                index: room.currentQuestionIndex,
                total: room.questions.length,
                isTeamMode: room.pack.name === 'Team Meat'
            }
        };
    }

    getWinner(players) {
        return players.reduce((prev, current) => (prev.score > current.score) ? prev : current, players[0]);
    }

    submitAnswer(roomCode, playerId, answer, timeRemaining) {
        const room = this.rooms[roomCode];
        if (!room || room.state !== 'playing') return null;

        const player = room.players.find(p => p.id === playerId);
        if (!player || player.status === 'waiting') return null; // Prevent duplicate submission

        const currentQuestion = room.questions[room.currentQuestionIndex];
        const isTeamMode = room.pack.name === 'Team Meat';
        const cleanAnswer = (answer || "").trim().toLowerCase();

        player.status = 'waiting';
        player.lastRoundAnswer = answer; // Store actual typed answer (not cleaned)
        room.roundSubmissions[playerId] = cleanAnswer;

        if (isTeamMode && player.teammateId) {
            const teammate = room.players.find(p => p.id === player.teammateId);
            const teammateAnswer = room.roundSubmissions[player.teammateId];

            if (teammateAnswer !== undefined) {
                // Both joined the waiting list
                const match = cleanAnswer === teammateAnswer;
                const correct = !currentQuestion.correctAnswer || cleanAnswer === currentQuestion.correctAnswer.toLowerCase();

                if (match && correct) {
                    player.score += 1;
                    teammate.score += 1;
                    return { isCorrect: true, points: 1, player, teamMatched: true, correctAnswer: currentQuestion.correctAnswer || "إجابة مقبولة ✨" };
                }
                return { isCorrect: correct, points: 0, player, teamMatched: match, teammateAnswer, correctAnswer: currentQuestion.correctAnswer || "إجابة مقبولة ✨" };
            } else {
                // Teammate hasn't answered yet
                return { isCorrect: null, points: 0, player, waitingForTeammate: true, correctAnswer: currentQuestion.correctAnswer };
            }
        }

        const isCorrect = !currentQuestion.correctAnswer || cleanAnswer === currentQuestion.correctAnswer.toLowerCase();
        let points = isCorrect ? 1 : 0;
        player.score += points;

        if (isCorrect) {
            player.correctAnswers = (player.correctAnswers || 0) + 1;
        }

        return {
            isCorrect,
            points,
            player,
            correctAnswer: currentQuestion.correctAnswer || "إجابة مقبولة ✨"
        };
    }
    resetGame(roomCode, newPackId = null) {
        const room = this.rooms[roomCode];
        if (!room) return false;

        room.state = 'waiting';
        room.questions = [];
        room.currentQuestionIndex = 0;
        room.scores = {};
        room.roundSubmissions = {};

        // Update pack if provided
        if (newPackId) {
            const selectedPack = this.packs.find(p => p.id === newPackId);
            if (selectedPack) {
                room.pack = selectedPack;
                room.settings.packId = selectedPack.id;
                room.isTeamMode = (selectedPack.name === 'Team Meat');

                // Re-initialize teams if we switched TO Team Meat
                if (room.isTeamMode) {
                    room.teams = Array.from({ length: 6 }, (_, i) => ({
                        id: i,
                        name: `الفريق ${i + 1}`,
                        spots: [null, null]
                    }));
                } else {
                    room.teams = null;
                }
            }
        }

        // Reset player scores and statuses
        room.players.forEach(p => {
            p.score = 0;
            p.status = 'active';
            p.lastRoundAnswer = null;
            p.isReady = p.isHost; // Keep host ready, others need to re-ready if lobby logic requires it

            // Clear team assignments if we changed pack OR if it's a full reset
            p.teamId = null;
            p.teammateId = null;
        });

        return true;
    }

    deleteRoom(roomCode) {
        if (this.rooms[roomCode]) {
            console.log(`🧹 Room closed automatically (no players remaining): ${roomCode}`);
            delete this.rooms[roomCode];
            return true;
        }
        return false;
    }

    clearAllRooms() {
        console.log("🧨 SYSTEM PURGE: Closing all active rooms and resetting state.");
        this.rooms = {};
        return true;
    }

    getActiveRooms() {
        return Object.keys(this.rooms)
            .filter(code => (this.rooms[code].state === 'waiting' || this.rooms[code].state === 'playing' || this.rooms[code].state === 'intermission') && this.rooms[code].players.length < 15) // Raised limit slightly
            .map(code => {
                const room = this.rooms[code];
                const host = room.players.find(p => p.isHost);
                return {
                    roomCode: code,
                    playerCount: room.players.length,
                    hostName: host ? host.nickname : "Mudeef",
                    packName: room.pack ? room.pack.name : "Default",
                    state: room.state
                };
            });
    }
}

module.exports = GameManager;

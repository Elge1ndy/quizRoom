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
                nickname: settings.nickname || "Mudeef (Host)",
                avatar: settings.avatar || "👑",
                score: 0,
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
        if (!room) return { error: 'الغرفة غير موجودة' };
        // Valid for both waiting, playing and intermission
        if (room.state === 'finished') return { error: 'اللعبة انتهت بالفعل' };
        if (room.players.find(p => p.nickname === nickname)) return { error: 'الاسم مستخدم بالفعل' };

        const isLateJoin = room.state !== 'waiting';

        room.players.push({
            id: playerId,
            userId: userId, // Added persistent userId
            nickname: nickname,
            avatar: avatar,
            score: 0,
            isHost: false,
            isReady: isLateJoin ? true : false, // Late joiners shouldn't block round starts
            isOnline: true,
            status: isLateJoin ? 'waiting-next-round' : 'active'
        });
        return { success: true, room: room, isLateJoin };
    }

    removePlayer(roomCode, playerId) {
        const room = this.rooms[roomCode];
        if (!room) return { error: 'Room found' };

        const initialCount = room.players.length;
        room.players = room.players.filter(p => p.id !== playerId);

        if (room.players.length === initialCount) {
            return { error: 'Player not found' };
        }

        // Remove from team if any
        if (room.teams) {
            room.teams.forEach(team => {
                team.spots.forEach((spot, idx) => {
                    if (spot === playerId) team.spots[idx] = null;
                });
            });
        }

        return { success: true, players: room.players, teams: room.teams };
    }

    joinTeam(roomCode, playerId, teamIndex, spotIndex) {
        console.log(`Attempting joinTeam: Room ${roomCode}, Player ${playerId}, Team ${teamIndex}, Spot ${spotIndex}`);
        const room = this.rooms[roomCode];
        if (!room) {
            console.log(`Room ${roomCode} not found in GameManager`);
            return { error: 'الغرفة غير موجودة' };
        }
        if (room.state !== 'waiting') {
            console.log(`Room ${roomCode} state is ${room.state}, not waiting`);
            return { error: 'حالة الغرفة غير صالحة' };
        }
        if (!room.teams) {
            console.log(`Room ${roomCode} has no teams initialized`);
            return { error: 'هذا الوضع لا يدعم الفرق' };
        }

        const player = room.players.find(p => p.id === playerId);
        if (!player) {
            console.log(`Player ${playerId} not found in room ${roomCode}`);
            return { error: 'اللاعب غير موجود' };
        }

        // 1. Remove player from any previous spot
        room.teams.forEach(t => {
            t.spots.forEach((s, idx) => {
                if (s === playerId) t.spots[idx] = null;
            });
        });

        // 2. Validate new spot
        const team = room.teams[teamIndex];
        if (!team) return { error: 'الفريق غير موجود' };
        if (team.spots[spotIndex] !== null) return { error: 'هذا المكان مشغول' };

        // 3. Assign
        team.spots[spotIndex] = playerId;

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
                    const [p1Id, p2Id] = team.spots;
                    const p1 = room.players.find(p => p.id === p1Id);
                    const p2 = room.players.find(p => p.id === p2Id);

                    const teamId = `team_${tIdx}`;
                    if (p1) {
                        p1.teamId = teamId;
                        p1.teammateId = p2Id || null;
                    }
                    if (p2) {
                        p2.teamId = teamId;
                        p2.teammateId = p1Id || null;
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

        const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

        return {
            correctAnswer: currentQuestion.correctAnswer,
            scores: sortedPlayers,
            nextQuestionIndex: room.currentQuestionIndex + 1,
            totalQuestions: room.questions.length
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
            if (!p.isHost) {
                p.status = 'answering';
            }
        });

        if (room.currentQuestionIndex >= room.questions.length) {
            room.state = 'finished';
            return { gameOver: true, scores: room.players, winner: this.getWinner(room.players) };
        }

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

        // Standard 1-player logic
        const isCorrect = !currentQuestion.correctAnswer || cleanAnswer === currentQuestion.correctAnswer.toLowerCase();
        let points = isCorrect ? 1 : 0;
        player.score += points;

        return {
            isCorrect,
            points,
            player,
            correctAnswer: currentQuestion.correctAnswer || "إجابة مقبولة ✨"
        };
    }
    resetGame(roomCode) {
        const room = this.rooms[roomCode];
        if (!room) return false;

        room.state = 'waiting';
        room.questions = [];
        room.currentQuestionIndex = 0;
        room.scores = {};
        room.roundSubmissions = {};

        // Reset player scores and teams
        room.players.forEach(p => {
            p.score = 0;
            p.teamId = null;
            p.teammateId = null;
            p.status = 'active';
        });

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

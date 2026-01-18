const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Register a new player in the database
 * @param {string} deviceId - Unique device identifier
 * @param {string} nickname - Player's chosen name
 * @param {string} avatar - Player's emoji avatar
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function registerPlayer(deviceId, nickname, avatar) {
    try {
        const { data, error } = await supabase
            .from('players')
            .insert([
                {
                    device_id: deviceId,
                    nickname: nickname.trim(),
                    avatar,
                    last_seen: new Date().toISOString()
                }
            ])
            .select();

        if (error) {
            // Check if it's a unique constraint violation
            if (error.code === '23505') {
                if (error.message.includes('nickname')) {
                    return { success: false, error: '❌ هذا الاسم مستخدم بالفعل، اختر اسمًا آخر' };
                }
                return { success: false, error: '❌ هذا الجهاز مسجل بالفعل' };
            }
            console.error('Database error:', error);
            return { success: false, error: 'خطأ في قاعدة البيانات' };
        }

        console.log(`🔒 IDENTITY LOCKED for ${nickname} on Device ${deviceId}`);
        return { success: true, data: (data && data.length > 0) ? data[0] : { nickname, avatar, device_id: deviceId } };
    } catch (err) {
        console.error('registerPlayer error:', err);
        return { success: false, error: 'خطأ غير متوقع' };
    }
}

/**
 * Find a player by their device ID
 * @param {string} deviceId - Device identifier
 * @returns {Promise<{found: boolean, nickname?: string, avatar?: string}>}
 */
async function findPlayerByDevice(deviceId) {
    try {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('device_id', deviceId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No rows found
                return { found: false };
            }
            console.error('findPlayerByDevice error:', error);
            return { found: false };
        }

        // Update last_seen
        await supabase
            .from('players')
            .update({ last_seen: new Date().toISOString() })
            .eq('device_id', deviceId);

        console.log(`✅ Welcome back ${data.nickname} (Device: ${deviceId})`);
        return {
            found: true,
            nickname: data.nickname,
            avatar: data.avatar
        };
    } catch (err) {
        console.error('findPlayerByDevice error:', err);
        return { found: false };
    }
}

/**
 * Check if a nickname is already taken
 * @param {string} nickname - Nickname to check
 * @param {string} excludeDeviceId - Optional device ID to exclude (for updates)
 * @returns {Promise<boolean>} - true if taken, false if available
 */
async function isNicknameTaken(nickname, excludeDeviceId = null) {
    try {
        const nickLower = nickname.toLowerCase().trim();

        let query = supabase
            .from('players')
            .select('device_id', { count: 'exact', head: true })
            .ilike('nickname', nickLower);

        if (excludeDeviceId) {
            query = query.neq('device_id', excludeDeviceId);
        }

        const { count, error } = await query;

        if (error) {
            console.error('isNicknameTaken error:', error);
            return false; // Allow in case of error to avoid blocking
        }

        return count > 0;
    } catch (err) {
        console.error('isNicknameTaken error:', err);
        return false;
    }
}

/**
 * Get all registered players
 * @returns {Promise<Array>}
 */
async function getAllPlayers() {
    try {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('getAllPlayers error:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('getAllPlayers error:', err);
        return [];
    }
}

/**
 * Update player's last seen timestamp
 * @param {string} deviceId - Device identifier
 */
async function updateLastSeen(deviceId) {
    try {
        await supabase
            .from('players')
            .update({ last_seen: new Date().toISOString() })
            .eq('device_id', deviceId);
    } catch (err) {
        console.error('updateLastSeen error:', err);
    }
}

/**
 * Get player count
 * @returns {Promise<number>}
 */
async function getPlayerCount() {
    try {
        const { count, error } = await supabase
            .from('players')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error('getPlayerCount error:', error);
            return 0;
        }

        return count || 0;
    } catch (err) {
        console.error('getPlayerCount error:', err);
        return 0;
    }
}

/**
 * Get overall system stats
 */
async function getSystemStats() {
    try {
        const { data: players, error: pError } = await supabase
            .from('players')
            .select('total_questions');

        const playerCount = players?.length || 0;
        const totalQuestions = players?.reduce((sum, p) => sum + (p.total_questions || 0), 0) || 0;

        return {
            playerCount,
            totalQuestions: totalQuestions + 100 // Base questions + player answers
        };
    } catch (err) {
        console.error('getSystemStats error:', err);
        return { playerCount: 0, totalQuestions: 100 };
    }
}

// ===== CHAT MESSAGE FUNCTIONS =====

/**
 * Save a chat message to the database
 * @param {string} roomCode - Room identifier
 * @param {string} nickname - Sender's nickname
 * @param {string} message - Message text
 * @param {string} deviceId - Optional device ID
 * @param {string} type - Message type ('user', 'system', 'admin')
 * @returns {Promise<{success: boolean, messageId?: number}>}
 */
async function saveMessage(roomCode, nickname, message, deviceId = null, type = 'user') {
    try {
        const { data, error } = await supabase
            .from('chat_messages')
            .insert([
                {
                    room_code: roomCode,
                    sender_nickname: nickname,
                    sender_device_id: deviceId,
                    message_text: message,
                    message_type: type
                }
            ])
            .select('id');

        if (error) {
            console.error('saveMessage error:', error);
            return { success: false };
        }

        return { success: true, messageId: data[0]?.id };
    } catch (err) {
        console.error('saveMessage error:', err);
        return { success: false };
    }
}

/**
 * Get messages for a specific room
 * @param {string} roomCode - Room identifier
 * @param {number} limit - Maximum number of messages to retrieve
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>}
 */
async function getRoomMessages(roomCode, limit = 50, offset = 0) {
    try {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('room_code', roomCode)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('getRoomMessages error:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('getRoomMessages error:', err);
        return [];
    }
}

/**
 * Delete a message by ID (for moderation)
 * @param {number} messageId - Message ID to delete
 * @returns {Promise<boolean>}
 */
async function deleteMessage(messageId) {
    try {
        const { error } = await supabase
            .from('chat_messages')
            .delete()
            .eq('id', messageId);

        if (error) {
            console.error('deleteMessage error:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('deleteMessage error:', err);
        return false;
    }
}

/**
 * Get message count for a room
 * @param {string} roomCode - Room identifier
 * @returns {Promise<number>}
 */
async function getRoomMessageCount(roomCode) {
    try {
        const { count, error } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_code', roomCode);

        if (error) {
            console.error('getRoomMessageCount error:', error);
            return 0;
        }

        return count || 0;
    } catch (err) {
        console.error('getRoomMessageCount error:', err);
        return 0;
    }
}

/**
 * Update player statistics and XP
 * @param {string} deviceId - Player's device ID
 * @param {object} stats - { points, isWin, correctAnswers, totalQuestions, packName }
 */
async function updatePlayerStats(deviceId, { points, isWin, correctAnswers, totalQuestions, packName }) {
    try {
        // 1. Fetch current stats
        const { data: player, error: fetchError } = await supabase
            .from('players')
            .select('*')
            .eq('device_id', deviceId)
            .single();

        if (fetchError) throw fetchError;

        // 2. Calculate new values
        const newTotalPoints = (player.total_points || 0) + points;
        const newTotalGames = (player.total_games || 0) + 1;
        const newTotalWins = (player.total_wins || 0) + (isWin ? 1 : 0);
        const newTotalCorrect = (player.total_correct || 0) + correctAnswers;
        const newTotalQuestions = (player.total_questions || 0) + totalQuestions;

        // XP Calculation: Points (100 each) + Bonus for winning (250) + Participation (50)
        const xpGained = (points * 100) + (isWin ? 250 : 0) + 50;
        const newXp = (player.xp || 0) + xpGained;

        // Level Calculation: Simple linear (Level 1: 0, Level 2: 1000, Level 3: 2000...)
        const newLevel = Math.floor(newXp / 1000) + 1;

        // History: Store last 10 games
        let history = player.game_history || [];
        const newEntry = {
            id: Date.now(),
            date: "اليوم",
            pack: packName,
            rank: isWin ? 1 : 0, // Simplified: 1 for win, 0 for loss/other (could be actual rank)
            score: points * 100, // Display points as score
            timestamp: new Date().toISOString()
        };
        history = [newEntry, ...history].slice(0, 10);

        // 3. Update database
        const { error: updateError } = await supabase
            .from('players')
            .update({
                total_points: newTotalPoints,
                total_games: newTotalGames,
                total_wins: newTotalWins,
                total_correct: newTotalCorrect,
                total_questions: newTotalQuestions,
                xp: newXp,
                level: newLevel,
                game_history: history,
                last_seen: new Date().toISOString()
            })
            .eq('device_id', deviceId);

        if (updateError) throw updateError;

        console.log(`📈 SUCCESS: Stats updated for ${player.nickname} (Device: ${deviceId})`);
        console.log(`📊 New Level: ${newLevel}, Total Points: ${newTotalPoints}`);
        return { success: true };
    } catch (err) {
        console.error('updatePlayerStats error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get full player stats for profile
 * @param {string} deviceId 
 */
async function getPlayerStats(deviceId) {
    try {
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('device_id', deviceId)
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('getPlayerStats error:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    supabase,
    registerPlayer,
    findPlayerByDevice,
    isNicknameTaken,
    getAllPlayers,
    updateLastSeen,
    getPlayerCount,
    getSystemStats,
    updatePlayerStats,
    getPlayerStats,
    // Chat functions
    saveMessage,
    getRoomMessages,
    deleteMessage,
    getRoomMessageCount
};

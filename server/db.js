const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'quizroom.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database.');
        initDB();
    }
});

function initDB() {
    db.serialize(() => {
        // Players table
        db.run(`CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            device_id TEXT,
            nickname TEXT,
            avatar TEXT,
            last_seen TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_anonymous BOOLEAN DEFAULT 1,
            UNIQUE(device_id)
        )`);

        // Rooms table
        db.run(`CREATE TABLE IF NOT EXISTS rooms (
            room_code TEXT PRIMARY KEY,
            host_id TEXT,
            state TEXT DEFAULT 'waiting',
            settings TEXT,
            pack_data TEXT,
            current_question_index INTEGER DEFAULT 0,
            updated_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        // Room Players table
        db.run(`CREATE TABLE IF NOT EXISTS room_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT,
            player_id TEXT,
            is_ready BOOLEAN DEFAULT 0,
            is_host BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'active',
            score INTEGER DEFAULT 0,
            last_answer TEXT,
            is_correct BOOLEAN,
            team_index INTEGER,
            spot_index INTEGER,
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(room_code, player_id)
        )`);

        // Custom Packs table
        db.run(`CREATE TABLE IF NOT EXISTS custom_packs (
            id TEXT PRIMARY KEY,
            title TEXT,
            description TEXT,
            category TEXT,
            difficulty TEXT,
            icon TEXT,
            data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        // Chat Messages table
        db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code TEXT,
            sender_id TEXT,
            sender_name TEXT,
            sender_avatar TEXT,
            content TEXT,
            type TEXT DEFAULT 'text',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        // Friends table
        db.run(`CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            friend_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, friend_id)
        )`);

        console.log('Database tables initialized.');
    });
}

// Utility wrapper for promises
const dbHelper = {
    all: (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    }),
    get: (sql, params = []) => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    }),
    run: (sql, params = []) => new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    })
};

module.exports = { db, dbHelper };

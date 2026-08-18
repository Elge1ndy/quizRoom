const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { dbHelper } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// A very basic query builder for the Mock Supabase Client
app.post('/api/supabase', async (req, res) => {
    try {
        const { table, action, data, select, filters, single } = req.body;
        
        let sql = '';
        let params = [];
        
        // Helper to build WHERE clause from filters
        const buildWhere = () => {
            if (!filters || filters.length === 0) return '';
            const clauses = filters.map(f => {
                if (f.type === 'eq') {
                    params.push(f.value);
                    return `${f.column} = ?`;
                }
                if (f.type === 'neq') {
                    params.push(f.value);
                    return `${f.column} != ?`;
                }
                if (f.type === 'in') {
                    const placeholders = f.value.map(() => '?').join(',');
                    params.push(...f.value);
                    return `${f.column} IN (${placeholders})`;
                }
                if (f.type === 'is') {
                    if (f.value === null) return `${f.column} IS NULL`;
                    if (f.value === true) return `${f.column} IS TRUE`;
                    if (f.value === false) return `${f.column} IS FALSE`;
                    params.push(f.value);
                    return `${f.column} IS ?`;
                }
                if (f.type === 'not') {
                    // Handle .not('column', 'is', null) style filters
                    if (f.op === 'is' && f.value === null) {
                        return `${f.column} IS NOT NULL`;
                    }
                    params.push(f.value);
                    return `${f.column} != ?`;
                }
                if (f.type === 'match') {
                    const keys = Object.keys(f.value);
                    return keys.map(k => {
                        params.push(f.value[k]);
                        return `${k} = ?`;
                    }).join(' AND ');
                }
                return '1=1';
            });
            return ' WHERE ' + clauses.join(' AND ');
        };

        // Helper: parse Supabase-style select and extract relations
        // e.g. "*, room_players(*)" => { cols: "*", relations: [{name: "room_players", select: "*"}] }
        // e.g. "*, room_players(count)" => { cols: "*", relations: [{name: "room_players", select: "count"}] }
        // e.g. "*, players(nickname, avatar)" => { cols: "*", relations: [{name: "players", select: "nickname, avatar"}] }
        const parseSelect = (selectStr) => {
            if (!selectStr || selectStr === '*') return { cols: '*', relations: [] };
            
            const relations = [];
            // Match patterns like: tableName(columns) or tableName!fk(columns)
            const cleaned = selectStr.replace(/(\w+)(?:!\w+)?\(([^)]*)\)/g, (match, relName, relCols) => {
                relations.push({ name: relName, select: relCols.trim() });
                return ''; // Remove from the main select
            });
            
            // Clean up remaining commas and whitespace
            let cols = cleaned.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
            if (!cols) cols = '*';
            
            return { cols, relations };
        };

        // Helper: parse JSON columns safely
        const parseJsonCols = (row) => {
            if (!row) return row;
            try { if (row.settings && typeof row.settings === 'string') row.settings = JSON.parse(row.settings); } catch(e) {}
            try { if (row.pack_data && typeof row.pack_data === 'string') row.pack_data = JSON.parse(row.pack_data); } catch(e) {}
            try { if (row.data && typeof row.data === 'string') row.data = JSON.parse(row.data); } catch(e) {}
            return row;
        };

        // Helper: resolve relations by doing separate queries
        const resolveRelations = async (rows, relations, parentTable) => {
            if (!relations || relations.length === 0) return rows;

            for (const rel of relations) {
                // Determine the foreign key based on common patterns
                let fk, pk;
                
                if (parentTable === 'rooms' && rel.name === 'room_players') {
                    fk = 'room_code'; pk = 'room_code';
                } else if (parentTable === 'room_players' && rel.name === 'players') {
                    fk = 'player_id'; pk = 'device_id';
                } else if (parentTable === 'friends' && rel.name === 'players') {
                    fk = 'friend_id'; pk = 'device_id';
                } else {
                    // Generic: try table_id or id
                    fk = `${rel.name.replace(/s$/, '')}_id`;
                    pk = 'id';
                }

                for (let row of rows) {
                    const parentValue = row[fk];
                    if (parentValue === undefined) {
                        row[rel.name] = rel.select === 'count' ? [{ count: 0 }] : [];
                        continue;
                    }

                    if (rel.select === 'count') {
                        const countResult = await dbHelper.all(
                            `SELECT COUNT(*) as count FROM ${rel.name} WHERE ${pk} = ?`,
                            [parentValue]
                        );
                        row[rel.name] = [{ count: countResult[0]?.count || 0 }];
                    } else {
                        const relCols = (rel.select === '*' || !rel.select) ? '*' : rel.select;
                        const relRows = await dbHelper.all(
                            `SELECT ${relCols} FROM ${rel.name} WHERE ${pk} = ?`,
                            [parentValue]
                        );
                        row[rel.name] = relRows.map(parseJsonCols);
                    }
                }
            }
            return rows;
        };

        if (action === 'select') {
            const { cols, relations } = parseSelect(select);
            const isCountQuery = select === 'count' || (cols === 'COUNT(*) as count');
            
            let selectCols = isCountQuery ? 'COUNT(*) as count' : cols;
            
            sql = `SELECT ${selectCols} FROM ${table}`;
            sql += buildWhere();
            
            if (req.body.order) {
                sql += ` ORDER BY ${req.body.order.column} ${req.body.order.ascending ? 'ASC' : 'DESC'}`;
            }
            if (req.body.limit) {
                sql += ` LIMIT ${req.body.limit}`;
            }

            let result = await dbHelper.all(sql, params);
            result = result.map(parseJsonCols);

            // Resolve relations (e.g., room_players(*), players(*))
            if (relations.length > 0) {
                result = await resolveRelations(result, relations, table);
            }

            if (isCountQuery) {
                return res.json({ data: result, count: result[0]?.count || 0, error: null });
            }

            if (single) {
                const isMaybe = req.body.maybeSingle;
                if (result.length === 0) {
                    return res.json({ data: null, error: isMaybe ? null : { message: 'Not found', code: 'PGRST116' } });
                }
                return res.json({ data: result[0], error: null });
            }
            return res.json({ data: result, error: null });
            
        } else if (action === 'insert') {
            const isArray = Array.isArray(data);
            const items = isArray ? data : [data];
            let lastInserted = [];
            
            for (let item of items) {
                const processedItem = { ...item };
                if (processedItem.settings && typeof processedItem.settings === 'object') processedItem.settings = JSON.stringify(processedItem.settings);
                if (processedItem.pack_data && typeof processedItem.pack_data === 'object') processedItem.pack_data = JSON.stringify(processedItem.pack_data);
                if (processedItem.data && typeof processedItem.data === 'object') processedItem.data = JSON.stringify(processedItem.data);

                const keys = Object.keys(processedItem);
                const values = keys.map(k => processedItem[k]);
                const placeholders = keys.map(() => '?').join(',');
                
                sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
                await dbHelper.run(sql, values);
                lastInserted.push(item);
            }
            
            if (single || !isArray) {
                return res.json({ data: lastInserted[0], error: null });
            }
            return res.json({ data: lastInserted, error: null });

        } else if (action === 'update') {
            const processedItem = { ...data };
            if (processedItem.settings && typeof processedItem.settings === 'object') processedItem.settings = JSON.stringify(processedItem.settings);
            if (processedItem.pack_data && typeof processedItem.pack_data === 'object') processedItem.pack_data = JSON.stringify(processedItem.pack_data);
            if (processedItem.data && typeof processedItem.data === 'object') processedItem.data = JSON.stringify(processedItem.data);

            const keys = Object.keys(processedItem);
            if (keys.length === 0) {
                return res.json({ data: null, error: null });
            }
            
            const setClause = keys.map(k => {
                params.push(processedItem[k]);
                return `${k} = ?`;
            }).join(', ');
            
            sql = `UPDATE ${table} SET ${setClause}`;
            sql += buildWhere();
            
            await dbHelper.run(sql, params);
            return res.json({ data: null, error: null });

        } else if (action === 'delete') {
            sql = `DELETE FROM ${table}`;
            sql += buildWhere();
            await dbHelper.run(sql, params);
            return res.json({ data: null, error: null });

        } else if (action === 'upsert') {
            const items = Array.isArray(data) ? data : [data];
            let lastInserted = [];
            
            for (let item of items) {
                const processedItem = { ...item };
                if (processedItem.settings && typeof processedItem.settings === 'object') processedItem.settings = JSON.stringify(processedItem.settings);
                if (processedItem.pack_data && typeof processedItem.pack_data === 'object') processedItem.pack_data = JSON.stringify(processedItem.pack_data);
                if (processedItem.data && typeof processedItem.data === 'object') processedItem.data = JSON.stringify(processedItem.data);

                const keys = Object.keys(processedItem);
                const values = keys.map(k => processedItem[k]);
                const placeholders = keys.map(() => '?').join(',');
                
                sql = `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
                await dbHelper.run(sql, values);
                lastInserted.push(item);
            }
            
            if (single || !Array.isArray(data)) {
                return res.json({ data: lastInserted[0], error: null });
            }
            return res.json({ data: lastInserted, error: null });
        }

        res.status(400).json({ error: { message: 'Unknown action' } });
    } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: { message: err.message, code: err.code } });
    }
});


// Track global presences to avoid overwriting state on join
const roomPresences = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Channel handling
    socket.on('join_channel', (channelName, presenceData) => {
        socket.join(channelName);
        console.log(`Socket ${socket.id} joined channel ${channelName}`);
        
        // Presence track
        if (presenceData) {
            socket.presenceData = presenceData;
            socket.channelName = channelName;
            
            if (!roomPresences[channelName]) roomPresences[channelName] = {};
            roomPresences[channelName][socket.id] = [presenceData];

            // Send full sync to the joined socket only
            socket.emit('presence_sync', roomPresences[channelName]);
            
            // Notify others in the room
            socket.to(channelName).emit('presence_join', {
                key: socket.id,
                newPresences: [presenceData]
            });
        }
    });

    socket.on('leave_channel', (channelName) => {
        socket.leave(channelName);
        console.log(`Socket ${socket.id} left channel ${channelName}`);
        if (socket.presenceData) {
            if (roomPresences[channelName]) {
                delete roomPresences[channelName][socket.id];
            }
            socket.to(channelName).emit('presence_leave', {
                key: socket.id,
                leftPresences: [socket.presenceData]
            });
        }
    });

    // Broadcast handling
    socket.on('broadcast', (channelName, payload) => {
        // payload should have { type, event, payload }
        socket.to(channelName).emit('broadcast', payload);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.presenceData && socket.channelName) {
            const channelName = socket.channelName;
            if (roomPresences[channelName]) {
                delete roomPresences[channelName][socket.id];
            }
            io.to(channelName).emit('presence_leave', {
                key: socket.id,
                leftPresences: [socket.presenceData]
            });
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});

-- FIX: Make sure the creator of the room is marked as host in room_players
-- Replace 'ROOM_CODE_HERE' with your actual room code
-- Replace 'DEVICE_ID_HERE' with your device ID (found in localStorage or console)

UPDATE room_players
SET is_host = true
WHERE room_code = 'ROOM_CODE_HERE' AND player_id = 'DEVICE_ID_HERE';

-- OR, a smarter query to automatically fix all rooms based on the rooms table (host_id):

UPDATE room_players
SET is_host = true
FROM rooms
WHERE room_players.room_code = rooms.room_code
AND room_players.player_id = rooms.host_id;

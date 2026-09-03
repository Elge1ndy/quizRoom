-- ============================================
-- QuizRoom Migration 004: Auto-cleanup empty rooms
-- Date: 2026-08-18
-- Run in: Supabase SQL Editor
-- ============================================

-- 1. Add last_activity_at column
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Create function to delete inactive empty rooms (30 min timeout)
CREATE OR REPLACE FUNCTION cleanup_empty_rooms()
RETURNS void AS $$
BEGIN
  -- Delete rooms with no players that have been inactive for 30 minutes
  DELETE FROM rooms
  WHERE room_code IN (
    SELECT r.room_code
    FROM rooms r
    LEFT JOIN room_players rp ON r.room_code = rp.room_code
    WHERE rp.room_code IS NULL
      AND r.last_activity_at < NOW() - INTERVAL '30 minutes'
  );

  -- Also delete rooms with state 'waiting' and no players (stale rooms)
  DELETE FROM rooms
  WHERE state = 'waiting'
    AND room_code IN (
      SELECT r.room_code
      FROM rooms r
      LEFT JOIN room_players rp ON r.room_code = rp.room_code
      WHERE rp.room_code IS NULL
    )
    AND last_activity_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- 3. Create function to update room activity
CREATE OR REPLACE FUNCTION update_room_activity(p_room_code TEXT)
RETURNS void AS $$
BEGIN
  UPDATE rooms SET last_activity_at = NOW() WHERE room_code = p_room_code;
END;
$$ LANGUAGE plpgsql;

-- 4. Enable pg_cron extension (if available)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available, using manual cleanup';
END $$;

-- 5. Schedule cleanup every 5 minutes (if pg_cron is available)
DO $$
BEGIN
  PERFORM cron.schedule(
    'cleanup-empty-rooms',
    '*/5 * * * *',
    'SELECT cleanup_empty_rooms()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule cron job, cleanup will be triggered by clients';
END $$;

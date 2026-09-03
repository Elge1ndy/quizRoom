-- ============================================
-- QuizRoom: FIX ALL MISSING TABLES & COLUMNS
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================

-- 1. Ensure answers table exists
CREATE TABLE IF NOT EXISTS answers (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT REFERENCES rooms(room_code) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(device_id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  answer TEXT,
  is_correct BOOLEAN,
  points INTEGER DEFAULT 0,
  speed_bonus BOOLEAN DEFAULT FALSE,
  combo_bonus BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_code, player_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_answers_room_code ON answers(room_code);
CREATE INDEX IF NOT EXISTS idx_answers_room_question ON answers(room_code, question_index);

-- 2. Ensure has_answered column exists in room_players
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS has_answered BOOLEAN DEFAULT FALSE;

-- 3. Ensure consecutive_correct column exists in room_players
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS consecutive_correct INTEGER DEFAULT 0;

-- 4. Ensure timer_end_at column exists in rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS timer_end_at TIMESTAMPTZ;

-- 5. Ensure last_activity_at column exists in rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- 6. Enable RLS on answers
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for answers (drop first to avoid duplicates)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can view answers" ON answers;
  DROP POLICY IF EXISTS "Authenticated can submit answers" ON answers;
  DROP POLICY IF EXISTS "Player can update own answer" ON answers;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Anyone can view answers" ON answers FOR SELECT USING (true);
CREATE POLICY "Authenticated can submit answers" ON answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Player can update own answer" ON answers FOR UPDATE USING (true);

-- 8. Enable Realtime for answers and friends
ALTER PUBLICATION supabase_realtime ADD TABLE answers;
ALTER TABLE answers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;

-- 9. Ensure all other tables have REPLICA IDENTITY FULL
ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE room_players REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
ALTER TABLE friends REPLICA IDENTITY FULL;
ALTER TABLE custom_packs REPLICA IDENTITY FULL;

-- Done!

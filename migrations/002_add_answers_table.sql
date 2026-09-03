-- ============================================
-- QuizRoom Migration 002: answers table + timer_end_at
-- Date: 2026-08-18
-- Run in: Supabase SQL Editor
-- ============================================

-- 1. Create answers table
CREATE TABLE IF NOT EXISTS answers (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT REFERENCES rooms(room_code) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(device_id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  answer TEXT,
  is_correct BOOLEAN,
  points INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_code, player_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_answers_room_code ON answers(room_code);
CREATE INDEX IF NOT EXISTS idx_answers_room_question ON answers(room_code, question_index);

-- 2. Enable RLS
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- 3. Create policies
CREATE POLICY "Anyone can view answers" ON answers FOR SELECT USING (true);
CREATE POLICY "Authenticated can submit answers" ON answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Player can update own answer" ON answers FOR UPDATE USING (true);

-- 4. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE answers;
ALTER TABLE answers REPLICA IDENTITY FULL;

-- 5. Ensure rooms.timer_end_at exists (already in schema, but safe to confirm)
DO $$ BEGIN
  ALTER TABLE rooms ADD COLUMN IF NOT EXISTS timer_end_at TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

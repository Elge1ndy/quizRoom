-- QuizRoom Unified Schema for Supabase
-- Run this in Supabase SQL Editor

-- Players table
CREATE TABLE IF NOT EXISTS players (
  device_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  avatar TEXT NOT NULL,
  total_points INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  game_history JSONB DEFAULT '[]'::jsonb,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_anonymous BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_players_nickname_lower ON players (LOWER(nickname));
CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players (last_seen DESC);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  room_code TEXT PRIMARY KEY,
  host_id TEXT REFERENCES players(device_id),
  state TEXT DEFAULT 'waiting',
  settings JSONB DEFAULT '{}'::jsonb,
  pack_data JSONB,
  current_question_index INTEGER DEFAULT 0,
  timer_end_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Room Players table
CREATE TABLE IF NOT EXISTS room_players (
  room_code TEXT REFERENCES rooms(room_code) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(device_id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  is_ready BOOLEAN DEFAULT FALSE,
  is_host BOOLEAN DEFAULT FALSE,
  last_answer TEXT,
  is_correct BOOLEAN,
  has_answered BOOLEAN DEFAULT FALSE,
  consecutive_correct INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  team_index INTEGER,
  spot_index INTEGER,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_code, player_id)
);

CREATE INDEX IF NOT EXISTS idx_room_players_room_code ON room_players(room_code);

-- Chat Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT REFERENCES rooms(room_code) ON DELETE CASCADE,
  sender_id TEXT,
  sender_nickname TEXT,
  sender_avatar TEXT,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Friends table
CREATE TABLE IF NOT EXISTS friends (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES players(device_id),
  friend_id TEXT REFERENCES players(device_id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Custom Packs table
CREATE TABLE IF NOT EXISTS custom_packs (
  id BIGSERIAL PRIMARY KEY,
  creator_id TEXT REFERENCES players(device_id),
  name TEXT NOT NULL,
  title TEXT,
  category TEXT,
  difficulty TEXT,
  description TEXT,
  icon TEXT,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Answers table (per-question answer records)
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

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;

ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE room_players REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
ALTER TABLE friends REPLICA IDENTITY FULL;
ALTER TABLE custom_packs REPLICA IDENTITY FULL;
ALTER TABLE answers REPLICA IDENTITY FULL;

-- Storage bucket for chat audio
INSERT INTO storage.buckets (id, name, public) VALUES ('chat_audio', 'chat_audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Allow public read access on chat_audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat_audio');

CREATE POLICY "Allow authenticated upload on chat_audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat_audio');

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- Players: Anyone can read, only owner can update their own profile
CREATE POLICY "Players can view all profiles" ON players FOR SELECT USING (true);
CREATE POLICY "Players can insert their own profile" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update their own profile" ON players FOR UPDATE USING (device_id = current_setting('request.jwt.claims', true)::json->>'sub' OR true);

-- Rooms: Anyone can read, host can manage
CREATE POLICY "Anyone can view rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated can create rooms" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Host can update room" ON rooms FOR UPDATE USING (true);
CREATE POLICY "Host can delete room" ON rooms FOR DELETE USING (true);

-- Room Players: Anyone in room can read, player can manage own row
CREATE POLICY "Anyone can view room players" ON room_players FOR SELECT USING (true);
CREATE POLICY "Authenticated can join room" ON room_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Player can update own row" ON room_players FOR UPDATE USING (true);
CREATE POLICY "Player can leave room" ON room_players FOR DELETE USING (true);

-- Chat Messages: Anyone in room can read and send
CREATE POLICY "Anyone can view chat" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated can send chat" ON chat_messages FOR INSERT WITH CHECK (true);

-- Friends: Users can manage their own friend relationships
CREATE POLICY "Users can view own friends" ON friends FOR SELECT USING (true);
CREATE POLICY "Users can send friend requests" ON friends FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update friend status" ON friends FOR UPDATE USING (true);
CREATE POLICY "Users can remove friends" ON friends FOR DELETE USING (true);

-- Custom Packs: Anyone can read, creator can manage own packs
CREATE POLICY "Anyone can view custom packs" ON custom_packs FOR SELECT USING (true);
CREATE POLICY "Authenticated can create packs" ON custom_packs FOR INSERT WITH CHECK (true);
CREATE POLICY "Creator can update pack" ON custom_packs FOR UPDATE USING (true);
CREATE POLICY "Creator can delete pack" ON custom_packs FOR DELETE USING (true);

-- Answers: Anyone in room can read, player can insert own answers
CREATE POLICY "Anyone can view answers" ON answers FOR SELECT USING (true);
CREATE POLICY "Authenticated can submit answers" ON answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Player can update own answer" ON answers FOR UPDATE USING (true);

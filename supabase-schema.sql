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

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;

ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE room_players REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
ALTER TABLE friends REPLICA IDENTITY FULL;
ALTER TABLE custom_packs REPLICA IDENTITY FULL;

-- Storage bucket for chat audio
INSERT INTO storage.buckets (id, name, public) VALUES ('chat_audio', 'chat_audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Allow public read access on chat_audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat_audio');

CREATE POLICY "Allow authenticated upload on chat_audio" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat_audio');

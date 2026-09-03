-- ============================================
-- QuizRoom Migration: Add has_answered column
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Add has_answered column to room_players
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS has_answered BOOLEAN DEFAULT FALSE;

-- Step 2: Enable RLS on all tables (safe to re-run)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_packs ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Players can view all profiles" ON players;
DROP POLICY IF EXISTS "Players can insert their own profile" ON players;
DROP POLICY IF EXISTS "Players can update their own profile" ON players;
DROP POLICY IF EXISTS "Anyone can view rooms" ON rooms;
DROP POLICY IF EXISTS "Authenticated can create rooms" ON rooms;
DROP POLICY IF EXISTS "Host can update room" ON rooms;
DROP POLICY IF EXISTS "Host can delete room" ON rooms;
DROP POLICY IF EXISTS "Anyone can view room players" ON room_players;
DROP POLICY IF EXISTS "Authenticated can join room" ON room_players;
DROP POLICY IF EXISTS "Player can update own row" ON room_players;
DROP POLICY IF EXISTS "Player can leave room" ON room_players;
DROP POLICY IF EXISTS "Anyone can view chat" ON chat_messages;
DROP POLICY IF EXISTS "Authenticated can send chat" ON chat_messages;
DROP POLICY IF EXISTS "Users can view own friends" ON friends;
DROP POLICY IF EXISTS "Users can send friend requests" ON friends;
DROP POLICY IF EXISTS "Users can update friend status" ON friends;
DROP POLICY IF EXISTS "Users can remove friends" ON friends;
DROP POLICY IF EXISTS "Anyone can view custom packs" ON custom_packs;
DROP POLICY IF EXISTS "Authenticated can create packs" ON custom_packs;
DROP POLICY IF EXISTS "Creator can update pack" ON custom_packs;
DROP POLICY IF EXISTS "Creator can delete pack" ON custom_packs;

-- Step 4: Create RLS Policies (permissive for anonymous auth)
-- Players
CREATE POLICY "Players can view all profiles" ON players FOR SELECT USING (true);
CREATE POLICY "Players can insert their own profile" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update their own profile" ON players FOR UPDATE USING (true);

-- Rooms
CREATE POLICY "Anyone can view rooms" ON rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated can create rooms" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Host can update room" ON rooms FOR UPDATE USING (true);
CREATE POLICY "Host can delete room" ON rooms FOR DELETE USING (true);

-- Room Players
CREATE POLICY "Anyone can view room players" ON room_players FOR SELECT USING (true);
CREATE POLICY "Authenticated can join room" ON room_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Player can update own row" ON room_players FOR UPDATE USING (true);
CREATE POLICY "Player can leave room" ON room_players FOR DELETE USING (true);

-- Chat Messages
CREATE POLICY "Anyone can view chat" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated can send chat" ON chat_messages FOR INSERT WITH CHECK (true);

-- Friends
CREATE POLICY "Users can view own friends" ON friends FOR SELECT USING (true);
CREATE POLICY "Users can send friend requests" ON friends FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update friend status" ON friends FOR UPDATE USING (true);
CREATE POLICY "Users can remove friends" ON friends FOR DELETE USING (true);

-- Custom Packs
CREATE POLICY "Anyone can view custom packs" ON custom_packs FOR SELECT USING (true);
CREATE POLICY "Authenticated can create packs" ON custom_packs FOR INSERT WITH CHECK (true);
CREATE POLICY "Creator can update pack" ON custom_packs FOR UPDATE USING (true);
CREATE POLICY "Creator can delete pack" ON custom_packs FOR DELETE USING (true);

-- Step 5: Ensure Storage bucket exists
INSERT INTO storage.buckets (id, name, public) VALUES ('chat_audio', 'chat_audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (safe to re-run)
DROP POLICY IF EXISTS "Allow public read access on chat_audio" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload on chat_audio" ON storage.objects;
CREATE POLICY "Allow public read access on chat_audio" ON storage.objects FOR SELECT USING (bucket_id = 'chat_audio');
CREATE POLICY "Allow authenticated upload on chat_audio" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat_audio');

-- Done! ✅

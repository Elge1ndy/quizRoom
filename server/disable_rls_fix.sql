-- RUN THIS IN SUPABASE SQL EDITOR TO FIX "ROOM CREATION FAILED"

-- Disable RLS on all tables to ensure the app can write data
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE friends DISABLE ROW LEVEL SECURITY;
ALTER TABLE custom_packs DISABLE ROW LEVEL SECURITY;

-- Optional: If you want to keep RLS enabled but allow everyone to do everything (useful for testing)
/*
CREATE POLICY "Allow all" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON room_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON friends FOR ALL USING (true) WITH CHECK (true);
*/

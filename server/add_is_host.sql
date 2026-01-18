-- Add is_host column to room_players table
ALTER TABLE room_players 
ADD COLUMN IF NOT EXISTS is_host BOOLEAN DEFAULT false;

-- Notify Supabase to refresh schema cache (usually happens automatically after DDL)
NOTIFY pgrst, 'reload schema';

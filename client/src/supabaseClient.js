import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nqzuuhlwggiuxoyuiznm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fg2qwm_kHPrZqzxB3SJYIA_Hm8IkwFT';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

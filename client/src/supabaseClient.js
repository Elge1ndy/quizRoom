import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zoqkrhtnohjqglaaibhj.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_O5aXLjvCvajzTedOWRZtbA_xrsyoiIN';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key missing in .env');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
            params: {
                eventsPerSecond: 10,
            },
        },
    })
    : null;

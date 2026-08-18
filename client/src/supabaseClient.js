import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nqzuuhlwggiuxoyuiznm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xenV1aGx3Z2dpdXhveXVpem5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0Mjg5ODEsImV4cCI6MjA4NzAwNDk4MX0.bH6Lb6ENJoyqilsZcpqyiCxzI8eJS9Qaos5-fAHdQrg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

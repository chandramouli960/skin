// Supabase initialization
// Get your credentials from: https://app.supabase.com > Project Settings > API

const SUPABASE_URL = 'https://gjuqohgorthzgcitjrqh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdXFvaGdvcnRoemdjaXRqcnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MTkzNjAsImV4cCI6MjA4MDA5NTM2MH0.iEQOiTn-T3uClSYkoV5EvNXaEkMbYwBhbzGiGxCPB1o';

// Initialize Supabase client (supabase is loaded from CDN in index.html)
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Make available globally
window.supabaseClient = supabase;


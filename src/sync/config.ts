// Public connection details for the sync server. These are safe to ship:
// access is enforced by row-level security, and all writing is end-to-end encrypted.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://yikoymzktspamahrsuje.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_EFFBohd3yBtaJcghjbWR4w_HaDrgm22';

/**
 * Which Supabase project the app uses. Both values are public by design: the publishable key can only do what
 * row-level security and the server functions allow. Kept apart from cloud.ts so vite.config.ts can read the URL
 * for the Content Security Policy without loading the Supabase client.
 */
export const SUPABASE_URL = 'https://iaesqhisslztykbglcck.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CNFrds5IHwjo7O5pZ-x7GQ_rcpzng24';

// ============================================================
//  Salamander Digital Museum — configuration
//  The anon key is PUBLIC by design (security comes from the
//  Row Level Security policies in supabase/schema.sql).
//  NEVER put the Supabase "service_role" key in this file.
// ============================================================
export const CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',

  // The real, final public address of the website (used inside QR codes).
  // Example: 'https://museum.yourdomain.com'
  // Leave empty to use the address the site is currently opened on.
  SITE_URL: '',

  CONTACT_EMAIL: 'museum@example.com',

  BUCKET: 'museum',
  MAX_FILE_MB: 50, // Supabase free plan allows up to 50 MB per file
};

// ============================================================
//  Salamander Digital Museum — configuration
//  The anon key is PUBLIC by design (security comes from the
//  Row Level Security policies in supabase/schema.sql).
//  NEVER put the Supabase "service_role" key in this file.
// ============================================================
SUPABASE_URL: 'https://eecnssmnoqxnzherchak.supabase.co',
  SUPABASE_ANON_KEY:'sb_publishable_L2uRJBM95Bpn7ZDop7NgJA_mk81KKoz

  // The real, final public address of the website (used inside QR codes).
  // Example: 'https://museum.yourdomain.com'
  // Leave empty to use the address the site is currently opened on.
  SITE_URL: '',

  CONTACT_EMAIL: 'museum@example.com',

  BUCKET: 'museum',
  MAX_FILE_MB: 50, // Supabase free plan allows up to 50 MB per file
};

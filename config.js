// Shared app config. Public values only — the anon key is safe in client code.
// Real access control lives in Postgres RLS (see schema.sql).
window.SHARED_CONFIG = {
  SUPABASE_URL: 'https://igaulapupbtdcqqjobhs.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7yi3BNg-J-K5nralw5JSww_c71Pge6e',

  // Friendly gate only — the database enforces the real list (shared_members table).
  ALLOWED_EMAILS: [
    'asittley@gmail.com',
    'jilllechien@gmail.com',
  ],

  // Display names, so items read "Added by Jill" instead of the raw address.
  NAMES: {
    'asittley@gmail.com': 'Drew',
    'jilllechien@gmail.com': 'Jill',
  },
};

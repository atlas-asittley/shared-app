// Shared app config. Public values only — the anon key is safe in client code.
// Real access control lives in Postgres RLS (see schema.sql).
window.SHARED_CONFIG = {
  SUPABASE_URL: 'https://igaulapupbtdcqqjobhs.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7yi3BNg-J-K5nralw5JSww_c71Pge6e',

  // Friendly gate only — the database enforces the real list (shared_members table).
  ALLOWED_EMAILS: [
    'drew@example.com',
    'jill@example.com',
  ],

  // Display names, so items read "Added by Jill" instead of the raw address.
  NAMES: {
    'drew@example.com': 'Drew',
    'jill@example.com': 'Jill',
  },

  // Two people sharing one order pad, so: two pens. Blue ballpoint and black.
  // Whoever added a line, it shows up in their ink.
  PENS: {
    'drew@example.com': '#2b4a8f',
    'jill@example.com': '#26221f',
  },
};

// Shared app config. Public values only — the anon key is safe in client code.
// Real access control lives in Postgres RLS (see schema.sql).
window.SHARED_CONFIG = {
  SUPABASE_URL: 'https://igaulapupbtdcqqjobhs.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7yi3BNg-J-K5nralw5JSww_c71Pge6e',

  // Who may use the app (and their display names) lives in the shared_members table, not here,
  // so the members' email addresses aren't published in this public repo.
};

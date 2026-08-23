# Drew & Jill — private shared app

Static site (no build step) on GitHub Pages, backed by the shared Supabase project.
Supabase email+password sign-in, locked to two people, one shared shopping list.

Live: https://atlas-asittley.github.io/shared-app/

## Files
| file | what |
|---|---|
| `index.html` | shell: sign-in wall, "not on the list" screen, app frame |
| `app.js` | session handling, the two-person gate, tool registry |
| `auth.js` | sign in · create account · forgot password · set new password |
| `tools/shopping.js` | the shopping list (add / check off / delete / clear) |
| `config.js` | Supabase URL + public anon key + allowed emails + display names |
| `styles.css` | dark, mobile-first |
| `schema.sql` | tables + RLS (already applied) |

## How access is enforced
- `config.js` lists the allowed emails, but that's only for a friendly screen.
- The real lock is `public.shared_members` + RLS in Postgres. A stranger who signs up gets a
  valid session and still cannot read or write one row — verified with the anon key directly.
- Add a third person later: `insert into shared_members (email, label) values ('x@y.com','X');`
  and add the same address to `config.js`.

## Adding another tool later
Copy `tools/shopping.js`, register it on `window.SharedTools`, add the `<script>` tag to
`index.html`. The tab bar appears automatically once there's more than one tool.
Give its tables a `shared_` prefix and the same `using (public.shared_is_member())` policy.

## Setup
Nothing to configure. Drew and Jill already have accounts on this Supabase project
(created 2026-05-05 for the city builder) — the same email + password signs them in here.

`schema.sql` was applied on 2026-08-23 via `psql "$(cat ~/.citybuilder_db_url)" -f schema.sql`.
Re-run it any time; it's idempotent.

Forgot a password? Reset it from the Supabase dashboard (Authentication → Users → … → Reset),
or send a reset email from the app's Supabase project.

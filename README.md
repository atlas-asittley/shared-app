# Drew & Jill — private shared app

Static site (no build step) on GitHub Pages, backed by the shared Supabase project.
Supabase email+password sign-in, locked to two people. Shared shopping list + a feedback box.

Live: https://atlas-asittley.github.io/shared-app/

## Files
| file | what |
|---|---|
| `index.html` | shell: sign-in wall, "not on the list" screen, app frame |
| `app.js` | session handling, the two-person gate, tool registry |
| `auth.js` | sign in · create account · forgot password · set new password |
| `tools/shopping.js` | the shopping list (add / check off / delete / clear) |
| `tools/feedback.js` | notes to Claude, with the reply shown back on the note |
| `config.js` | Supabase URL + public anon key + allowed emails + display names |
| `styles.css` | diner theme — see below |
| `schema.sql` | tables + RLS (already applied) |
| `stamp.sh` | content-hashes asset URLs in `index.html` (runs on pre-commit) |

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

## The look
Modelled on the diner booth in Drew and Jill's house (photo, Aug 2026): mustard laminate
tabletop with wood grain, black chairs, green chair legs, cream stucco wall, red-and-white
checker, and the table tent reading 17.

- signed out = a guest check on the wall, torn along a perforation above the stub
- signed in = the tabletop, with each item as an order ticket
- fonts: Lobster (the wordmark) + Bebas Neue (labels), from Google Fonts
- notes are tickets: **Ordered** → **Cooking** → **Served**

**The house mark is the paper hat** — a short-order cook's folded cap, drawn in pure CSS as
`.hat` (no image file, so it scales and recolours with the theme). It appears three ways:

- `.hat.hat-lg` — the crown of every auth card
- `.avatar.hat` — the topbar badge. Whoever is signed in is the one on shift, so their
  initial is written on the band (`.avatar-initial`, its own layer so it sits above the
  `::before`/`::after` the hat is built from)
- the favicon, as the same shape in inline SVG

Other fixtures: `.check-head` is the header off a real guest check (GUEST CHECK / TABLE 17 /
No. 0417), the tabletop carries a couple of coffee rings in its background, and `.ding` is
the bell on the pass — it rings when a list comes up empty.

Any new tool should stay inside this: paper tickets on the mustard table, black menu-board
labels, red for actions, green for done. Reach for `.hat` rather than an emoji when
something needs the app's mark on it.

## The feedback box
Drew or Jill leave a note in the Notes tab; it lands in `shared_feedback` with `status='new'`.

A systemd user timer on Drew's box (`shared-app-feedback.timer`, daily 08:47) runs
`~/shared-app-ops/feedback-check.sh`. If any note is still `new`, it wakes the `claude-shared`
tmux instance and hands it the notes. Claude handles what it safely can, sets `status` to
`seen`/`done`, and writes a `reply` — which the app then shows under the note.

Notes stay `new` until they're actually processed, so a missed run just means they're picked
up the next day. Nothing is lost. Log: `~/shared-app-ops/feedback-check.log`.

## Caching
GitHub Pages serves everything with `Cache-Control: max-age=600` and offers no way to change
that. So a browser can hold a stale copy for up to 10 minutes — and, worse, could pair a new
`index.html` with last deploy's `styles.css`.

`stamp.sh` fixes the mismatch: it rewrites every local asset URL in `index.html` to
`file.css?v=<md5 of that file>`. New content = new URL = guaranteed fresh fetch, while
unchanged files keep their hash and stay cached. A `.git/hooks/pre-commit` hook runs it
automatically, so it can't be forgotten.

What it can't fix is `index.html` itself — that one page is subject to the 10-minute window
no matter what, because it's the thing that carries the hashes. In practice a pull-to-refresh
revalidates it immediately (the ETag makes that cheap).

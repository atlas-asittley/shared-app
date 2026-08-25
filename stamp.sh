#!/usr/bin/env bash
# Stamp every local asset URL in index.html with a hash of that file's contents:
#   <link href="styles.css?v=1a2b3c4d">
#
# GitHub Pages serves everything with max-age=600 and gives us no way to
# change that. Without this, a phone can spend up to 10 minutes pairing a
# freshly-fetched index.html with a cached styles.css from the last deploy —
# which reads as "the app is broken", not "the app is stale".
#
# A content hash (not a version number, not a timestamp) means the URL only
# changes when the file actually changes, so unchanged assets stay cached.
#
# index.html is the one file that cannot be hashed this way — it is the file
# carrying the hashes. So it is given a build id instead, written both into
# the page and into version.json, and the page checks one against the other
# at startup (see "self-update" in index.html). That is what rescues an iOS
# home-screen shortcut, which has no reload button and no pull-to-refresh.
#
# Run automatically by .git/hooks/pre-commit.
set -euo pipefail
cd "$(dirname "$0")"

python3 - <<'PY'
import hashlib, pathlib, re

html = pathlib.Path('index.html')
src = html.read_text()

def stamp(match):
    attr, path, rest = match.group('attr'), match.group('path'), match.group('rest')
    f = pathlib.Path(path)
    if not f.exists():
        return match.group(0)
    digest = hashlib.md5(f.read_bytes()).hexdigest()[:8]
    return f'{attr}="{path}?v={digest}"{rest}'

# local .js / .css only — anything with a scheme is left alone
pattern = re.compile(
    r'(?P<attr>\bsrc|\bhref)="(?P<path>(?!\w+:|//)[A-Za-z0-9_./-]+\.(?:js|css))'
    r'(?:\?v=[0-9a-f]+)?"(?P<rest>)'
)
out = pattern.sub(stamp, src)

# The build id is a hash of the page with the old id blanked out — otherwise
# the id would feed into its own hash and every run would produce a new one.
BUILD_RE = re.compile(r"(BUILD\s*=\s*')[0-9a-z]*(')")
neutral = BUILD_RE.sub(lambda m: m.group(1) + m.group(2), out)
build = hashlib.md5(neutral.encode()).hexdigest()[:10]
out = BUILD_RE.sub(lambda m: m.group(1) + build + m.group(2), out)

pathlib.Path('version.json').write_text('{"build":"%s"}\n' % build)

if out != src:
    html.write_text(out)
    print('stamped', build)
else:
    print('unchanged', build)
PY

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

if out != src:
    html.write_text(out)
    print('stamped')
else:
    print('unchanged')
PY

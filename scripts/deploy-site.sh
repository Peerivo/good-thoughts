#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f dist-build/index.html
test -f dist-build/dm-logo.png
test -f dist-build/dm-icon.png
grep -q 'Фабрика добрых мыслей — Peerivo.net' dist-build/index.html
node -e 'const fs=require("node:fs");for(const f of ["dist-build/dm-logo.png","dist-build/dm-icon.png"])if(fs.readFileSync(f).subarray(0,8).toString("hex")!=="89504e470d0a1a0a")process.exit(1)'
mkdir -p .releases
release=".releases/site-$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
if [[ -e "$release" ]]; then
  echo "Release path collision" >&2
  exit 1
fi
previous=""
if [[ -L dist ]]; then
  previous="$(readlink dist)"
elif [[ -d dist ]]; then
  previous=".releases/bootstrap-$(date -u +%Y%m%dT%H%M%SZ)"
  mv dist "$previous"
  ln -s "$previous" dist
fi
mv dist-build "$release"
link_tmp=".dist-link-$$"
trap 'rm -f "$link_tmp"' EXIT
ln -s "$release" "$link_tmp"
mv -Tf "$link_tmp" dist
if [[ ! -f dist/index.html ]]; then
  echo "Invalid symlink after publication" >&2
  if [[ -n "$previous" ]]; then
    ln -s "$previous" "$link_tmp"
    mv -Tf "$link_tmp" dist
  fi
  exit 1
fi
health="$(curl --fail --silent --show-error --max-time 8 http://127.0.0.1:3522/api/health || true)"
title="$(curl --fail --silent --show-error --max-time 8 http://127.0.0.1:3522/ || true)"
if [[ "$health" != *'"status":"ok"'* || "$title" != *'Фабрика добрых мыслей — Peerivo.net'* ]]; then
  echo "Production failed health/title check; revert to previous release" >&2
  if [[ -n "$previous" ]]; then
    ln -s "$previous" "$link_tmp"
    mv -Tf "$link_tmp" dist
  fi
  exit 1
fi
for path in dm-logo.png dm-icon.png; do
  content_type="$(curl --silent --show-error --max-time 8 -o /dev/null -w '%{content_type}' "http://127.0.0.1:3522/$path")"
  if [[ "$content_type" != image/png* ]]; then
    echo "Wrong MIME for $path; rolling back" >&2
    if [[ -n "$previous" ]]; then
      ln -s "$previous" "$link_tmp"
      mv -Tf "$link_tmp" dist
    fi
    exit 1
  fi
done
echo "Published $release; previous: $previous; health/title/PNG passed."

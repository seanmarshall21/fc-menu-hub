#!/bin/bash
# Render page 1 of each menu's print PDF locally (poppler) and upload it via the
# pdf-preview edge function, which stores it and sets menus.print_preview_url.
#
# Why local: the print files are tens-of-MB CMYK PDFs that blow past serverless
# render memory limits (WORKER_RESOURCE_LIMIT). Rendering here — where there's
# real memory — is reliable; the function only persists the result.
#
# Requires: poppler (`brew install poppler` → pdftoppm), curl, base64.
#
# Usage:
#   1) Get the anon key (Supabase → Project settings → API, or ask Claude).
#   2) Feed "menuId<TAB>printFileUrl" lines on stdin (one menu per line). Only
#      direct file links work — Dropbox *folder* links (/scl/fo/) are skipped.
#
#   ANON=eyJ... ./render-print-previews.sh <<'EOF'
#   6673d7bd-...	https://www.dropbox.com/scl/fi/.../Menu.pdf?rlkey=...&dl=1
#   EOF
set -uo pipefail
: "${ANON:?Set ANON to the Supabase anon key}"
FN="${FN:-https://wysvknamfxtbehwetjxf.supabase.co/functions/v1/pdf-preview}"
LONG_EDGE="${LONG_EDGE:-1800}"
Q="${Q:-90}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
ok=0; fail=0; skip=0

while IFS=$'\t' read -r id url; do
  [ -z "${id:-}" ] && continue
  case "$url" in
    *"/scl/fo/"*) echo "⏭  $id — folder link, skipped (needs a direct PDF link)"; ((skip++)); continue ;;
  esac
  # Force a direct download.
  case "$url" in *dl=0*) url="${url/dl=0/dl=1}";; *dl=1*) : ;; *"?"*) url="$url&dl=1";; *) url="$url?dl=1";; esac
  echo "── $id"
  curl -sL "$url" -o "$tmp/f.pdf" || { echo "  download FAILED"; ((fail++)); continue; }
  pdftoppm -jpeg -jpegopt "quality=$Q" -f 1 -l 1 -scale-to "$LONG_EDGE" "$tmp/f.pdf" "$tmp/f" 2>/dev/null
  [ -f "$tmp/f-1.jpg" ] || { echo "  render FAILED"; ((fail++)); continue; }
  b64="$(base64 -i "$tmp/f-1.jpg")"
  printf '{"menuId":"%s","base64":"%s","ext":"jpg"}' "$id" "$b64" > "$tmp/p.json"
  resp=""
  for attempt in 1 2 3; do
    resp="$(curl -s -X POST "$FN" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" --data @"$tmp/p.json" --max-time 120)"
    echo "$resp" | grep -q '"ok":true' && break
    sleep 3
  done
  if echo "$resp" | grep -q '"ok":true'; then echo "  uploaded ✓"; ((ok++)); else echo "  upload FAILED: $resp"; ((fail++)); fi
done

echo "═══ $ok uploaded · $fail failed · $skip skipped"

#!/usr/bin/env bash
# ============================================================
# نسخة احتياطية من قاعدة البيانات
#   npm run db:backup            → ملف في backups/
#   BACKUP_DIR=/path npm run db:backup
# المزوّدون المُدارون (Neon/Supabase) يأخذون نسخهم تلقائيًا،
# لكن نسخة بيدك تعني أنك لا تعتمد على مزوّد واحد.
# ============================================================
set -euo pipefail

URL="${DATABASE_URL:-${POSTGRES_URL:-}}"
if [ -z "$URL" ]; then
  echo "✗ لم يُضبط DATABASE_URL — لا توجد قاعدة Postgres لنسخها." >&2
  exit 1
fi

DIR="${BACKUP_DIR:-backups}"
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$DIR/sportpower-$STAMP.dump"

echo "→ جارٍ أخذ النسخة…"
# صيغة custom (‎-Fc) تسمح باستعادة انتقائية وبضغط أفضل
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$URL"

SIZE=$(du -h "$FILE" | cut -f1)
echo "✓ النسخة جاهزة: $FILE ($SIZE)"

# احتفظ بآخر 14 نسخة فقط
KEEP="${BACKUP_KEEP:-14}"
ls -1t "$DIR"/sportpower-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$old"
  echo "  حُذفت نسخة قديمة: $(basename "$old")"
done

echo
echo "للاستعادة:  npm run db:restore -- $FILE"

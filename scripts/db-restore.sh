#!/usr/bin/env bash
# ============================================================
# استعادة نسخة احتياطية — وتمرين الاستعادة (Restore Drill)
#
#   npm run db:restore -- backups/sportpower-XXXX.dump
#       يستعيد إلى RESTORE_URL إن ضُبط، وإلا إلى DATABASE_URL (بتأكيد صريح)
#
# نسخة احتياطية لم تُجرَّب استعادتها ليست نسخة احتياطية.
# جرّبها إلى قاعدة اختبار كل شهر: أنشئ قاعدة فارغة، استعد إليها،
# ثم شغّل npm run db:check للتأكد من سلامة البيانات.
# ============================================================
set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "الاستخدام: npm run db:restore -- <ملف .dump>" >&2
  ls -1t backups/*.dump 2>/dev/null | head -5 | sed 's/^/  متاح: /' >&2 || true
  exit 1
fi

TARGET="${RESTORE_URL:-${DATABASE_URL:-${POSTGRES_URL:-}}}"
if [ -z "$TARGET" ]; then
  echo "✗ لم يُضبط RESTORE_URL ولا DATABASE_URL." >&2
  exit 1
fi

HOST=$(echo "$TARGET" | sed -E 's|.*@([^/:]+).*|\1|')
DB=$(echo "$TARGET" | sed -E 's|.*/([^/?]+).*|\1|')

if [ -z "${RESTORE_URL:-}" ]; then
  echo "⚠️  ستستعيد فوق قاعدة العمل نفسها: $DB على $HOST"
  echo "    (الأأمن: اضبط RESTORE_URL لقاعدة اختبار منفصلة)"
  read -r -p "اكتب اسم القاعدة للتأكيد [$DB]: " CONFIRM
  [ "$CONFIRM" = "$DB" ] || { echo "أُلغيت الاستعادة."; exit 1; }
fi

echo "→ الاستعادة إلى $DB على $HOST من $FILE"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$FILE"
echo "✓ اكتملت الاستعادة."
echo
echo "الخطوة التالية — تحقّق من سلامة البيانات:"
echo "  DATABASE_URL=\"$TARGET\" npm run db:check"

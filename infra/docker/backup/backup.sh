#!/bin/sh
# Sao lưu hằng ngày: cơ sở dữ liệu (pg_dump dạng nén) + toàn bộ ảnh. Giữ BACKUP_KEEP_DAYS ngày gần nhất.
#   Kết nối CSDL qua biến chuẩn của PostgreSQL: PGHOST, PGUSER, PGPASSWORD, PGDATABASE
#   BACKUP_HOUR=2  (giờ chạy theo TZ, mặc định 2 giờ sáng)
#   Chạy ngay một lần: docker compose ... exec backup /backup.sh now
set -eu
OUT="${BACKUP_DIR:-/backups}"
MEDIA="${MEDIA_SRC:-/media}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-2}"

run_backup() {
  stamp=$(date +%Y-%m-%d_%H%M)
  mkdir -p "$OUT"
  echo "[$(date)] Bắt đầu sao lưu $stamp"
  pg_dump -Fc -f "$OUT/db_$stamp.dump.part" && mv "$OUT/db_$stamp.dump.part" "$OUT/db_$stamp.dump"
  tar -C "$MEDIA" -czf "$OUT/media_$stamp.tar.gz.part" . && mv "$OUT/media_$stamp.tar.gz.part" "$OUT/media_$stamp.tar.gz"
  find "$OUT" -name 'db_*.dump' -mtime +"$KEEP" -delete
  find "$OUT" -name 'media_*.tar.gz' -mtime +"$KEEP" -delete
  echo "[$(date)] Xong: $(ls -1 "$OUT" | wc -l) file trong $OUT"
}

if [ "${1:-}" = "now" ]; then
  run_backup
  exit 0
fi

echo "Sao lưu tự động lúc ${HOUR}:00 mỗi ngày (TZ=${TZ:-UTC}), giữ ${KEEP} ngày"
last=""
while true; do
  today=$(date +%Y-%m-%d)
  if [ "$(date +%H)" -eq "$HOUR" ] && [ "$last" != "$today" ]; then
    run_backup || echo "[$(date)] SAO LƯU LỖI"
    last="$today"
  fi
  sleep 300
done

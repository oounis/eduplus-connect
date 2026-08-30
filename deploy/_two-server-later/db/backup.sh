#!/bin/sh
# EduPlus Connect — nightly database backup.
#
# A backup that has never been restored is a rumour, so this script does three
# things beyond dumping: it verifies the dump is readable, it writes a checksum,
# and it refuses to delete old copies if the new one did not work.
#
# Run by the `backup` service in docker-compose.yml (daily), or by hand:
#   docker compose exec backup sh /usr/local/bin/backup.sh

set -eu

DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DAY="$(date -u +%u)"          # 1..7, 7 = Sunday
FILE="$DIR/eduplus-$STAMP.dump"

mkdir -p "$DIR"

echo "[$(date -u +%FT%TZ)] backup starting -> $FILE"

# Custom format (-Fc): compressed, and restorable table-by-table with
# pg_restore, which plain SQL is not.
pg_dump --format=custom --compress=6 --file="$FILE"

# Prove the dump is readable before anything is pruned. pg_restore --list
# parses the archive's table of contents and fails on a truncated file — which
# is exactly the failure a silent disk-full produces.
if ! pg_restore --list "$FILE" > /dev/null 2>&1; then
  echo "[$(date -u +%FT%TZ)] FAILED: dump is not readable, keeping old backups"
  rm -f "$FILE"
  exit 1
fi

SIZE="$(du -h "$FILE" | cut -f1)"
sha256sum "$FILE" > "$FILE.sha256"

# Sunday's copy is kept outside the rotation, so a fault that goes unnoticed
# for two weeks does not leave nothing to go back to.
if [ "$DAY" = "7" ]; then
  cp "$FILE" "$DIR/weekly-eduplus-$STAMP.dump"
  cp "$FILE.sha256" "$DIR/weekly-eduplus-$STAMP.dump.sha256"
  # Keep 8 weekly copies (~2 months).
  ls -1t "$DIR"/weekly-eduplus-*.dump 2>/dev/null | tail -n +9 | while read -r old; do
    rm -f "$old" "$old.sha256"
  done
fi

# Only now, with a verified dump on disk, prune the daily rotation.
find "$DIR" -name 'eduplus-*.dump' -type f -mtime "+$RETENTION_DAYS" -delete
find "$DIR" -name 'eduplus-*.dump.sha256' -type f -mtime "+$RETENTION_DAYS" -delete

COUNT="$(ls -1 "$DIR"/eduplus-*.dump 2>/dev/null | wc -l)"
echo "[$(date -u +%FT%TZ)] backup OK: $FILE ($SIZE); $COUNT daily copies retained"

# --- Offsite ---------------------------------------------------------------
# A backup on the same machine as the database is not a backup: it survives a
# bad migration, not a lost server. Set RCLONE_REMOTE to push a copy off the
# box (Contabo Object Storage, Backblaze B2, S3 — anything rclone speaks).
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone > /dev/null 2>&1; then
  if rclone copy "$FILE" "$RCLONE_REMOTE" && \
     rclone copy "$FILE.sha256" "$RCLONE_REMOTE"; then
    echo "[$(date -u +%FT%TZ)] offsite copy OK -> $RCLONE_REMOTE"
  else
    echo "[$(date -u +%FT%TZ)] WARNING: offsite copy FAILED (local copy kept)"
    exit 1
  fi
else
  echo "[$(date -u +%FT%TZ)] NOTE: no offsite copy configured (set RCLONE_REMOTE)"
fi

#!/bin/bash
# backup.sh — 每日数据库全量备份（cron: 0 3 * * *）
set -e

ENV_FILE=/opt/twin/config/.env
if [ -f "$ENV_FILE" ]; then
    set -a && source "$ENV_FILE" && set +a
fi

BACKUP_DIR=/opt/twin/backups/$(date +%Y%m%d)
mkdir -p "$BACKUP_DIR"

mysqldump -u root -p"${DB_PASSWORD}" \
    --single-transaction --routines --triggers \
    --all-databases | gzip > "$BACKUP_DIR/mysql-all.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 备份完成: $BACKUP_DIR/mysql-all.sql.gz"

# 清理 30 天前备份
find /opt/twin/backups -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true

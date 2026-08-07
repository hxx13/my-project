#!/bin/bash
# sync-and-deploy.sh — 过渡期：覆盖数据库 + 覆盖文件 + git pull + 构建 + 部署
# 用法: bash sync-and-deploy.sh
# 前提: 已通过 SFTP 上传 twin_system_latest.sql 和 twin_data_latest.tar.gz 到 /home/aroadmin/
set -e

UPLOAD_DIR=/home/aroadmin
REPO_DIR=/opt/twin/repo
APP_DIR=/opt/twin/app
ENV_FILE=/opt/twin/config/.env

if [ -f "$ENV_FILE" ]; then
    set -a && source "$ENV_FILE" && set +a
fi

echo "=========================================="
echo "  Twin System Sync & Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1/7: 修复 SQL 排序规则兼容性
echo "=== 1/7 修复 SQL 排序规则 ==="
sed -i 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' "$UPLOAD_DIR/twin_system_latest.sql"

# 2/7: 备份当前数据库
echo "=== 2/7 备份当前数据库 ==="
mkdir -p /opt/twin/backups
sudo mysqldump --single-transaction --all-databases | gzip > /opt/twin/backups/before-sync-$(date +%Y%m%d-%H%M).sql.gz

# 3/7: 覆盖数据库
echo "=== 3/7 覆盖数据库 ==="
sudo mysql --force twin_system < "$UPLOAD_DIR/twin_system_latest.sql"

# 4/7: 覆盖文件数据
echo "=== 4/7 覆盖文件数据 ==="
sudo tar -xzf "$UPLOAD_DIR/twin_data_latest.tar.gz" -C /opt/twin/data/

# 5/7: git pull 最新代码
echo "=== 5/7 git pull ==="
cd "$REPO_DIR"
git pull origin master
echo "  当前 commit: $(git rev-parse --short HEAD)"

# 6/7: 构建 + 部署
echo "=== 6/7 构建 + 部署 ==="
cd "$REPO_DIR/frontend" && npm ci && npm run build && cd "$REPO_DIR"
mvn clean package -DskipTests -Plinux

sudo systemctl stop twin
sleep 5
OLD=$(ls "$APP_DIR"/demo-*.jar 2>/dev/null | head -1)
[ -n "$OLD" ] && sudo cp "$OLD" "$APP_DIR/demo-previous.jar.bak"
sudo rm -f "$APP_DIR"/demo-*.jar
sudo cp target/demo-*.jar "$APP_DIR/"
sudo chown twin:twin "$APP_DIR"/demo-*.jar
sudo systemctl start twin

# 7/7: 健康检查
echo "=== 7/7 健康检查（等 25 秒）==="
sleep 25
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" https://localhost -H "Host: aroultra.shsmu.edu.cn")
if [ "$HTTP" = "200" ]; then
    echo "=========================================="
    echo "  ✅ 同步部署完成  HTTP $HTTP"
    echo "=========================================="
else
    echo "=========================================="
    echo "  ❌ HTTP $HTTP — 查看日志: sudo journalctl -u twin --no-pager -n 30"
    echo "=========================================="
    exit 1
fi

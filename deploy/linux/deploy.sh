#!/bin/bash
# deploy.sh — 生产环境自动部署脚本
# 用法:
#   bash deploy.sh              # 完整流程（含 git pull + 构建）
#   bash deploy.sh --skip-build # 跳过构建（已手动 npm + mvn 完成时使用）
set -e

APP_DIR=/opt/twin/app
REPO_DIR=/opt/twin/repo
BACKUP_DIR=/opt/twin/backups/pre-deploy
ENV_FILE=/opt/twin/config/.env

SKIP_BUILD=false
if [ "${1:-}" = "--skip-build" ]; then
    SKIP_BUILD=true
fi

# 加载环境变量
if [ -f "$ENV_FILE" ]; then
    set -a && source "$ENV_FILE" && set +a
fi

echo "=========================================="
echo "  Twin System Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
if $SKIP_BUILD; then
    echo "  模式: 跳过构建（快速部署）"
fi
echo "=========================================="

# Step 1/8: git pull
echo "=== Step 1/8: git pull ==="
cd "$REPO_DIR"
git pull origin master
echo "  当前 commit: $(git rev-parse --short HEAD)"

# Step 2/8: DB 备份
echo "=== Step 2/8: DB 备份 ==="
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql.gz"
sudo mysqldump --single-transaction --no-create-info twin_system 2>/dev/null | gzip > "$BACKUP_FILE" || echo "  备份失败（不阻断部署）"
echo "  备份完成: $BACKUP_FILE"

# 只保留最近 5 次部署备份
sudo ls -t "$BACKUP_DIR"/backup-*.sql.gz 2>/dev/null | tail -n +6 | xargs sudo rm -f 2>/dev/null || true

if $SKIP_BUILD; then
    echo "=== Step 3-4/8: 跳过构建（--skip-build） ==="
else
    # Step 3/8: 前端构建
    echo "=== Step 3/8: npm build ==="
    cd "$REPO_DIR/frontend"
    npm ci
    npm run build

    # Step 4/8: 后端构建
    echo "=== Step 4/8: mvn package ==="
    cd "$REPO_DIR"
    mvn clean package -DskipTests -Plinux
fi

# Step 5/8: 优雅停机
echo "=== Step 5/8: 停止服务 ==="
sudo systemctl stop twin
sleep 3
echo "  服务已停止"

# Step 6/8: 替换 JAR
echo "=== Step 6/8: 替换 JAR ==="
mkdir -p "$APP_DIR"

# 找到 deploy 目录里最新的 JAR
LATEST_JAR=$(ls -t deploy/demo-*.jar 2>/dev/null | head -1)
if [ -z "$LATEST_JAR" ]; then
    echo "  ❌ deploy/ 未找到 JAR，请先执行 mvn package"
    exit 1
fi
echo "  最新构建: $LATEST_JAR"

# 备份旧 JAR → 清理 → 只放最新的 → 固定名称 demo.jar
if ls "$APP_DIR"/demo-*.jar 2>/dev/null | head -1 > /dev/null; then
    ls "$APP_DIR"/demo-*.jar 2>/dev/null | head -1 | xargs -I{} cp {} "$APP_DIR/demo-previous.jar.bak"
    echo "  旧版本已备份: demo-previous.jar.bak"
fi
rm -f "$APP_DIR"/demo-*.jar "$APP_DIR"/demo.jar
cp "$LATEST_JAR" "$APP_DIR/demo.jar"
sudo chown twin:twin "$APP_DIR/demo.jar"
echo "  JAR 已替换: demo.jar"

# Step 7/8: 启动服务
echo "=== Step 7/8: 启动服务 ==="
sudo systemctl start twin
echo "  等待 25 秒..."
sleep 25

# Step 8/8: 健康检查
echo "=== Step 8/8: 健康检查 ==="
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" https://localhost -H "Host: aroultra.shsmu.edu.cn")
if [ "$HTTP" = "200" ]; then
    echo "=========================================="
    echo "  ✅ 部署成功  HTTP $HTTP"
    echo "=========================================="
else
    echo "=========================================="
    echo "  ❌ 部署异常  HTTP $HTTP"
    echo "  查看日志: sudo journalctl -u twin --no-pager -n 30"
    echo "  回滚命令: bash $REPO_DIR/deploy/linux/rollback.sh"
    echo "=========================================="
    exit 1
fi

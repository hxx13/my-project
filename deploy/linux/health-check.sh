#!/bin/bash
# health-check.sh — 服务健康检查
set -e

echo "=== Twin System Health Check ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"

# 1. HTTP 状态
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" https://localhost -H "Host: aroultra.shsmu.edu.cn" 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then
    echo "✅ HTTP 内网: $HTTP"
else
    echo "❌ HTTP 内网: $HTTP"
fi

# 2. systemd 状态
if systemctl is-active --quiet twin; then
    echo "✅ systemd twin: active"
else
    echo "❌ systemd twin: inactive"
fi

# 3. MariaDB 状态
if systemctl is-active --quiet mariadb; then
    echo "✅ MariaDB: active"
else
    echo "❌ MariaDB: inactive"
fi

# 4. 磁盘使用率
DISK=$(df -h /opt/twin | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK" -lt 80 ]; then
    echo "✅ 磁盘: ${DISK}%"
else
    echo "⚠️  磁盘: ${DISK}% (接近满载)"
fi

# 5. 内存使用
MEM=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
echo "📊 内存: ${MEM}%"

# 6. 最近错误日志
echo "--- 最近 5 条 twin 错误日志 ---"
sudo journalctl -u twin --no-pager -n 5 2>/dev/null || echo "(无日志)"

echo "=== 检查完成 ==="

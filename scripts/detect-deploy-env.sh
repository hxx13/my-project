#!/bin/bash
# detect-deploy-env.sh — 自动检测部署环境，切换图片传输模式
# 原理：通过检测可访问的域名，自动设置 network.upload.publicBaseUrl
# 用法：bash detect-deploy-env.sh （部署脚本中自动调用）

set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-SuperAdmin@2026}"
DB_NAME="${DB_NAME:-twin_system}"

# === 检测当前环境 ===
detect_upload_base() {
    # 1. 尝试检测公网域名是否可达（说明在生产环境）
    if curl -sk --connect-timeout 2 https://arodlas.shsmu.edu.cn/api/ > /dev/null 2>&1; then
        echo "https://arodlas.shsmu.edu.cn/api/upload/files"
        return
    fi

    # 2. 检测内网域名是否可达
    if curl -sk --connect-timeout 2 https://aroultra.shsmu.edu.cn/api/ > /dev/null 2>&1; then
        echo "https://aroultra.shsmu.edu.cn/api/upload/files"
        return
    fi

    # 3. 本地开发环境
    IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -n "$IP" ]; then
        echo "http://${IP}:8080/api/upload/files"
        return
    fi

    echo "/api/upload/files"
}

UPLOAD_BASE=$(detect_upload_base)
echo "[detect-deploy-env] 检测到 upload 基址: $UPLOAD_BASE"

# === 写入 MySQL ===
mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
INSERT INTO sys_system_config (module, config_key, config_value, value_type, remark)
VALUES ('network', 'network.upload.publicBaseUrl', '$UPLOAD_BASE', 'string', 'auto-detected')
ON DUPLICATE KEY UPDATE config_value = '$UPLOAD_BASE';
" 2>/dev/null || echo "[detect-deploy-env] ⚠ MySQL 更新失败，跳过"

echo "[detect-deploy-env] ✅ 已设置 network.upload.publicBaseUrl = $UPLOAD_BASE"

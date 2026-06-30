#!/usr/bin/env bash
# 在阿里云 ECS 上执行（root 或 sudo）
# 用法：sudo bash setup-nginx-ecs.sh
set -euo pipefail

CONF_SRC="${1:-./nginx-twin-static-cache.conf}"
CONF_DST="/etc/nginx/conf.d/twin-static-cache.conf"
WEB_ROOT="/var/www/twin/static"

echo "==> 安装 Nginx（若已安装则跳过）"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y nginx
elif command -v yum >/dev/null 2>&1; then
  yum install -y nginx
else
  echo "请手动安装 nginx 后重试"
  exit 1
fi

echo "==> 创建静态目录 ${WEB_ROOT}"
mkdir -p "${WEB_ROOT}/assets"
chown -R nginx:nginx /var/www/twin 2>/dev/null || chown -R www-data:www-data /var/www/twin 2>/dev/null || true

if [[ ! -f "${CONF_SRC}" ]]; then
  echo "找不到 ${CONF_SRC}，请在 deploy/ecs 目录下执行，或传入配置文件路径"
  exit 1
fi

echo "==> 安装 Nginx 配置 → ${CONF_DST}"
cp "${CONF_SRC}" "${CONF_DST}"

echo "==> 测试配置"
nginx -t

echo "==> 重载 Nginx"
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

echo ""
echo "完成。下一步："
echo "  1. ECS frps 使用 frps-nginx-mode.toml（proxyBindAddr=127.0.0.1）并重启 frps"
echo "  2. Windows frpc 改用 frpc-nginx-mode.toml（remotePort=18080）并重启 frpc"
echo "  3. 安全组：放行 80，关闭公网 8080"
echo "  4. 在本机运行 deploy/ecs/sync-static-to-ecs.ps1 上传 static"
echo "  5. 浏览器访问 http://$(curl -s --max-time 2 ifconfig.me 2>/dev/null || echo '你的ECS IP')/"

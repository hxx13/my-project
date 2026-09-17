#!/bin/bash
# rollback.sh — 快速回滚到上一个版本
#
# ⚠ 2026-09-17 重写。旧版有两个致命 bug（当天生产事故中实际踩到，两次都报了「回滚成功」而站点仍挂着）：
#   1. 它把备份拷成 demo-rollback.jar，可 systemd 单元跑的是 demo.jar —— 等于根本没回滚；
#   2. 健康检查只看 /，而 SPA 的 / 只要 index.html 在就永远 200，
#      即使所有 JS/CSS 都 404（当天故障正是这种：/ 200、/assets/* 全 404）。
#   本版：覆盖 demo.jar 本体、核对大小真的变了、轮询等应用起来（而非死等 25 秒）、
#   并且必须验一个真实的 /assets/* 资源才算成功。
set -euo pipefail

APP_DIR=/opt/twin/app
HOST_HEADER="aroultra.shsmu.edu.cn"
BASE="https://localhost"

die() { echo "❌ $*"; exit 1; }

echo "=== 回滚到上一版本 ==="

BAK="$APP_DIR/demo-previous.jar.bak"
CUR="$APP_DIR/demo.jar"
[ -f "$BAK" ] || die "未找到备份 JAR: $BAK"

# 备份可能就是坏的那份：deploy.sh 每跑一次都会覆盖它，故障期间跑两遍就废了
if [ "$(md5sum < "$BAK" | cut -d' ' -f1)" = "$(md5sum < "$CUR" | cut -d' ' -f1)" ]; then
    die "备份与当前 demo.jar 完全相同 —— 备份里装的就是坏的那份。
    去 /opt/twin/repo/deploy/ 找更早的构建产物：ls -lat /opt/twin/repo/deploy/demo-*.jar | head
    然后手动 sudo cp <选中的> $CUR"
fi

echo "停止当前服务..."
sudo systemctl stop twin
sleep 3

echo "保留当前(坏)版本以便取证 + 替换 JAR..."
sudo cp "$CUR" "$APP_DIR/demo-broken.jar.bak"
sudo cp "$BAK" "$CUR"
sudo chown twin:twin "$CUR"

# 关键断言：文件真的换掉了。没换掉就白忙一场（旧版就是死在这里却报成功）
NEW_SIZE=$(stat -c%s "$CUR"); BAK_SIZE=$(stat -c%s "$BAK")
[ "$NEW_SIZE" = "$BAK_SIZE" ] || die "demo.jar 大小仍是 $NEW_SIZE，与备份 $BAK_SIZE 不符 —— 没换上"
echo "✅ demo.jar 已换成备份那份（$NEW_SIZE 字节）"

echo "启动服务..."
sudo systemctl start twin

# 应用启动约需 60 秒，轮询最多 120 秒（旧版死等 25 秒，把「还没起来」误报成回滚失败）
echo "等待应用启动（最长 120 秒）..."
HTTP=000
for _ in $(seq 1 24); do
    HTTP=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 5 "$BASE" -H "Host: $HOST_HEADER" || true)
    if [ "$HTTP" = "200" ]; then break; fi
    sleep 5
done
[ "$HTTP" = "200" ] || die "回滚后首页 HTTP $HTTP —— 检查日志: sudo journalctl -u twin --no-pager -n 30"

# 光看 / 不够：SPA 的 / 永远 200。必须验一个真实资源。
ASSET=$(curl -sk --max-time 10 "$BASE" -H "Host: $HOST_HEADER" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -1 || true)
if [ -z "$ASSET" ]; then
    die "首页里找不到任何 /assets/*.js 引用 —— 页面本身就不正常，别当成回滚成功"
fi

AHTTP=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$ASSET" -H "Host: $HOST_HEADER" || true)
if [ "$AHTTP" = "200" ]; then
    echo "✅ 回滚成功   / -> $HTTP   $ASSET -> $AHTTP"
else
    die "首页 200 但静态资源挂了：$ASSET -> $AHTTP
    这正是「白屏」的典型形态。检查日志: sudo journalctl -u twin --no-pager -n 30"
fi

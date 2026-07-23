#!/usr/bin/env bash
# ── TWIN SYSTEM 启动脚本 (Linux / macOS) ──
# Docker / K8s 环境请直接: java -jar target/demo-*.jar

set -e

# 工作目录 = 脚本所在目录的上一级（项目根）
cd "$(dirname "$0")"

JAVA_OPTS="-Xms256m -Xmx2g"
JAVA_OPTS="$JAVA_OPTS -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8"
JAVA_OPTS="$JAVA_OPTS -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8"

# 查找 JAR
JAR=$(ls deploy/demo-*.jar 2>/dev/null | head -1)

if [ -n "$JAR" ]; then
    echo "→ Starting: java -jar $JAR"
    exec java $JAVA_OPTS -jar "$JAR" "$@"
elif [ -d target/classes ]; then
    echo "→ Starting from classes (dev mode)"
    exec java $JAVA_OPTS -cp "target/classes:$(echo target/dependency/*.jar | tr ' ' ':')" com.example.demo.DemoApplication "$@"
else
    echo "ERROR: No JAR or classes found. Run 'mvn package' first."
    exit 1
fi

@echo off
REM ── TWIN SYSTEM 启动脚本 (Windows cmd / PowerShell) ──
REM Docker / K8s 环境请直接: java -jar target/demo-*.jar

REM 切换控制台代码页为 UTF-8（cmd.exe OEM 代码页 65001 = UTF-8）
chcp 65001 >nul 2>&1

REM 工作目录 = 脚本所在目录（项目根）
cd /d "%~dp0"

set JAVA_OPTS=-Xms256m -Xmx2g
set JAVA_OPTS=%JAVA_OPTS% -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8
set JAVA_OPTS=%JAVA_OPTS% -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8

REM 查找 JAR
for %%f in (target\demo-*.jar) do set JAR=%%f

if defined JAR (
    echo → Starting: java -jar %JAR%
    java %JAVA_OPTS% -jar "%JAR%" %*
) else if exist target\classes (
    echo → Starting from classes (dev mode)
    java %JAVA_OPTS% -cp "target\classes;target\dependency\*" com.example.demo.DemoApplication %*
) else (
    echo ERROR: No JAR or classes found. Run 'mvn package' first.
    pause
    exit /b 1
)

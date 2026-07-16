@echo off
REM -- TWIN SYSTEM launcher (Windows) --
REM Docker / K8s: java -jar deploy/demo-*.jar

cd /d "%~dp0"

set JAVA_OPTS=-Xms256m -Xmx2g
set JAVA_OPTS=%JAVA_OPTS% -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8
set JAVA_OPTS=%JAVA_OPTS% -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8

REM Find JAR
for %%f in (deploy\demo-*.jar) do set JAR=%%f

if defined JAR (
    echo -^> Starting: java -jar %JAR%
    chcp 65001 >nul 2>&1
    java %JAVA_OPTS% -jar "%JAR%" %*
) else if exist target\classes (
    echo -^> Starting from classes (dev mode)
    chcp 65001 >nul 2>&1
    java %JAVA_OPTS% -cp "target\classes;target\dependency\*" com.example.demo.DemoApplication %*
) else (
    echo ERROR: No JAR or classes found. Run 'mvn package' first.
    pause
    exit /b 1
)

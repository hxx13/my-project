# 将 frontend build 产物同步到 ECS Nginx 静态目录
# 用法（在项目根目录）：
#   .\deploy\ecs\sync-static-to-ecs.ps1 -EcsHost 47.101.61.184 -SshUser root
#
# 前置：本地已 npm run build，且 ECS 已运行 setup-nginx-ecs.sh

param(
    [string]$EcsHost = "47.101.61.184",
    [string]$SshUser = "root",
    [string]$StaticDir = "src\main\resources\static",
    [string]$RemoteDir = "/var/www/twin/static",
    [switch]$IncludeModels
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LocalStatic = Join-Path $RepoRoot $StaticDir

if (-not (Test-Path (Join-Path $LocalStatic "index.html"))) {
    Write-Error "未找到 $LocalStatic\index.html，请先在前端目录执行: npm run build"
}

Write-Host "同步 $LocalStatic -> ${SshUser}@${EcsHost}:${RemoteDir}/"

# 优先 scp（Windows OpenSSH 自带）
$scp = Get-Command scp -ErrorAction SilentlyContinue
if (-not $scp) {
    Write-Error "未找到 scp，请安装 OpenSSH 客户端或使用 WSL rsync"
}

# 确保远程目录存在
ssh "${SshUser}@${EcsHost}" "mkdir -p ${RemoteDir}/assets"

# 上传 index.html、favicon、assets
scp (Join-Path $LocalStatic "index.html") "${SshUser}@${EcsHost}:${RemoteDir}/"
if (Test-Path (Join-Path $LocalStatic "favicon.svg")) {
    scp (Join-Path $LocalStatic "favicon.svg") "${SshUser}@${EcsHost}:${RemoteDir}/"
}
scp -r (Join-Path $LocalStatic "assets\*") "${SshUser}@${EcsHost}:${RemoteDir}/assets/"

if ($IncludeModels) {
    $ModelsSrc = Join-Path $RepoRoot "frontend\models"
    if (Test-Path $ModelsSrc) {
        Write-Host "同步人脸模型 frontend/models -> ${RemoteDir}/models/"
        ssh "${SshUser}@${EcsHost}" "mkdir -p ${RemoteDir}/models"
        scp -r "$ModelsSrc\*" "${SshUser}@${EcsHost}:${RemoteDir}/models/"
    } else {
        Write-Warning "未找到 frontend\models，跳过模型同步"
    }
}

Write-Host "完成。请访问: http://${EcsHost}/"
Write-Host "发版后只需重新运行本脚本 + 重启内网 Spring（若仅静态变更则不必重启 jar）"

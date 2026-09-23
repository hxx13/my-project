# 打印工位本地代理：替代工位页浏览器，在这台机器上把任务直接交给打印机。
# 为什么不用浏览器：--kiosk-printing 只在窗口可见且前台时静默，窗口一被盖住就弹打印对话框；
# 而且送进驱动的是浏览器光栅化的位图（300 DPI 封顶）。这里送的是 PDF 原件。
#
# 用法：见文件末尾「启动与自启」注释。和工位页**不能同时跑**（两边都会领任务）。
#
# 首次运行会交互问一次密码，用 DPAPI 加密存到 print-agent.secret —— 只能本机本用户解出。
# 所以计划任务必须以同一个用户身份运行。

param(
  [string]$BaseUrl = "http://localhost:8081",
  [string]$Username = "",
  # 留空 = 用系统默认打印机。与 --kiosk-printing 同口径，也就是原来那条运维红线
  [string]$PrinterName = "",
  [int]$PollSeconds = 15,
  [int]$SofficeTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
# WinPS 5.1 默认还带 SSL3/TLS1.0，HTTPS 站点会直接握手失败
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ConfigFile = Join-Path $PSScriptRoot 'print-agent.config.ps1'
$SecretFile = Join-Path $PSScriptRoot 'print-agent.secret'
$LogFile = Join-Path $PSScriptRoot 'print-agent.log'

# 站点、账号、打印机名这类非密配置放这个文件，改完重启代理即可：
#   $BaseUrl = "https://aroultra.shsmu.edu.cn"
#   $Username = "STAFF_xxx"
if (Test-Path $ConfigFile) { . $ConfigFile }
if (-not $Username) { throw "没配账号：在 $ConfigFile 里写 `$Username = 'STAFF_xxx'" }

function Log([string]$m) {
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

# ---- 密码：首次交互输入并落盘（DPAPI，只本机本用户可解） ----
$secure = $null
if (Test-Path $SecretFile) {
  $secure = (Get-Content $SecretFile -Raw).Trim() | ConvertTo-SecureString
} else {
  $secure = Read-Host -AsSecureString -Prompt "首次运行，请输入工位账号 $Username 的密码（只输这一次）"
  $secure | ConvertFrom-SecureString | Set-Content -Path $SecretFile
  Log "密码已加密存到 $SecretFile"
}
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

$Token = ''
# Api() 抛异常前把业务码留这儿：401 = 登录态过期要重登，403 = 账号没绑工位，重登也没用
$script:LastApiCode = 0

function Api([string]$method, [string]$path, $body) {
  $h = @{}
  if ($Token) { $h['Authorization'] = "Bearer $Token" }
  $p = @{
    Method = $method
    Uri = $BaseUrl.TrimEnd('/') + $path
    Headers = $h
    TimeoutSec = 60
  }
  if ($null -ne $body) {
    $json = $body | ConvertTo-Json -Compress -Depth 6
    # 必须自己转 UTF8 字节：WinPS 5.1 直接传字符串会按本地代码页编码，中文错误信息会毁成问号
    $p['Body'] = [Text.Encoding]::UTF8.GetBytes($json)
    $p['ContentType'] = 'application/json; charset=utf-8'
  }
  $r = Invoke-RestMethod @p
  if ($null -ne $r -and ($r.PSObject.Properties.Name -contains 'success') -and -not $r.success) {
    $script:LastApiCode = [int]$r.code
    throw "接口返回失败 [$($r.code)] $($r.message)"
  }
  return $r
}

function Login {
  $r = Api 'POST' '/api/auth/login/web' @{
    username = $Username; password = $Password
    turnstileToken = ''
    # 站点开了人机验证又没配 token 时会回「请先完成人机验证」，那时把这里改成 $true
    turnstileLoadFailed = $false
  }
  $script:Token = $r.data.token
  Log "登录成功：$($r.data.userInfo.username)（$($r.data.role)）"
}

# 按内容判类型。不能看扩展名：Word 上传时已转成 PDF，file_name 还是 .docx
function Get-Ext([byte[]]$b) {
  if ($b.Length -ge 5 -and $b[0] -eq 0x25 -and $b[1] -eq 0x50 -and $b[2] -eq 0x44 -and $b[3] -eq 0x46) { return '.pdf' }
  if ($b.Length -ge 4 -and $b[0] -eq 0x89 -and $b[1] -eq 0x50 -and $b[2] -eq 0x4E -and $b[3] -eq 0x47) { return '.png' }
  if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xD8) { return '.jpg' }
  return $null
}

function Resolve-Soffice {
  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
  foreach ($r in $roots) {
    $p = Join-Path $r 'LibreOffice\program\soffice.exe'
    if (Test-Path $p) { return $p }
  }
  throw "找不到 soffice.exe，先跑一遍 deploy\install-libreoffice.bat"
}

function Resolve-Printer {
  if ($PrinterName) { return $PrinterName }
  $p = Get-CimInstance Win32_Printer -Filter 'Default=True' -ErrorAction SilentlyContinue |
       Select-Object -First 1
  if (-not $p) { throw "拿不到系统默认打印机名，请在 config 里写死 `$PrinterName" }
  return $p.Name
}

function Ack([string]$id, [bool]$ok, [string]$err) {
  if ($err -and $err.Length -gt 200) { $err = $err.Substring(0, 200) }
  $r = Api 'POST' "/api/print/jobs/$id/ack" @{ ok = $ok; error = $err }
  if (-not $r.success) { Log "回执没被接受：$($r.message)" }
}

function Invoke-Job($job) {
  $id = $job.id
  # 打完的 PDF 不删（soffice 可能委派给常驻实例后立刻返回），靠这里收一天前的残留
  Get-ChildItem -Path $env:TEMP -Filter 'print-*' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  $tmp = Join-Path $env:TEMP "print-$id.bin"   # 全 ASCII：中文名进命令行参数会毁在代码页上
  try {
    Invoke-WebRequest -Uri "$($BaseUrl.TrimEnd('/'))/api/print/jobs/$id/file" `
      -Headers @{ Authorization = "Bearer $Token" } -OutFile $tmp -UseBasicParsing -TimeoutSec 180
    $bytes = [IO.File]::ReadAllBytes($tmp)

    $ext = Get-Ext $bytes
    if (-not $ext) {
      # 文件早被清掉时服务端回的是 JSON 业务错误（HTTP 200），写进文件就是一段 { 开头的文本
      if ($bytes.Length -ge 1 -and $bytes[0] -eq 0x7B) {
        Ack $id $false '源文件已不存在（一次性打印的文件打完即删，无法重推）'
      } else {
        Ack $id $false '收到的内容既不是 PDF 也不是图片'
      }
      Log "跳过 $($job.fileName)：内容不可打印"
      return
    }

    $file = Join-Path $env:TEMP "print-$id$ext"
    Move-Item -LiteralPath $tmp -Destination $file -Force

    $soffice = Resolve-Soffice
    $printer = Resolve-Printer
    $loUri = 'file:///' + ((Join-Path $env:LOCALAPPDATA 'print-agent\lo-profile') -replace '\\', '/')

    # 参数拼成一个字符串而不是传数组：Start-Process 只会用空格把数组接起来，
    # 打印机名里有空格（"HP Color Laser 150"）就会被拆成两个参数。这里自己带引号。
    $argLine = "--headless --norestore `"-env:UserInstallation=$loUri`" --pt `"$printer`" `"$file`""
    Log "打印中：$($job.fileName) → $printer（$($job.copies) 份）"
    $proc = Start-Process -FilePath $soffice -ArgumentList $argLine -WindowStyle Hidden -PassThru
    if (-not $proc.WaitForExit($SofficeTimeoutSeconds * 1000)) {
      try { $proc.Kill() } catch { }
      Ack $id $false "soffice 超过 $SofficeTimeoutSeconds 秒没返回"
      Log "失败 $($job.fileName)：soffice 超时"
      return
    }
    # 退出码 0 = 已进打印队列，不等于出纸（与 KIOSK/SERVER 同口径）
    if ($proc.ExitCode -eq 0) {
      Ack $id $true ''
      Log "已提交打印：$($job.fileName)"
    } else {
      Ack $id $false "soffice 退出码 $($proc.ExitCode)"
      Log "失败 $($job.fileName)：soffice 退出码 $($proc.ExitCode)"
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

Log "=== 打印代理启动 $BaseUrl 账号 $Username ==="
Login

$fatal = $false
while (-not $fatal) {
  try {
    $job = (Api 'POST' '/api/print/jobs/claim' @{}).data
    if ($null -ne $job) {
      try { Invoke-Job $job }
      catch { Log "处理 $($job.id) 出错：$($_.Exception.Message)" }
      continue   # 队列里可能还有，立刻再领一条，不白等一个轮询周期
    }
  } catch {
    $msg = $_.Exception.Message
    if ($script:LastApiCode -eq 403) {
      $fatal = $true
      Log "停下来了：$msg —— 这个账号没绑打印工位，改 config 里的 `$Username"
      break
    }
    Log "本轮出错（$(if ($script:LastApiCode -eq 401) {'登录态过期，重登'} else {'稍后重试'})）：$msg"
    if ($script:LastApiCode -eq 401 -or $msg -match '未登录|401') {
      try { Login } catch { Log "重登失败：$($_.Exception.Message)" }
    }
    $script:LastApiCode = 0
  }
  Start-Sleep -Seconds $PollSeconds
}

# 启动与自启（管理员 PowerShell，改成实际路径）：
#   schtasks /create /tn PrintAgent /sc onstart /ru <工位机用户名> /rl highest ^
#     /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\print-agent\print-agent.ps1"
# 注意 /ru 必须是当初存密码的那个用户，DPAPI 换用户就解不开。

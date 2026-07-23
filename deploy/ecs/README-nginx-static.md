# ECS 纯 Nginx 静态加速（FRP 只透 API）

目标：**6MB JS 从 ECS 本地出**，不再每次穿透；**API / 图片上传** 仍走 FRP 到内网 Windows Spring。

## 架构

```
浏览器
  → ECS :80  Nginx
       ├── /assets/*、index.html     → /var/www/twin/static（本地磁盘）
       └── /api/*                    → 127.0.0.1:18080 → frp → Windows :8080
  → ECS :9092  Socket.IO（仍直连 frp，与现网一致）
```

## 一、ECS 上（SSH 登录一次）

### 1. 调整 frps（隧道只绑本机）

编辑 ECS 上 `frps.toml`，与 `frps-nginx-mode.toml.example` 对齐：

```toml
proxyBindAddr = "127.0.0.1"
```

重启 frps：

```bash
systemctl restart frps   # 或你实际的启动方式
```

### 2. 安装 Nginx

```bash
cd /path/to/repo/deploy/ecs
sudo bash setup-nginx-ecs.sh
```

### 3. 安全组

| 端口 | 公网 |
|------|------|
| 80 | 放行 |
| 443 | 可选（上 HTTPS 时） |
| 8080 | **关闭**（改由 Nginx 对外） |
| 9092 | 放行（Socket.IO） |
| 7000 | frpc 连 frps（按需） |

## 二、Windows 内网 PC

### 1. 换 frpc 配置

用 `frpc-nginx-mode.toml.example` 替换或合并到 `deploy/frp_0.56.0_windows_amd64/frpc.toml`：

- Spring：`remotePort = 18080`（不再是 8080）
- 保留 `transport.tcpMux = true`

重启 frpc。

### 2. 本地 Spring 不变

仍 `start-public.bat` → 本机 **8080**。

### 3. 构建并上传静态

```powershell
cd d:\codex\verson.1.2\20260416\frontend
npm run build

cd ..
.\deploy\ecs\sync-static-to-ecs.ps1 -EcsHost 47.101.61.184 -SshUser root
# 可选：人脸模型也放 ECS，减少 /models 穿透
# .\deploy\ecs\sync-static-to-ecs.ps1 -IncludeModels
```

## 三、前端环境变量（下次 build 时）

`frontend/.env.production` 建议改为 **80 端口 / 同源**：

```env
VITE_API_BASE_URL=http://47.101.61.184
# Socket 仍 9092
# VITE_SOCKET_URL=http://47.101.61.184:9092
```

然后重新 `npm run build` + `sync-static-to-ecs.ps1`。

## 四、验证

```bash
# ECS 上：18080 仅本机可访问
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/api/public/login-branding/active

# 公网：静态本地
curl -sI http://47.101.61.184/assets/ | head -5

# 公网：API 仍通
curl -s http://47.101.61.184/api/public/login-branding/active
```

浏览器 DevTools → Network：

- `index-*.js` 来自 **:80**，Size 应有 gzip，二次访问 **from disk cache**
- `/api/*` TTFB 仍含 FRP 延迟（正常）

## 五、发版流程（之后每次）

1. `npm run build`
2. `sync-static-to-ecs.ps1`
3. 若只改后端：`mvn package` + 重启内网 jar（不必重传 static）

## 回滚

- frpc 改回 `remotePort = 8080`
- frps `proxyBindAddr = "0.0.0.0"`
- 安全组重新放行 8080
- 访问 `http://47.101.61.184:8080`

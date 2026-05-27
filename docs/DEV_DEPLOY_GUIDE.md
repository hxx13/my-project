# Twin System 开发与部署参考手册

> **定位**：覆盖从本地开发到生产部署的日常操作全流程。命令可直接复制执行。
>
> **最后更新**：2026-05-27

---

## 1. 环境要求

| 组件 | 版本 | 用途 |
|------|------|------|
| JDK | 17 | 后端编译与运行 |
| Maven | 3.9+ | 后端构建 |
| Docker Desktop | 最新 | MySQL 8.0 本地数据库 |
| Node.js | 18+ | 前端 Vite 开发服务器 |
| IntelliJ IDEA | 2024+ | 后端开发调试 |

---

## 2. 首次克隆项目后

```bash
# 1. 启动 Docker MySQL
cd d:/codex/verson.1.2/20260416
docker-compose up -d

# 2. 编译后端（首次较慢，下载依赖）
mvn clean compile

# 3. 前端安装依赖
cd frontend
npm install

# 4. 启动前端开发服务器
npm run dev
# → 浏览器访问 http://localhost:5173
# → API 请求自动代理到 http://localhost:8081
```

---

## 3. 端口全景图

```
┌─────────────────────────────────────────────────────┐
│  Vite Dev Server      :5173  (前端热更新开发)        │
│    └─ proxy /api → localhost:8081                   │
│                                                      │
│  IDEA Spring Boot     :8081  (日常调试，local profile)│
│  start.bat            :8081  (本地调试，无需 frp)         │
│                                                      │
│  start-public.bat     :8080  (对外穿透模式)          │
│    └─ frp 穿透 → ECS 47.101.61.184:8080             │
│                                                      │
│  Socket.IO (Netty)    :9092  (通知实时推送)           │
│    └─ frp 穿透 → ECS 47.101.61.184:9092             │
│                                                      │
│  Docker MySQL         :3306  (twin_system 数据库)     │
└─────────────────────────────────────────────────────┘
```

**规则**：
- **本地调试**（IDEA / start.bat）：HTTP=8081, Socket.IO=9093
- **对外穿透**（start-public.bat + frp）：HTTP=8080, Socket.IO=9092
- 两套实例可以**同时运行**，端口完全隔离
- Vite proxy 连 8081，Socket 连 9093（见 `.env.development`）
- frp 只转发 8080+9092，不碰开发端口

---

## 4. 日常开发流程

### 4.1 标准工作流

```bash
# 每次新任务前
git checkout main
git pull origin main
git checkout -b feature/xxx    # 开新分支

# 改代码...

# 改之前打备份 tag（可选但推荐）
git tag backup-before-xxx

# 提交
git add -A
git status                     # 确认改了哪些文件
git commit -m "描述做了什么改动"

# 合入 main
git checkout main
git merge feature/xxx
git push origin main

# 清理
git branch -d feature/xxx
```

### 4.2 被 AI 改崩了怎么恢复

```bash
# 方法 A — 回到之前打的 tag
git checkout backup-before-xxx    # 先看看那个时间点的代码
git checkout main
git reset --hard backup-before-xxx  # 确定恢复

# 方法 B — 用 reflog 找回
git reflog                          # 列出所有历史操作
git reset --hard <commit-hash>      # 回到崩之前的那次提交
```

### 4.3 启动开发环境

```
1. 启动 Docker MySQL（开机自启则跳过）
2. IDEA → Run TwinSystemApplication（Active profiles: local）→ 终端显示 :8081
3. cd frontend && npm run dev → 浏览器访问 http://localhost:5173
4. 开始改代码
```

---

## 5. JAR 打包与运行

### 5.1 快速启动

```bash
# === 本地调试（端口 8081，不需要 frp）===
start.bat                       # 已有 JAR，直接启动
build-and-start.bat             # 重新编译 + 启动

# === 对外穿透（端口 8080，需先启动 frp）===
start-public.bat                # 已有 JAR，直接启动
build-and-start-public.bat      # 重新编译 + 启动
```

### 5.2 frp 内网穿透

```bash
# 方式一：双击 deploy/frp_0.56.0_windows_amd64/frpc-start.bat
# 方式二：手动命令行
cd deploy\frp_0.56.0_windows_amd64
frpc.exe -c frpc.toml
```

**启动顺序**：先启动 JAR（8080），再启动 frp，公网即可通过 `http://47.101.61.184:8080` 访问。

### 5.3 手动操作

```bash
# 打包（跳过测试加速）
mvn clean package -DskipTests
# JAR 在 target/demo-0.0.1-SNAPSHOT.jar

# 调试模式启动（8081）
java -jar target/demo-0.0.1-SNAPSHOT.jar --server.port=8081

# 对外模式启动（8080）
java -jar target/demo-0.0.1-SNAPSHOT.jar --server.port=8080
```

### 5.4 IDEA 配置（一次性设置）

```
Run → Edit Configurations → Spring Boot
  → Main class: com.example.demo.TwinSystemApplication
  → Active profiles: local
  → 这样 IDEA 读取 application-local.properties，端口 = 8081
```

---

## 6. frp 穿透说明

```
[你的 PC]
  Spring Boot :8080 ──→ frpc ──→ 阿里云 ECS 47.101.61.184:7000 (frps)
                                    ├── :8080 → 后端 HTTP
                                    └── :9092 → Socket.IO
```

- frp 配置：`deploy/frp_0.56.0_windows_amd64/frpc.toml`
- 启动 frpc：`frpc.exe -c frpc.toml`
- 公网访问：`http://47.101.61.184:8080/api/...`
- **frp 连的本地端口是 8080**，所以只有 `--server.port=8080` 启动的 JAR 才会被穿透

---

## 7. 数据库备份

```bash
# 完整备份
docker exec -i twin-mysql mysqldump -uroot -pSuperAdmin@2026 --databases twin_system > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复
docker exec -i twin-mysql mysql -uroot -pSuperAdmin@2026 twin_system < backup_20260527.sql
```

---

## 8. 控制台日志管理

### 8.1 日志格式

```
14:32:01.234 INFO  [http-nio-8081-exec-1] c.e.d.m.auth.controller.AuthController : 用户 admin 登录成功
14:32:01.456 WARN  [wincc-telemetry-1] c.e.d.m.telemetry.service.TelemetryService : WinCC 读取超时
14:32:02.789 ERROR [core-task-3] c.e.d.m.twin.service.PredictionService : 推演计算失败
```

格式说明：`时间 级别 [线程] 类名 : 消息`

### 8.2 运行时控制

管理端 → 系统设置 → 控制台日志管理：

- **ROOT 级别下拉**：OFF / ERROR / WARN / INFO / DEBUG
- **分类开关**（每个模块独立控制）：
  - 孪生/门禁、遥测、大华、ARO 同步 — 默认开启
  - 门禁清洗、SQL 语句、请求流量 — 默认关闭（按需临时开启）
- 修改即时生效，**重启后恢复默认**

---

## 9. 关于 Git 分支保护

建议在 GitHub 仓库设置中开启 main 分支保护：
```
GitHub → Settings → Branches → Add branch protection rule
  Branch name pattern: main
  ☑ Require a pull request before merging
  ☑ Require approvals (1)
```

开启后，不能直接 `git push origin main`，必须通过 Pull Request 合并。这能防止误操作直接覆盖 main。

---

## 10. 后续分离部署预备

当前所有模块在一个 JAR 中运行。后续如需将小程序后端与门禁后端分离部署：

### 10.1 部署角色配置（预留）

```properties
# 公网服务器 — 只启对外的模块
app.deploy-role=PUBLIC
app.enabled-modules=auth,me,mp,repair,purchase,supplies,chat,upload,notification

# 边缘 PC — 只启硬件相关模块
app.deploy-role=EDGE
app.enabled-modules=telemetry,dahua,accessrule,accessfusion,twin
```

### 10.2 站点实例表（预留）

多 LAN 场景下，每个物理站点一条记录：

```sql
CREATE TABLE site_instance (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    site_code VARCHAR(32) NOT NULL UNIQUE COMMENT 'PUDONG / PUXI / ...',
    site_name VARCHAR(64) NOT NULL,
    wincc_base_url VARCHAR(256),
    wincc_username VARCHAR(64),
    wincc_password VARCHAR(128),
    dahua_api_base VARCHAR(256),
    dahua_app_key VARCHAR(128),
    dahua_app_secret VARCHAR(128),
    enabled TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT NOW()
);
```

---

## 11. 常见问题

| 问题 | 解决 |
|------|------|
| 端口 8080 被占用 | `netstat -ano \| findstr 8080` 找到 PID 后 `taskkill /PID xxx` |
| IDEA 启动报端口冲突 | 检查是否已有一个 JAR 在 8081 运行 |
| 前端 API 请求 404 | 确认 Vite proxy target 端口和 IDEA 实际端口一致 |
| Docker MySQL 没启动 | `docker-compose up -d` |
| 启动 start.bat 后网站不通 | 检查是否误用了 start.bat（8081）。对外访问须用 start-public.bat（8080）+ frp |
| frp 连不上 | 检查 ECS 安全组是否放行 7000/8080/9092 |
| 日志刷屏太快 | 管理端 → 控制台日志 → ROOT 级别切 WARN |

---

## 12. 关联文档

- [后端底层架构规范](ARCHITECTURE_BACKEND.md) — 不可变的架构基线
- [Web 前端参考架构](ARCHITECTURE_FRONTEND_WEB.md)
- [小程序参考架构](ARCHITECTURE_FRONTEND_MP.md)
- [技术改造路线](IMPROVEMENT_ROADMAP.md)

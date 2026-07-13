# 客户端版本管理与自动刷新方案 v2.2

## 元信息

- 日期：2026-07-13
- 状态：设计中
- 范围：全栈（后端 Java + 前端 React TypeScript）
- v1.0 评审：5 项架构修正 + 9 项补充 + 8 项优化，全部纳入 v2.0
- v2.0 评审：3 项修复 + 4 项补充，纳入 v2.1
- v2.1 评审：1 项修复（格式一致性）+ 4 项细节补充，纳入 v2.2

---

## 1. 目标

1. **稳定刷新**：管理员触发后，活跃标签页 <1s（WebSocket 快速通道），后台/断线标签页 ≤35s（15s 轮询 + 20s 倒计时兜底）
2. **自动版本同步**：部署新前端 → 旧页面自动检测版本不匹配 → 自动刷新，无需人工干预
3. **用户友好**：刷新前给倒计时横幅 + "稍后提醒"选项，不丢失用户正在编辑的数据
4. **可观测**：管理员能看到版本分布、刷新效果、客户端行为，刷新事件有审计日志
5. **通道互补**：WebSocket 负责速度，HTTP 轮询负责可靠性，两者共存而非二选一

---

## 2. 核心机制

### 2.1 架构原则：双通道互补

```text
┌─────────────────────────────────────────────────────────┐
│                    刷新触发双通道                          │
│                                                         │
│  WebSocket 快速通道（保留、增强）                          │
│  ├─ 活跃标签页：毫秒级收到 CLIENT_FORCE_RELOAD            │
│  ├─ 后台标签页：可能延迟（浏览器节流 setTimeout）          │
│  └─ 断线重连中：可能错过广播                              │
│                                                         │
│  HTTP 轮询 可靠兜底（新增）                               │
│  ├─ 所有标签页：15s 内必然检测到                          │
│  ├─ 后台标签页：setInterval 被节流但 fetch() 不受影响      │
│  └─ 断线重连中：HTTP 请求独立于 WebSocket 连接状态         │
│                                                         │
│  防重复：sessionStorage '__last_reload_id' 守卫             │
│  → 两个通道同时命中同一 reloadId 指令，只执行一次刷新         │
└─────────────────────────────────────────────────────────┘
```

**为什么不二选一？** WebSocket 对活跃标签页是毫秒级（大屏实时刷新体验无可替代），HTTP 轮询对后台/断线标签页是兜底（弥补 WebSocket 的唯一短板）。两者各司其职，`sessionStorage` 守卫天然防止重复刷新。

### 2.2 版本标识链路

**build-meta.json schema（正式定义）**：

```json
{
  "buildId": "1765432100000",
  "buildTime": "2026-07-13T10:00:00"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `buildId` | String | 构建唯一标识，与前端 `__BUILD_ID__` 完全一致 |
| `buildTime` | String | ISO 8601 构建时间，仅用于 UI 展示和审计，不参与比较逻辑 |

**buildId 格式**：`${Date.now()}`（Unix 毫秒时间戳字符串）。仅做相等比较，不需要 semver 语义。如需在监控页面展示可读格式，从 `buildTime` 字段获取。

**版本链路**：

```text
Vite build (frontend/)
  ├─ buildId = String(Date.now())  例如 "1765432100000"
  ├─ 注入前端 JS:      __BUILD_ID__ = "1765432100000"
  └─ 输出到 build dist: dist/build-meta.json → { "buildId": "1765432100000", "buildTime": "..." }

Vite build.outDir = ../src/main/resources/static/
  → build-meta.json 随构建产物一同复制到 static 目录

后端启动 (@PostConstruct)
  └─ 从 classpath 读取 build-meta.json → 缓存 expectedBuildId
     如果文件不存在 → "unknown"
     只读一次，不每次请求都读 classpath

前端轮询 GET /api/client-version
  └─ 返回 { buildId: expectedBuildId, reloadId: 0, forceReloadAt: null }
```

**与 v1.0 的区别**：`forceReloadAt` 的比较不再用 ISO 时间戳精确字符串匹配，改用单调递增的 `reloadId`（见 §3.1）。时间戳仅用于 UI 展示。

### 2.3 三种触发路径

| 触发场景 | 快速通道 (WS) | 可靠通道 (HTTP 轮询) | 检测方式 |
|----------|-------------|---------------------|---------|
| 部署新前端 + 重启后端 | — | 15s 内检测 | 前端 `APP_BUILD_ID` ≠ 后端 `buildId` |
| 管理员点"同步在线页" | <1s (WebSocket 广播) | 15s 内检测 | 后端 `reloadId` > 前端已知 `lastReloadId` |
| 后端重启 (无新部署) | — | 15s 内检测 | WebSocket 重连 + 轮询确认版本一致 → 无需刷新 |

**关于 `serverStartupAt`**：部署新前端必然伴随重启 → `buildId` 必然变化。仅重启不部署时，版本一致 → 无需刷新。无需独立的重启检测字段。

---

## 3. 后端设计

### 3.1 新增：ClientVersionService

**位置**：`src/main/java/com/example/demo/modules/twin/common/service/ClientVersionService.java`

**职责**：
- 从 classpath 读取 `build-meta.json` 获取 `expectedBuildId`
- 管理 `reloadId`（单调递增序列号，每次 triggerForceReload 时 +1）
- 管理 `forceReloadAt`（ISO 时间戳，仅用于 UI 展示和 TTL 判断）
- 收集客户端版本上报数据用于统计

**核心数据结构**：

```text
// 请求体 — 前端每次轮询上报
ClientPollRequest {
  clientId: String,        // 前端生成的 UUID (localStorage)，用于去重统计
  clientBuildId: String,   // 客户端当前 APP_BUILD_ID
  channel: String | null,  // "web" | "mobile" | null，用于区分端
}

// 响应体 — 返回给前端
ClientVersionResponse {
  buildId: String,         // 服务端期望版本
  reloadId: long,          // 当前 reload 序列号（单调递增）
  forceReloadAt: String | null  // 最近一次 reload 指令的时间戳（ISO 8601，仅展示用）
}

// 内存统计记录 — 后端维护，不持久化
ClientPollRecord {
  clientId: String,
  clientBuildId: String,
  channel: String,
  lastSeenAt: Instant,
}

// 监控页统计响应
ClientVersionStats {
  expectedBuildId: String,
  reloadId: long,
  forceReloadAt: String | null,
  lastReloadTriggeredBy: String | null,
  lastReloadTriggeredAt: String | null,
  totalClients: int,
  upToDate: int,
  outdated: int,
  distribution: Map<String, Integer>,  // buildId → count
}
```

**核心方法**：

```text
getClientVersion(clientId: String, clientBuildId: String, channel: String)
  → ClientVersionResponse
  供 GET /api/client-version 调用，无需登录。
  同时将 clientId + clientBuildId + channel 记入内存统计（TTL 2 分钟未上报自动清除）。

triggerForceReload(operatorUserId: String)
  → { ...ClientVersionResponse, stats: ClientVersionStats }
  reloadId += 1，forceReloadAt = now，记录审计日志，通过 WebSocket 广播 CLIENT_FORCE_RELOAD，
  返回当前客户端版本分布。

getVersionStats()
  → ClientVersionStats
  供监控页面调用，ADMIN 权限。

cleanupStaleClients()
  后台定时任务（每 60 秒）：清除 2 分钟内未上报的 clientId。
```

**reloadId 生命周期**：
- 初始值：0（后端启动时）
- 递增：每次 `triggerForceReload` 调用时 `reloadId++`
- 比较：前端本地存储 `lastKnownReloadId`，检测到 `reloadId > lastKnownReloadId` 时触发刷新
- 不受时钟偏差影响（单调递增整数，不依赖 NTP 同步）

**forceReloadAt 生命周期**：
- 设置：管理员触发时置为当前 ISO 时间戳
- 清除：设置后 10 分钟自动过期（仅清除 forceReloadAt，reloadId 保持不变）
- UI 用途：在 GracefulReloadBanner 和监控页面展示"上次刷新指令时间"

**客户端统计存储**：
- 后端维护 `ConcurrentHashMap<String, ClientPollRecord>`，key 为 clientId
- 每次 `getClientVersion` 调用更新对应记录的 `lastSeenAt`
- 统计时排除 2 分钟以上未上报的过期记录
- **准确性声明**：这是近似估算，非精确计数。NAT 下多个标签页不同 clientId 不会被错误合并，但极端情况下同一标签页因 localStorage 丢失重新生成 clientId 会被重复计数

### 3.2 新增：GET /api/client-version

**公开接口，无需认证**。

```
GET /api/client-version?clientId=xxx&clientBuildId=yyy&channel=web

Response:
{
  "buildId": "1765432100000",
  "reloadId": 3,
  "forceReloadAt": "2026-07-13T10:05:00"
}
```

**速率限制**：per-IP 每分钟最多 120 次。超过限制返回 HTTP 429。

| 场景 | 请求频率 | 是否超限 |
|------|---------|---------|
| 1 个浏览器 3 个标签页 | ~12/min | ✅ |
| 办公室 5 台电脑各 2 个标签页 | ~40/min | ✅ |
| 教室 30 台电脑各 1 个标签页 | ~120/min | ✅ 刚好 |

在 Spring Security 或 Filter 层实现，使用内存计数（Guava RateLimiter 或自定义 `ConcurrentHashMap` 令牌桶）。如果企业内网出口 IP 单一且用户量大，可在配置中对内网 IP 段（如 `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）放宽限制或完全放行。

**缓存控制**：响应头 `Cache-Control: no-store`，确保 CDN/反向代理不缓存此响应。

**隐私说明**：`clientBuildId` 参数通过 query string 传递（公开接口），当前值仅为 Unix 毫秒时间戳，不属于敏感信息。如果未来 buildId 嵌入 git hash 或其他可识别信息，应改为 POST body 或 `X-Client-Build-Id` Header 传递以避免出现在访问日志中。

### 3.3 修改：POST /api/admin/settings/broadcast-client-reload

**接口路径不变，内部增加调用链。操作顺序必须严格保证**（顺序错误会导致 WebSocket payload 携带旧的 reloadId，快通道失效）：

```text
triggerForceReload(operatorUserId) 操作顺序（不可调换）：

① reloadId++                              // 先递增，后续所有操作使用新值
② forceReloadAt = Instant.now()           // 记录触发时间
③ 构造 WebSocket payload（含新 reloadId）  // 用递增后的 reloadId
④ ClientReloadBroadcastService            // WebSocket 广播快速通道
     .broadcastForceReload(operatorId, reloadId)
⑤ 记录审计日志                            // log 含新 reloadId
⑥ 统计客户端版本分布                       // getVersionStats()
⑦ 返回 { ...ClientVersionResponse, stats } // 含新 reloadId

⚠️ 如果先统计再递增，第④步 payload 和第⑦步返回值中的 reloadId 将是旧值，
   前端收到后与 sessionStorage 中基线相同 → 不触发刷新。整个双通道退化到 HTTP 轮询。
```

**调用链**：

```text
AdminSettingsController.broadcastClientReload()
  → ClientVersionService.triggerForceReload(operatorId)
    → 按上述顺序执行
    → 返回 { buildId, reloadId, forceReloadAt, stats }
```

返回内容增强：
```json
{
  "buildId": "1765432100000",
  "reloadId": 3,
  "forceReloadAt": "2026-07-13T10:05:00",
  "stats": {
    "expectedBuildId": "1765432100000",
    "totalClients": 12,
    "upToDate": 3,
    "outdated": 9,
    "distribution": {
      "1765432100000": 3,
      "1765000000000": 9
    }
  }
}
```

### 3.4 新增：GET /api/v1/monitor/client-versions

**ADMIN 权限**。返回当前客户端版本分布。

```json
{
  "expectedBuildId": "1765432100000",
  "reloadId": 3,
  "forceReloadAt": null,
  "lastReloadTriggeredBy": "hxx13",
  "lastReloadTriggeredAt": "2026-07-13T10:05:00",
  "totalClients": 12,
  "upToDate": 8,
  "outdated": 3,
  "distribution": {
    "1765432100000": 8,
    "1765000000000": 3,
    "dev": 1
  },
  "pollingClientsLastMinute": 12
}
```

### 3.5 修改：ClientReloadBroadcastService（保留，增强 payload）

**不删除**。保留 WebSocket 广播作为快速通道。关键修改：**payload 必须包含 `reloadId`**（否则前端无法验证，快速通道形同虚设）。

**修改后的广播 payload**：

```text
// broadcastForceReload(operatorUserId, reloadId) — 广播给当前已连接客户端
{
  "reason": "admin",
  "at": "2026-07-13T10:05:00",
  "operatorUserId": "42",
  "reloadId": 3          // ← 新增！前端据此判断是否已处理过
}

// ConnectListener pending reload 补发 — 客户端重连后补发
{
  "reason": "admin-pending",
  "at": "2026-07-13T10:05:00",
  "requestedAt": "2026-07-13T10:00:00",
  "reloadId": 3          // ← 新增！注意：用的是当前 ClientVersionService.reloadId，
                         //    不是广播时的历史值。客户端重连时已有新的 reloadId。
}
```

**实现要点**：
- `ClientReloadBroadcastService` 需要注入或通过方法参数获取当前的 `reloadId`（从 `ClientVersionService` 查询）
- `broadcastForceReload(String operatorUserId, long reloadId)` — 方法签名增加 reloadId 参数
- pending reload 补发时，ConnectListener 调用 `ClientVersionService.getCurrentReloadId()` 获取当前值（而非广播时的旧值）——客户端重连时 reloadId 可能已再次递增

**保留**：
- pending reload 窗口 + ConnectListener（5 分钟补发）
- 广播逻辑

**移除**：
- `isReloadPending()` 方法（监控改为调 `ClientVersionService.getVersionStats()`）
- 独立的 `@PreDestroy`（无状态需要清理）

WebSocket 快速通道是活跃标签页 <1s 刷新的保证，不应废弃。

### 3.6 修改：FrontendVersionGuard（保留，增强 payload）

**不删除**。WebSocket 连接时单发版本检查作为第一道防线：

- **增加**：读取 `build-meta.json` 中的 `buildId` 替代手动配置的 `app.frontend.expected-version`
- **增加**：payload 包含 `expectedBuildId` + `reloadId`，前端据此直接比较版本号
- **payload**：
  ```json
  {
    "reason": "version-mismatch",
    "expectedBuildId": "1765432100000",
    "reloadId": 3,
    "at": "2026-07-13T10:05:00"
  }
  ```
  `expectedBuildId` 让前端直接比较 `APP_BUILD_ID`（不依赖 reloadId 逻辑）；`reloadId` 保证与轮询通道共用同一守卫体系
- **保留**：连接时版本不匹配 → 向该客户端单发 `CLIENT_FORCE_RELOAD`
- **移除**：对 `app.frontend.expected-version` 配置的依赖

### 3.7 审计日志

每次 `triggerForceReload` 时记录：

```text
[client-reload] ACTION=trigger operatorUserId=42 operatorIp=10.0.0.5
  expectedBuildId=1765432100000 reloadId=3 totalClients=12 outdated=9
```

每次客户端因 buildId 不匹配自动刷新时（通过下一次轮询的 clientBuildId 变为最新可推断）记录：

```text
[client-reload] ACTION=auto-reload clientBuildId=1765000000000
  expectedBuildId=1765432100000 reloadId=2 channel=web
```

使用 SLF4J `log.info()` 即可。生产环境通过日志采集系统查询。

---

## 4. 前端设计

### 4.1 Build ID 自动写入

**修改 `vite.config.ts`**，添加自定义插件在构建完成时将 buildId 写入 dist 目录：

```text
// 构建时:
//   1. 生成 buildId = mode === 'production' ? `${Date.now()}` : 'dev'
//   2. 注入到 define.__BUILD_ID__
//   3. writeBundle 阶段写 dist/build-meta.json: { buildId, buildTime }
//
// 因为 build.outDir = ../src/main/resources/static，
// build-meta.json 随构建产物自动出现在后端 classpath 中。
// 后端无需知道前端目录结构，只从 classpath 读取。
```

**解耦点**：Vite 只负责写到自己的 `dist/`（即 `outDir`），后端从 classpath 读。如果未来改为独立部署 JAR，只要构建流程保证 `build-meta.json` 出现在 classpath 的 static 目录下即可。

### 4.2 新增：useClientVersionPoll Hook

**位置**：`frontend/src/hooks/useClientVersionPoll.ts`

**职责**：周期性轮询版本信息，检测需要刷新的条件，触发 GracefulReloadBanner。

**核心逻辑**：

```text
初始化：
  clientId = localStorage.getItem('__client_id') || crypto.randomUUID()
  localStorage.setItem('__client_id', clientId)

首次轮询（sessionStorage 无 __last_reload_id 时）：
  → 不应用 reloadId 检查！
  → 仅记录基线：sessionStorage.setItem('__last_reload_id', String(response.reloadId))
  → buildId 检查照常执行（首次访问就应该检查版本是否匹配）

  原因：如果 sessionStorage 没有该 key（首次打开页面、清除会话），
  默认值为 0。此时后端 reloadId 可能为 3（管理员在 2 小时前触发过）。
  3 > 0 → 误触发刷新，文案显示"管理员请求了页面同步"——不合理。
  新打开的页面不应响应历史的管理员指令。

后续轮询（sessionStorage 已有 __last_reload_id）：
  GET /api/client-version?clientId={clientId}&clientBuildId={APP_BUILD_ID}&channel=web

  成功 →
    1. 检查 APP_BUILD_ID ≠ response.buildId → 触发刷新 (reason: "version-mismatch")
    2. 检查 response.reloadId > lastReloadId → 触发刷新 (reason: "admin-command")
       (lastReloadId = parseInt(sessionStorage.getItem('__last_reload_id'))
    3. 都不满足 → 无事发生，重置退避计数

  失败 →
    按退避策略延长间隔（不触发刷新）

触发刷新 →
  1. 更新 sessionStorage: __last_reload_id = response.reloadId
  2. 显示 GracefulReloadBanner（reason 决定展示文案）
```

**轮询间隔（可通过环境变量覆盖）**：

| 层级 | 默认值 | 环境变量 |
|------|--------|---------|
| 正常间隔（visible） | 15 秒 | `VITE_POLL_INTERVAL_NORMAL` |
| 轻度退避（连续失败 3 次） | 90 秒 | `VITE_POLL_INTERVAL_BACKOFF_1` |
| 重度退避（连续失败 6 次） | 300 秒 | `VITE_POLL_INTERVAL_BACKOFF_2` |
| 后台标签页（hidden） | 120 秒 | `VITE_POLL_INTERVAL_HIDDEN` |

**visibilityState 智能调节**：

```text
document.visibilityState === 'visible' → 15 秒
document.visibilityState === 'hidden'  → 120 秒

visibilitychange 事件：hidden → visible 时
  → 如果距上次成功轮询 > 30 秒 → 立即轮询一次
  → 重置为 15 秒间隔
```

**online/offline 事件处理**：

```text
window.addEventListener('offline', () => 暂停轮询，保留当前退避状态)
window.addEventListener('online', () => 立即轮询一次，重置退避计数，恢复正常间隔)

说明：浏览器 offline 时 fetch() 会立即失败（不等待 timeout），
不加此处理会快速消耗退避次数进入 5 分钟重度退避。
网络恢复时用户要等数分钟才会再次轮询。
```

**Broadcast Channel API 多标签页协调**：

```text
// 同源标签页共享刷新状态
const channel = new BroadcastChannel('__client_version_sync');

标签页 A 检测到需要刷新 →
  1. 显示 GracefulReloadBanner
  2. channel.postMessage({ type: 'reload-imminent', reloadId, reason })

标签页 B/C/D 收到消息 →
  1. 同步 lastReloadId（避免自己轮询时再次触发）
  2. 显示同步的 GracefulReloadBanner

注意：每个标签页的倒计时独立运行（用户可能在不同标签页有不同操作），
但 banner 内容保持一致。
```

**防重复刷新守卫**：

```text
守卫 1（buildId 不匹配）：reload 后新页面的 APP_BUILD_ID 匹配 → 不触发。无需额外守卫。

守卫 2（reloadId 递增）：sessionStorage('__last_reload_id') ≥ response.reloadId → 跳过。
  reload 后 sessionStorage 保留 → 新页面读到相同 reloadId → 不重复触发。

守卫 3（全局冷却）：sessionStorage('__page_load_at') 记录页面加载时间。
  加载 < 8 秒的页面跳过所有刷新触发（防御编程，兜底极端时钟/并发场景）。
```

### 4.3 新增：GracefulReloadBanner 组件

**位置**：`frontend/src/components/GracefulReloadBanner.tsx`

**职责**：当检测到需要刷新时，在页面顶部显示倒计时横幅。

**行为**：

```text
触发条件：useClientVersionPoll 检测到需要刷新

根据 reason 展示不同文案：
  "version-mismatch" → "检测到系统更新，建议刷新页面获取最新版本"
  "admin-command"    → "管理员请求了页面同步，即将自动刷新"

┌──────────────────────────────────────────────────────────────┐
│ 🔄 检测到系统更新，页面将在 20 秒后自动刷新                    │
│ 请保存正在进行的工作               [稍后提醒]  [立即刷新]      │
└──────────────────────────────────────────────────────────────┘

倒计时：20 → 0，每秒递减
"立即刷新"：点击立刻执行 location.reload()
"稍后提醒"：延迟 120 秒再弹（仅允许延期一次，防止无限推迟）
倒计时归零：自动执行 location.reload()

挂载位置：App.tsx 根层级
  → position: fixed; top: 0; left: 0; right: 0
  → z-index: var(--z-sticky)（低于 modal 的 var(--z-modal)）
  → 不阻挡对话框/弹窗操作

a11y：role="alert" + aria-live="polite"，屏幕阅读器自动朗读
prefers-reduced-motion：倒计时数字变化禁用动画，直接跳变
```

**关于表单脏状态检测**（v1.0 的错误方案——已移除）：

v1.0 提议"检测未保存表单自动延长倒计时"。这在 SPA 中不可行——表单状态分散在各页面/组件中，无法全局可靠检测。替代方案：始终提供"稍后提醒"按钮，让用户自己判断是否需要保存。这比不可靠的自动检测更实用。

### 4.4 新增：ClientVersionCard（监控页面集成）

**位置**：`MonitorHealthCards.tsx` → 新增组件，放在 `ActiveSessionsSection` 上方

**4 种展示状态**：

**状态 A：正常（有客户端在线，全部最新）**
```text
┌────────────────────────────────────────────┐
│ 客户端版本状态                              │
├────────────────────────────────────────────┤
│ 期望版本    1765432100000             │
│ 活跃客户端  12                 ✅ 全部最新   │
│                                               │
│ 版本分布                                      │
│ ████████████ 最新 (12)                        │
│                                               │
│ 上次同步指令  — 无记录 —                       │
└────────────────────────────────────────────┘
```

**状态 B：正常（有客户端在线，部分过时）**
```text
┌────────────────────────────────────────────┐
│ 客户端版本状态                   [同步在线页] │
├────────────────────────────────────────────┤
│ 期望版本    1765432100000             │
│ 活跃客户端  12                               │
│                                               │
│ 版本分布                                      │
│ ████████████ 最新 (8)                         │
│ ██████ 旧版   (3)                             │
│ ██ dev        (1)                             │
│                                               │
│ 上次同步指令  2026-07-13 10:05  hxx13 触发    │
│ 刷新状态      8/12 已更新 (3台待刷新)          │
└────────────────────────────────────────────┘
```

**状态 C：空状态（无客户端）**
```text
┌────────────────────────────────────────────┐
│ 客户端版本状态                              │
├────────────────────────────────────────────┤
│ 期望版本    1765432100000             │
│                                               │
│ ○ 暂无客户端在线                              │
│   客户端上线后将自动出现在此列表中              │
└────────────────────────────────────────────┘
```

**状态 D：异常状态（build-meta.json 缺失）**
```text
┌────────────────────────────────────────────┐
│ 客户端版本状态                              │
├────────────────────────────────────────────┤
│ ⚠ 版本信息不可用                            │
│   未找到 build-meta.json，请检查前端部署      │
│   是否完整。客户端自动刷新功能暂时不可用。     │
└────────────────────────────────────────────┘
```

**交互**：
- "同步在线页"按钮（仅状态 B 显示，SUPER_ADMIN 可见）：
  → 确认对话框显示："预计影响 3 台客户端，建议先确认新版本已部署完成"
  → 调用 `POST /api/admin/settings/broadcast-client-reload`
  → 成功 toast："已通过 WebSocket + 轮询双通道下发刷新指令"
  → 失败 toast：显示错误信息
- 数据刷新频率：60 秒自动轮询 `GET /api/v1/monitor/client-versions`
- 版本分布条形图：每行可点击展开查看该版本的 clientId 列表（哈希脱敏）

### 4.5 修改：App.tsx GlobalSocketListener

**新增**：
- 挂载 `useClientVersionPoll()` 启动轮询
- 挂载 `<GracefulReloadBanner />`

**保留（不删除）**：
- `CLIENT_FORCE_RELOAD` 事件的 socket listener → 这是快速通道
- visibilitychange 的 `socket.connect()` 补丁 → 仍然有用，保证切回标签页时 WebSocket 快速重连

**修改**：
- `CLIENT_FORCE_RELOAD` 处理逻辑改为双重判断，覆盖两种 WebSocket 触发源：

```text
socket.on('CLIENT_FORCE_RELOAD', (payload) => {
  // 情况 1：版本不匹配（来自 FrontendVersionGuard，连接时单发）
  // payload.expectedBuildId 存在 且 ≠ APP_BUILD_ID → 触发
  if (payload.expectedBuildId && payload.expectedBuildId !== APP_BUILD_ID) {
    // 同步写入 __last_reload_id（即使当前触发不依赖它），
    // 使 WebSocket 通道自洽：reload 后新页面通过 sessionStorage 残留值防止
    // pending reload 补发再次触发，而非依赖轮询通道的首次基线逻辑
    if (payload.reloadId) {
      sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
    }
    showBanner('version-mismatch');
    return;
  }

  // 情况 2：管理员指令（来自 ClientReloadBroadcastService 广播/pending reload）
  // payload.reloadId > lastReloadId → 触发
  const lastReloadId = parseInt(sessionStorage.getItem('__last_reload_id') || '0');
  if (payload.reloadId && payload.reloadId > lastReloadId) {
    sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
    showBanner('admin-command');
    return;
  }

  // 其他：忽略（已处理过的重复广播、pending reload 补发等）
});
```

这样 WebSocket 快速通道的两个触发源（版本不匹配 + 管理员指令）各有独立的判断逻辑，且与 HTTP 轮询通道共用 `sessionStorage` 守卫体系。

### 4.6 修改：useSocket.ts

**保留所有现有逻辑**，不删除 visibilitychange 监听器。

**新增**：`reconnect` 事件中触发一次即时版本轮询（可选优化）：

```text
socket.on('reconnect', () => {
  // 重连成功后立即检查版本（可能与 pending reload 窗口交叉）
  // 使用 ClientVersionService 的 getClientVersion 静默检查
  // 如果 reloadId 变了 → 表示错过了广播 → 触发刷新
});
```

### 4.7 修改：ClientReloadOpsPanel

**保留**系统设置页的"同步在线页"按钮。改为调用新 API 并显示返回的 stats（如："已发送，12 台中 9 台待刷新"）。

---

## 5. 浏览器缓存策略（关键）

### 5.1 index.html 缓存控制

`location.reload()` 后浏览器必须向服务器重新验证 `index.html`，否则可能加载缓存的旧 HTML → 旧 JS 引用 → 刷新无效。

**服务端措施**：
- `SpaIndexNoCacheFilter`（已有）设置 `Cache-Control: no-cache, no-store, must-revalidate` → 继续保留
- 确认该 Filter 覆盖 `/` 和 `/index.html` 路径

**CDN / 反向代理措施**（如果前端有 CDN 层）：
- `index.html` 在 CDN 侧的缓存策略设为 `Cache-Control: max-age=0, must-revalidate` 或不缓存
- `/api/client-version` 响应设 `Cache-Control: no-store`（CDN 通常不缓存 `/api/` 路径，但显式设置更安全）
- 静态资源（`/assets/*.js`）使用 Vite 生成的 content hash 文件名 → 可以长期缓存（`max-age=31536000, immutable`）

### 5.2 reload 后加载链路

```text
location.reload()
  → 浏览器带 Cache-Control: max-age=0 请求 index.html
  → 反向代理/CDN 必须回源验证
  → 后端返回新 index.html（含新 JS hash 文件名）
  → 浏览器加载新 JS → 新 APP_BUILD_ID
  → 下次轮询：APP_BUILD_ID 匹配 → 不再触发刷新 ✅
```

如果 CDN 缓存了旧的 `index.html`，整个机制形同虚设。必须在部署流程中确保 CDN 的 `index.html` 缓存被清除或回源。

---

## 6. 多标签页行为

### 6.1 默认行为

同源多个标签页各自独立运行 `useClientVersionPoll`：
- 每个标签页有独立的 `clientId`（UUID 存 `localStorage` → 所有标签页共享同一 clientId）
- 每个标签页独立轮询，独立显示 GracefulReloadBanner
- 用户在标签页 A 关闭 banner 不影响标签页 B

### 6.2 可选优化：Broadcast Channel 协调

当标签页 A 检测到需要刷新时，通过 `BroadcastChannel('__client_version_sync')` 通知标签页 B/C/D。其他标签页收到后同步 `lastReloadId` 并显示各自的 banner。

**注意**：不强制同步 banner 的关闭行为——用户可能在标签页 A 正在编辑不想刷新，在标签页 B 可以立即刷新。各自独立决策。

### 6.3 clientId 设计

`clientId` 存 `localStorage`（非 `sessionStorage`）：
- 所有同源标签页共享同一 clientId → 后端统计更准确（1 个浏览器 = 1 个客户端）
- 关闭所有标签页后不丢失 → 重新打开时 clientId 不变
- 清除浏览器数据后重新生成 → 可接受的误差

---

## 7. 关键场景验证

### 场景 1：部署新前端 + 重启后端

```text
T+0s    后端关机
        → WebSocket 断开 → Socket.IO 开始重连
        → 轮询 GET /api/client-version → 网络错误 → 进入退避
        → 页面继续正常工作（SPA 不依赖后端）

T+5s    后端启动
        → 读 build-meta.json → expectedBuildId = "new-456"
        → reloadId = 0（新进程）
        (旧前端 APP_BUILD_ID = "old-123")

T+5~15s 活跃标签页 WebSocket 重连成功
        → FrontendVersionGuard：连接参数 v="old-123" ≠ expectedBuildId="new-456"
        → 单发 CLIENT_FORCE_RELOAD → GracefulReloadBanner 弹出 ✅（快速通道生效）

T+15s   后台标签页轮询成功（最坏情况）
        → buildId="new-456" ≠ 自己的 "old-123"
        → GracefulReloadBanner 弹出 ✅（轮询兜底生效）

T+35s   倒计时归零 → location.reload()
        → 新页面加载（APP_BUILD_ID = "new-456"）
        → 第一次轮询：buildId 匹配 ✅
        → WebSocket 重连成功 ✅
        → 正常运作
```

### 场景 2：管理员手动"同步在线页"（仅重启后端，无新部署）

```text
场景说明：buildId 未变化（同一版本），但需要所有页面刷新（如清缓存、重置状态）

T+0s    管理员点"同步在线页"
        → POST /broadcast-client-reload
        → reloadId: 0 → 1，forceReloadAt = now
        → WebSocket 广播 CLIENT_FORCE_RELOAD (含 reloadId=1)

T+0s    活跃标签页通过 WebSocket 收到
        → reloadId=1 > lastReloadId=0 → GracefulReloadBanner ✅

T+0~15s 后台标签页通过轮询检测
        → reloadId=1 > lastReloadId=0 → GracefulReloadBanner ✅

守卫验证：
  → 活跃标签页同时从 WebSocket 和轮询收到 → sessionStorage 守卫防重复
  → reload 后新页面 lastReloadId = 1 → 不再触发 ✅
```

### 场景 3：后台标签页恢复

```text
后台标签页（被浏览器节流 setInterval）：

WebSocket 通道 — 可能失效：
  → setTimeout 被节流到 60s+ → 重连退避缓慢
  → visibilitychange → socket.connect() 补丁（保留）→ 加速重连

HTTP 轮询通道 — 仍然有效：
  → fetch() 不受节流影响 → 15s 内完成请求
  → 但 hidden 状态下轮询间隔自动调整为 120s

用户切回标签页（hidden → visible）：
  → visibilitychange 触发 → 距上次成功 > 30s → 立即轮询
  → 检测到 buildId 不匹配或 reloadId 递增 → banner 弹出
  → 用户看到倒计时 → 立即可操作
```

### 场景 4：回滚部署

```text
部署 new-456 → 发现问题 → 回滚到 old-123

已刷新到 new-456 的客户端：
  → 轮询发现 buildId="old-123" ≠ 自己的 "new-456"
  → 再次触发 GracefulReloadBanner → 刷新到 old-123 ✅

尚未刷新的客户端（还在 old-123）：
  → 轮询发现 buildId="old-123" = 自己的 "old-123"
  → 无事发生 ✅

频繁部署+回滚期间：每次 buildId 变化都会触发刷新。
这是预期行为——回滚就是一次新的部署。
运维应避免在业务高峰期频繁部署。
```

### 场景 5：客户端 offline → online

```text
笔记本休眠/断网 (offline)：
  → fetch() 立即失败（不等 timeout）
  → online 事件处理器：暂停轮询，保持退避状态

网络恢复 (online)：
  → online 事件处理器：立即执行一次轮询
  → 无论结果如何，重置退避计数
  → 恢复正常 15s 间隔

如果没有 online 事件处理：
  → fetch() 快速失败 3 次 → 90s 退避
  → 再失败 3 次 → 300s 退避
  → 用户网络恢复后要等 5 分钟 → 糟糕体验
```

---
n### 场景 6：全新用户首次打开页面（reloadId > 0 但不触发）

```text
前提：管理员 2 小时前触发过同步 → reloadId = 3。forceReloadAt 已过期（10 分钟 TTL）。

新用户打开页面：
  → sessionStorage 无 __last_reload_id
  → 首次轮询 GET /api/client-version
    → buildId 匹配 → 不触发 ✅
    → reloadId 检查：sessionStorage 无 key → 跳过，仅记录基线 ✅
    → sessionStorage.setItem('__last_reload_id', '3')
  → 页面不刷新，正常使用

10 分钟后管理员再次触发同步 → reloadId 3→4：
  → 后续轮询：reloadId=4 > lastReloadId=3 → 触发 GracefulReloadBanner ✅

如果首次访问不做基线设置：
  → lastReloadId = parseInt(undefined || '0') = 0
  → reloadId=3 > 0 → 误触发刷新
  → 用户看到"管理员请求了页面同步"（但管理员根本没操作）→ 困惑，体验糟糕
```


## 8. 测试策略

| 层级 | 内容 | 关键断言 |
|------|------|---------|
| 单元测试 | `ClientVersionService.getClientVersion()` | 返回正确的 buildId；reloadId 初始为 0 |
| 单元测试 | `ClientVersionService.triggerForceReload()` | reloadId 递增；forceReloadAt 被设置；审计日志输出 |
| 单元测试 | `ClientVersionService.cleanupStaleClients()` | 过期客户端被清除；活跃客户端保留 |
| 单元测试 | `ClientVersionService` forceReloadAt TTL 过期 | 10 分钟后 forceReloadAt 变 null；reloadId 不变 |
| 集成测试 | `GET /api/client-version`（无 build-meta.json） | buildId="unknown"，不抛异常 |
| 集成测试 | `GET /api/client-version`（有 build-meta.json） | buildId 正确返回 |
| 集成测试 | `GET /api/client-version` 速率限制 | 超过 120 次/分钟后返回 429 |
| 集成测试 | `POST /broadcast-client-reload`（SUPER_ADMIN） | 200 + stats；reloadId 递增 |
| 集成测试 | `POST /broadcast-client-reload`（非 ADMIN） | 403 |
| E2E | 模拟部署：修改 build-meta.json → 前端检测到 → Banner 弹出 → reload → 新页面加载 | 完整链路验证 |
| E2E | 模拟双通道：WebSocket + 轮询同时触发 → 只显示一个 Banner | 防重复守卫验证 |
| 单元测试 | `useClientVersionPoll` 首次轮询（sessionStorage 无 `__last_reload_id`） | 不触发 reloadId 检查；正确设置基线值；buildId 检查照常执行 |
| E2E | 后台标签页恢复：hidden → visible → 立即轮询 → Banner 弹出 | visibilityState 逻辑验证 |
| E2E | 首次访问（reloadId > 0 但不触发）：全新用户打开 → 不误触发刷新 → 基线正确设置 → 后续管理员触发正常响应 | 首次基线逻辑；场景 6 验证 |

---

## 9. 错误处理汇总

| 场景 | 处理方式 |
|------|---------|
| `build-meta.json` 不存在 | `buildId = "unknown"`，不触发任何刷新，监控页显示异常状态 |
| `build-meta.json` 格式错误 | 同上，并 log.error |
| 轮询网络错误 | 按退避策略延长间隔，不触发刷新 |
| 轮询返回非 2xx | 同上（4xx/5xx 视为失败） |
| 速率限制 429 | 客户端收到后延长轮询间隔到 120s，不立即重试 |
| localStorage 不可用 | clientId 降级为 session 级随机 ID（每次页面加载新建） |
| sessionStorage 不可用 | 防重复守卫失效的风险可接受—最坏情况多刷新一次 |
| BroadcastChannel 不可用 | 降级为各标签页独立运行（无协调，但功能不受影响） |

---

## 10. 迁移步骤

1. **新增后端**：`ClientVersionService` + `GET /api/client-version` + `GET /api/v1/monitor/client-versions` + 速率限制 Filter
2. **修改 Vite 构建**：`build-meta.json` 生成插件（写到 dist，自然跟随 outDir 到达 static）
3. **修改后端现有代码**：
   - `AdminSettingsController.broadcastClientReload` → 增加 `ClientVersionService.triggerForceReload` 调用
   - `FrontendVersionGuard` → 改为从 `build-meta.json` 读取 expectedBuildId
   - `ClientReloadBroadcastService` → 保留、简化
4. **新增前端**：`useClientVersionPoll` hook + `GracefulReloadBanner` 组件 + `ClientVersionCard` 组件
5. **修改前端现有代码**：
   - `App.tsx` → 挂载 hook + banner；修改 `CLIENT_FORCE_RELOAD` listener 增加 reloadId 检查
   - `ClientReloadOpsPanel.tsx` → 改为调用新 API 并显示 stats
6. **清理配置**：移除 `application.properties` 中的 `app.frontend.expected-version`
7. **部署验证**：确认 `build-meta.json` 随构建产物正确部署到 classpath

迁移顺序：后端核心 → 前端核心 → 集成联调 → 清理。每一步独立可测。

---

## 11. 未纳入的设计项

| 项目 | 排除理由 |
|------|---------|
| Per-client 定向刷新 | 当前需求为全量刷新，clientId 基础设施已就绪，未来可基于此扩展 |
| Service Worker 级别的后台刷新 | 常驻页面不需要 SW 唤醒能力，HTTP 轮询 + WebSocket 双通道已覆盖所有场景 |
| 移动端独立刷新策略 | 当前与 Web 端统一处理，channel 参数已就绪，未来可差异化 |
| 刷新前的自动保存 | 用"稍后提醒"按钮替代，让用户自己决定何时保存——比不可靠的自动检测更实用 |

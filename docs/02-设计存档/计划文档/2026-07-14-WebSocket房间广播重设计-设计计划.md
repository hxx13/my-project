# WebSocket 广播架构重设计：Room-based Pub/Sub

> **日期**: 2026-07-14
> **状态**: 待实施
> **审计**: 5 agent 交叉验证（3 bug发现 + 2 安全审计）+ 1 规范审计
> **版本**: v2.1（C1-C4 修复 + G1-G6 实施注意事项）

## 1. 背景

当前项目的 WebSocket 广播存在两类根本问题：
1. **架构缺陷**：`getBroadcastOperations()` 全体投递 + 3 个独立 ConnectListener 打补丁 + HTTP 轮询兜底——三层掩盖了"不知道消息该发给谁"
2. **reload 逻辑缺陷**：`reloadId` 纯内存 `AtomicLong(0)`，重启归零后客户端 `sessionStorage` 中的旧高值与新低值永远无法匹配

**核心洞察（审计确认）**：Room-based Pub/Sub 重设计在架构上是正确的。将 3 个独立 ConnectListener 合并为单一 `SocketRoomAssigner`，并将广播细分为目标房间，正确地解决了根本问题。

## 2. 核心设计：Room 分层

```
                    Socket.IO Server :9092
                  ┌─────────────────────────────────┐
                  │       SocketRoomAssigner          │
                  │    (唯一的 ConnectListener)        │
                  │                                   │
                  │  channel=web ────────────────────→│
                  │    joinRoom("reload:web")          │
                  │    joinRoom("console:live")        │
                  │                                   │
                  │  channel=mobile ─────────────────→│
                  │    joinRoom("mobile:broadcast")    │
                  │    + mobileToken →                 │
                  │    joinRoom("mobile_user:{id}")    │
                  │    (不 join reload:web)            │
                  │                                   │
                  │  channel=student + JWT ──────────→│
                  │    joinRoom("mobile_user:{id}")    │
                  │    (不 join reload:web)            │
                  │    (不 join console:live)          │
                  └────────────┬────────────────────┘
                               │
      ┌────────────────────────┼──────────────────────────┐
      ▼                        ▼                          ▼
┌────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ reload:web │    │  console:live    │    │ mobile_user:{id} │
│            │    │                  │    │ mobile:broadcast │
│ web 浏览器  │    │ web 浏览器        │    │ mobile/student   │
│ tab        │    │ tab              │    │ 客户端           │
│            │    │                  │    │                  │
│ CLIENT_    │    │ TWIN_GLOBAL_     │    │ MOBILE_USER_     │
│ FORCE_     │    │ EVENT            │    │ NOTIFY           │
│ RELOAD     │    │ TWIN_PIE_UPDATE  │    │ MOBILE_ALERT     │
│            │    │ SOCKET_TELEMETRY │    │                  │
│            │    │ SOCKET_SWIPE_*   │    │                  │
│            │    │ SOCKET_CAGE_*    │    │                  │
│            │    │ DASHBOARD_*      │    │                  │
│            │    │ MONITOR_JOB_*    │    │                  │
└────────────┘    └──────────────────┘    └──────────────────┘
```

**Room 契约**：

| Room | 成员 | 投递事件 |
|------|------|---------|
| `reload:web` | `channel != mobile && channel != student` 的认证连接 | `CLIENT_FORCE_RELOAD` |
| `console:live` | `channel != mobile && channel != student` 的认证连接 | `TWIN_GLOBAL_EVENT`, `TWIN_PIE_UPDATE`, `SOCKET_TELEMETRY_*`, `DASHBOARD_*`, `SOCKET_SWIPE_*`, `SOCKET_CAGE_*`, `MONITOR_JOB_*` |
| `mobile:broadcast` | `channel=mobile` 的连接 | `MOBILE_ALERT` |
| `mobile_user:{userId}` | 通过 mobileToken 或 student JWT 认证的连接 | `MOBILE_USER_NOTIFY` |

**`channel=student` 排除说明**：`channel=student`（小程序/JWT H5）连接仅加入 `mobile_user:{userId}` room 接收个人通知。不加入 `reload:web` 或 `console:live`——这些事件对小程序/H5 无意义。

## 3. 后端改动

### 3.1 新增 `SocketRoomAssigner.java`

合并当前 3 个独立 ConnectListener 为一个统一入口。解决了当前存在的随机执行顺序竞态问题（`@EventListener(ApplicationReadyEvent.class)` 不保证注册顺序）。

```java
@Component
public class SocketRoomAssigner {

    public static final String ROOM_RELOAD_WEB = "reload:web";
    public static final String ROOM_CONSOLE_LIVE = "console:live";
    public static final String ROOM_MOBILE_BROADCAST = "mobile:broadcast";

    private static final Logger log = LoggerFactory.getLogger(SocketRoomAssigner.class);

    private final SocketIOServer socketIOServer;
    private final ClientVersionService clientVersionService;
    private final MobileUserSocketPushService pushService;
    private final StudentMobileTokenService mobileTokenService;
    private final JwtTokenService jwtTokenService;

    public SocketRoomAssigner(SocketIOServer socketIOServer,
                              ClientVersionService clientVersionService,
                              MobileUserSocketPushService pushService,
                              StudentMobileTokenService mobileTokenService,
                              JwtTokenService jwtTokenService) {
        this.socketIOServer = socketIOServer;
        this.clientVersionService = clientVersionService;
        this.pushService = pushService;
        this.mobileTokenService = mobileTokenService;
        this.jwtTokenService = jwtTokenService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void register() {
        socketIOServer.addConnectListener(client -> {
            String channel = client.getHandshakeData().getSingleUrlParam("channel");

            // ── mobile channel: 仅加入广播和个人 room ──
            if ("mobile".equals(channel)) {
                client.joinRoom(ROOM_MOBILE_BROADCAST);
                String mobileToken = client.getHandshakeData().getSingleUrlParam("mobileToken");
                if (mobileToken != null && !mobileToken.isBlank()) {
                    try {
                        String userId = mobileTokenService.resolveUserIdByToken(mobileToken.trim());
                        client.joinRoom(MobileUserSocketPushService.roomForUser(userId));
                        log.info("[RoomAssigner] mobile 用户 {} 已加入个人 room", userId);
                    } catch (Exception e) {
                        log.warn("[RoomAssigner] mobileToken 校验失败: {}", e.getMessage());
                    }
                }
                return; // ← mobile 不加入 reload:web / console:live
            }

            // ── student channel (小程序/JWT H5): 仅加入个人 room ──
            if ("student".equals(channel)) {
                String jwt = client.getHandshakeData().getSingleUrlParam("token");
                if (jwt != null && !jwt.isBlank()) {
                    User user = jwtTokenService.validateTokenAndResolveUser(jwt.trim());
                    if (user != null && user.getId() != null && !user.getId().isBlank()) {
                        client.joinRoom(MobileUserSocketPushService.roomForUser(user.getId()));
                        log.info("[RoomAssigner] student JWT 用户 {} 已加入个人 room", user.getId());
                    }
                }
                return; // ← student 不加入 reload:web / console:live
            }

            // ── web client (后台管理页面): 加入所有 web room ──
            client.joinRoom(ROOM_RELOAD_WEB);
            client.joinRoom(ROOM_CONSOLE_LIVE);

            // 版本不匹配检测（原 FrontendVersionGuard 逻辑）
            // ⚠️ 安全检查：此分支在 mobile/student return 之后，仅 web 客户端到达
            // 不会向未认证客户端泄漏 expectedBuildId
            String clientVersion = client.getHandshakeData().getSingleUrlParam("v");
            String expected = clientVersionService.getExpectedBuildId();
            if (clientVersion != null && !clientVersion.isBlank()
                    && expected != null && !"unknown".equals(expected)
                    && !expected.equals(clientVersion)) {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("reason", "version-mismatch");
                payload.put("clientVersion", clientVersion);
                payload.put("expectedBuildId", expected);
                payload.put("reloadId", clientVersionService.getCurrentReloadId());
                payload.put("at", Instant.now().toString());
                client.sendEvent("CLIENT_FORCE_RELOAD", payload);
                log.info("[RoomAssigner] 版本不匹配 client={} expected={} sessionId={}",
                        clientVersion, expected, client.getSessionId());
            }
        });

        log.info("[RoomAssigner] 已注册，rooms: {}, {}, {}, {}",
                ROOM_RELOAD_WEB, ROOM_CONSOLE_LIVE, ROOM_MOBILE_BROADCAST,
                MobileUserSocketPushService.ROOM_PREFIX + "{userId}");
    }
}
```

### 3.2 修改 `ClientReloadBroadcastService.java`

```java
// 改前：全体广播 + ConnectListener + pending window + 过期清理
socketIOServer.getBroadcastOperations().sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);

// 改后：精确投递到 reload room
socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_RELOAD_WEB)
    .sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
```

**删除的元素**（不再需要——所有客户端始终在 room 中，不会错过广播）：
- `registerConnectListener()` 方法及 `@EventListener(ApplicationReadyEvent.class)`
- `expireReloadRequestedAt()` 定时任务
- `reloadRequestedAt` 字段 + `RELOAD_WINDOW_MINUTES` 常量
- `reloadIdSupplier` 字段 + `setReloadIdSupplier()` 方法
- `isReloadPending()` 方法 + `cleanup()` 方法

**保留的元素**：`broadcastForceReload()` 方法（简化版），`EVENT_CLIENT_FORCE_RELOAD` 常量。

### 3.3 修改所有 `getBroadcastOperations()` 调用点

共 **16 个调用点，11 个文件**。全部已验证：

**→ `ROOM_CONSOLE_LIVE`**：

| # | 文件:行 | 事件 | 验证 |
|---|---------|------|------|
| 1 | `AroSyncTask.java:460` | `TWIN_PIE_UPDATE` | ✅ |
| 2 | `AroSyncTask.java:510` | `TWIN_GLOBAL_EVENT` | ✅ |
| 3 | `AroStartupAsyncService.java:78` | `TWIN_PIE_UPDATE` | ✅ |
| 4 | `SwipeAlertEngine.java:124` | `SWIPE_FAILURE_ALERT_DISMISS` | ✅ 已读源码 |
| 5 | `SwipeAlertEngine.java:429` | `SWIPE_FAILURE_ALERT` | ✅ |
| 6 | `NotificationSettingsService.java:149` | `DASHBOARD_CODEX_REFRESH` | ✅ |
| 7 | `TwinStudentViolationService.java:874` | `CAGE_NOTICE_ALERT` | ✅ |
| 8 | `TelemetryWinCcSnapshotBroadcastService.java:40` | `SOCKET_TELEMETRY_TAG_DELTA` | ✅ |
| 9 | `TelemetryWinCcSnapshotBroadcastService.java:48` | `SOCKET_TELEMETRY_SNAPSHOT_FULL` | ✅ |
| 10 | `AroMiniPenetrationSyncService.java:52` | `TWIN_GLOBAL_EVENT` | ✅ |
| 11 | `AroMiniPenetrationSyncService.java:57` | `TWIN_PIE_UPDATE` | ✅ |
| 12 | `JobExecutionRegistry.java:423` | `DASHBOARD_RANKING_REFRESH` | ✅ |
| 13 | `JobExecutionRegistry.java:431` | `DASHBOARD_RANKING_REFRESH` | ✅ |
| 14 | `JobSchedulerService.java:722` | `MONITOR_JOB_START`, `MONITOR_JOB_END` | ✅ 已读源码 |

**→ `ROOM_RELOAD_WEB`**：

| # | 文件:行 | 事件 |
|---|---------|------|
| 15 | `ClientReloadBroadcastService.java:71` | `CLIENT_FORCE_RELOAD` |

**→ `ROOM_MOBILE_BROADCAST`**：

| # | 文件:行 | 事件 | 说明 |
|---|---------|------|------|
| 16 | `MobileNotificationBroadcastService.java:35` | `MOBILE_ALERT` | 从全体广播改为精确投递 |

`MobileNotificationBroadcastService` 当前使用 `getBroadcastOperations()` 向**所有客户端**（包括 web 浏览器）发送 `MOBILE_ALERT`。改为 `getRoomOperations("mobile:broadcast")` 后，web 客户端不再接收无意义的 mobile 事件。

### 3.4 修改 `ClientVersionService.java`

**改动 1**（⚠️ 审计修正 C1）：**保持 `AtomicLong(0)` 种子，不改为时间戳**。

```java
// 保持不变
private final AtomicLong reloadIdCounter = new AtomicLong(0);
```

**原因**（审计发现 C1）：Unix 时间戳种子（如 1721000000）会在重启后自然增长。客户端看到 `reloadId` 从 1721000001 跳到 1721000030，将其误解为管理员操作，触发全站误刷新。

**正确的重启恢复机制在客户端**（见 §4.4 改动 1）：前端始终将 `__last_reload_id` 同步到服务端当前值。重启后服务端 `reloadId` 回到 0，客户端首次轮询发现 `0 < 5`，将存储值修正为 0。管理员触发后 `0 → 1`，`1 > 0` 正确触发。

**追溯证明**：
```
服务器重启前: reloadId=5,  客户端存储=5
服务器重启后: reloadId=0
客户端轮询:   stored=5, currentReloadId=0
  → 始终同步: sessionStorage.setItem('__last_reload_id', '0')
  → 比较: 0 > 5?  false → 不触发 ✅
管理员触发:   reloadIdCounter.incrementAndGet() → 1
客户端轮询:   stored=0, currentReloadId=1
  → 比较: 1 > 0?  true → 触发刷新 ✅
```

**改动 2**：`readBuildIdFromMetaFile()` 增加 `index.html` 时间戳 fallback。

```
优先级: build-meta.json → index.html lastModified → "unknown"
需处理 JAR 内运行时 ClassPathResource.getFile() 的 IOException。
```

**改动 3**：`@Scheduled` 定期重读 `build-meta.json`（防护：try-catch + 不覆盖已知值）。

```java
@Scheduled(fixedRate = 60_000)
public void refreshExpectedBuildId() {
    try {
        String fresh = readBuildIdFromMetaFile();
        if (fresh != null && !fresh.isBlank() && !"unknown".equals(fresh)
                && !fresh.equals(expectedBuildId)) {
            expectedBuildId = fresh;
            log.info("[client-version] expectedBuildId 已更新: {}", fresh);
        }
    } catch (Throwable t) {
        log.warn("[client-version] 刷新 expectedBuildId 失败", t);
    }
}
```

### 3.5 删除 `FrontendVersionGuard.java`

逻辑已合并到 `SocketRoomAssigner`。

**安全改进**：当前 `FrontendVersionGuard` 不检查 `channel` 参数——`channel=mobile` 客户端携带 `v=any` 参数连接时会收到包含 `expectedBuildId` 和 `reloadId` 的 `CLIENT_FORCE_RELOAD` 响应（信息泄漏）。合并后，`SocketRoomAssigner` 中 mobile/student channel 在版本检查之前 `return`，消除此泄漏。

### 3.6 删除 `MobileSocketConnectListener.java`

逻辑已合并到 `SocketRoomAssigner`。

## 4. 前端改动

### 4.1 新增共享 Socket 单例（`socketUrl.ts`）

```typescript
let sharedSocket: Socket | null = null;

export function getSharedSocket(): Socket | null {
    return sharedSocket;
}

export function createSharedSocket(token: string): Socket {
    if (sharedSocket) sharedSocket.disconnect();
    sharedSocket = io(resolveSocketUrl(), {
        ...SOCKET_IO_CLIENT_OPTIONS,
        query: { token, v: APP_BUILD_ID },
    });
    return sharedSocket;
}
```

**单例假设**：每个浏览器 tab 有独立的 JS 执行上下文，因此不需要跨 tab 的互斥锁。React StrictMode 双挂载在 `useEffect` cleanup 中正确处理（`disconnect` 清理旧 socket）。

### 4.2 修改 `App.tsx` GlobalSocketListener

**连接门控**：`hasToken && routeHash.startsWith("#/console")` → `hasToken`（所有已登录页面建 WebSocket）。

**事件订阅分层**：

| 事件 | 订阅路由 | 说明 |
|------|---------|------|
| `CLIENT_FORCE_RELOAD` | 所有路由 | 全站 reload |
| `TWIN_GLOBAL_EVENT` | `#/console` | 实时进出流水 |
| `TWIN_PIE_UPDATE` | `#/console` | 饼图更新 |
| `SOCKET_TELEMETRY_*` | `#/console` | 遥测数据 |
| `DASHBOARD_*` | `#/console` | 排行榜/公告刷新 |
| `SOCKET_SWIPE_*` | `#/console` | 刷卡告警 |
| `SOCKET_CAGE_*` | `#/console` | 笼位通知 |

**附加改动**：
- `handleReloadNeeded` 用 `useCallback(() => {}, [])` 包裹
- `payload.reloadId` 从 `if (payload.reloadId)` 改为 `if (payload.reloadId != null)`（`0` 是合法值）

**带宽说明**：`console:live` room 中的所有事件会传递到所有 web 客户端（服务端不区分路由）。非 `#/console` 路由的前端不订阅这些事件，但仍接收网络负载。此行为与**当前 `getBroadcastOperations()` 完全一致**（当前也是全体广播），不引入新开销。未来可按事件类型进一步细分 room。

### 4.3 修改 `useSocket.ts`

用共享 socket 替代独立 `io()` 调用。消除当前"两个独立 socket 连接"的冗余架构。

### 4.4 修改 `useClientVersionPoll.ts`

**改动 1**：`reloadId` 下行修正（审计 C1 的核心配套修复）。
```typescript
const stored = sessionStorage.getItem('__last_reload_id');
const currentReloadId = response.reloadId;

if (stored === null) {
    sessionStorage.setItem('__last_reload_id', String(currentReloadId));
} else {
    const prevReloadId = parseInt(stored, 10);
    // 始终同步到服务端当前值——这是重启恢复的关键
    sessionStorage.setItem('__last_reload_id', String(currentReloadId));
    // 仅在严格增长时触发
    if (!isNaN(prevReloadId) && currentReloadId > prevReloadId) {
        onReloadNeeded({ reason: 'admin-command', payload: response });
        schedule(POLL_NORMAL);
        return;
    }
}
```

**改动 2**：轮询不因触发而停止（`onReloadNeeded` 后调用 `schedule(POLL_NORMAL)` 再 return）。

**改动 3**：版本不匹配去重标记。
```typescript
if (!sessionStorage.getItem('__version_mismatch_triggered')) {
    sessionStorage.setItem('__version_mismatch_triggered', '1');
    onReloadNeeded({ reason: 'version-mismatch', payload: response });
}
schedule(POLL_NORMAL);
return;
```

### 4.5 修改 `GracefulReloadBanner.tsx`

```typescript
useEffect(() => {
    setSnoozed(false);
    setCountdown(COUNTDOWN_SECONDS);
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
}, [reason]);
```

## 5. 已识别的风险与接受

| 风险 | 处理方式 |
|------|---------|
| `channel=mobile` 绕过 JWT 认证（`SocketIOConfig.java:44-46`） | **现存行为**，本次不改动。攻击面：任意人员可建立无限连接。通过 `config.setOrigin("*")` 放大。**记录为已知已接受风险。** |
| `resolveUserIdByToken()` 绕过 IP 反共享检查（`MobileSocketConnectListener.java:47`） | **现存行为**，本次不改动。`validateToken()` 上的注释说明这是有意的——避免握手地址与 HTTP 不一致。**记录为已知设计权衡。** |
| `console:live` room 向所有 web 客户端发送所有事件 | **非回归**——当前 `getBroadcastOperations()` 已是全体广播。前端订阅过滤 + 服务端 room 已隔离 mobile。未来可按事件类型细分。 |
| 8s 冷却期内 WebSocket 快速通道的 reload 指令被丢弃 | 已接受——15s HTTP 轮询兜底。当前行为，不引入新问题。 |

## 6. 实施注意事项（审计 G1-G6）

### G1. 共享 Socket 单例：初始化顺序 + 监听器重新绑定

**问题**：`createSharedSocket()` 模式（disconnect 旧 socket + 创建新 socket）会导致旧 socket 上的所有事件监听器变为僵尸——它们留在内存中，指向已断开的 socket，而新 socket 启动时没有这些监听器。

**方案**：不采用 disconnect + recreate 模式。在模块顶层同步创建 socket，token 刷新通过现有的 `reconnect_attempt` 钩子更新 query 参数（当前代码已在做）：

```typescript
// socketUrl.ts — 模块级同步创建
function initSocket(): Socket {
    const token = authStorage.getToken();
    return io(resolveSocketUrl(), {
        ...SOCKET_IO_CLIENT_OPTIONS,
        query: { token: token || '', v: APP_BUILD_ID },
    });
}

const sharedSocket: Socket = initSocket();

export function getSharedSocket(): Socket {
    return sharedSocket;
}

// 监听器通过 reconnect_attempt 更新 token（现有逻辑，移入此处）
sharedSocket.on('reconnect_attempt', (attempt) => {
    const currentToken = authStorage.getToken();
    if (currentToken) {
        (sharedSocket as any).io.opts.query = {
            token: currentToken,
            v: APP_BUILD_ID,
        };
    }
});
```

**优势**：socket 实例永不替换 → 监听器重新绑定问题消失。token 刷新通过查询参数更新处理——与当前代码 `App.tsx:172-180` 和 `useSocket.ts:38-46` 中的 reconnect_attempt 钩子逻辑完全相同。

### G2. 重启后首次 WebSocket reload 丢失

**问题**：服务器重启后，HTTP 轮询将 `__last_reload_id` 向下修正之前有一个约 15 秒的窗口。如果管理员在此窗口内触发 reload，WebSocket 快速通道的 `reloadId` 比较会因存储的旧高值而失败。

**方案**：WebSocket `CLIENT_FORCE_RELOAD` 事件处理器需要与 HTTP 轮询相同的下行修正逻辑：

```typescript
// App.tsx onClientForceReload — 情况 2（管理员指令）
const lastReloadId = parseInt(sessionStorage.getItem('__last_reload_id') || '0', 10);
// 始终同步到服务端当前值（与 HTTP 轮询保持一致）
sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
// 仅在严格增长时触发
if (payload.reloadId > lastReloadId) {
    setReloadBanner({ reason: 'admin-command', payload });
}
```

安全保证：`lastReloadId` 在 `setItem` 覆盖之前被捕获到局部变量中。单个 WebSocket 连接上的事件严格有序（TCP），因此不存在乱序风险。

### G3. `useSocket.ts` reconnect 重复检查

**问题**：当前 `useSocket.ts:121-133` 在重连时独立检查 `reloadId`。使用共享 socket 后，此逻辑会与 `App.tsx` 中的逻辑重复。

**方案**：从 `useSocket.ts` 中移除独立的 reload 检查。所有 reload 检测统一到两个通道：
- WebSocket：`App.tsx` 的 `onClientForceReload` 处理器
- HTTP 轮询：`useClientVersionPoll`

`useSocket.ts` 的重连处理器仅保留 token 刷新和连接状态管理。

### G4. Room 常量位置

**问题**：`ROOM_MOBILE_BROADCAST` 放在 `SocketRoomAssigner` 中会导致 `MobileNotificationBroadcastService`（`modules/notification/service/`）反向依赖 `modules/twin/common/`。

**方案**：常量定义在各自的使用方：

```java
// MobileNotificationBroadcastService.java — 在此定义
public static final String ROOM_MOBILE_BROADCAST = "mobile:broadcast";

// SocketRoomAssigner.java — 引用同一字符串字面量
client.joinRoom("mobile:broadcast");
```

两个类共享字符串字面量 `"mobile:broadcast"`——不需要跨包 import。类似地，`ROOM_RELOAD_WEB` 和 `ROOM_CONSOLE_LIVE` 定义在 `SocketRoomAssigner` 中，仅被同包或 `ClientReloadBroadcastService` 引用——无需拆分。

### G5. JAR 内部署中 `index.html` 最后修改时间

**问题**：`ClassPathResource.getFile()` 在 JAR 内部署中抛出 `IOException`。规范要求 `index.html` 时间戳作为 `build-meta.json` 的回退——但需要适配 JAR 场景。

**方案**：

```java
private String readBuildIdFromMetaFile() {
    // 1. build-meta.json
    try {
        ClassPathResource meta = new ClassPathResource("static/build-meta.json");
        if (meta.exists()) {
            try (InputStream is = meta.getInputStream()) {
                Map<String, Object> obj = objectMapper.readValue(is, Map.class);
                Object buildId = obj.get("buildId");
                if (buildId != null) return buildId.toString();
            }
        }
    } catch (Exception e) { /* fall through */ }

    // 2. index.html lastModified（JAR 内使用 URLConnection）
    try {
        ClassPathResource index = new ClassPathResource("static/index.html");
        if (index.exists()) {
            // 优先尝试 getFile()（exploded 部署）
            try {
                return String.valueOf(index.getFile().lastModified());
            } catch (IOException fileEx) {
                // JAR 内：通过 URLConnection 获取
                URL url = index.getURL();
                URLConnection conn = url.openConnection();
                long lastMod = conn.getLastModified();
                if (lastMod > 0) return String.valueOf(lastMod);
            }
        }
    } catch (Exception e) { /* fall through */ }

    return "unknown";
}
```

### G6. 集成测试场景

实施完成后至少验证：

| # | 场景 | 预期结果 |
|---|------|---------|
| 1 | `channel=web` 连接 | 加入 `reload:web` + `console:live` |
| 2 | `channel=mobile` + 有效 mobileToken | 加入 `mobile:broadcast` + `mobile_user:{id}`；不加入 `reload:web` |
| 3 | `channel=student` + 有效 JWT | 仅加入 `mobile_user:{id}`；不加入 reload/console |
| 4 | `channel=mobile` + 无效 mobileToken | 仅加入 `mobile:broadcast`；警告日志 |
| 5 | 管理员触发 reload | `#/console` 和 `#/` 路由的浏览器 tab 均收到 `CLIENT_FORCE_RELOAD` |
| 6 | `channel=mobile` 客户端 | 不收到 `CLIENT_FORCE_RELOAD` |
| 7 | 服务器重启 + 管理员触发 reload | HTTP 轮询在 ≤15s 内下行修正，后续 reload 正常触发 |
| 8 | 客户端版本不匹配连接 | 仅 web 客户端收到 version-mismatch `CLIENT_FORCE_RELOAD` |
| 9 | `MOBILE_ALERT` 广播 | 仅 `channel=mobile` 客户端收到；web 客户端不收到 |

## 8. 改动清单总览

| # | 文件 | 操作 |
|---|------|------|
| 1 | `SocketRoomAssigner.java` | **新增** |
| 2 | `ClientReloadBroadcastService.java` | 改（精简：删 ConnectListener/pending window/过期清理） |
| 3 | `FrontendVersionGuard.java` | **删除** |
| 4 | `MobileSocketConnectListener.java` | **删除** |
| 5 | `ClientVersionService.java` | 改（保持 0 种子 + `index.html` fallback + 定期重读） |
| 6 | `MobileNotificationBroadcastService.java` | 改（`getBroadcastOperations()` → `getRoomOperations(ROOM_MOBILE_BROADCAST)`） |
| 7-17 | 10 个文件（14 个 `getBroadcastOperations` → `getRoomOperations(ROOM_CONSOLE_LIVE)`） | 改（每处 1 行） |
| 18 | `socketUrl.ts` | 改（共享单例） |
| 19 | `App.tsx` | 改（门控放宽 + 订阅分层 + useCallback + falsy 修复） |
| 20 | `useSocket.ts` | 改（用共享 socket） |
| 21 | `useClientVersionPoll.ts` | 改（下行修正 + 不停止 + 去重标记） |
| 22 | `GracefulReloadBanner.tsx` | 改（snooze 重置） |

**合计：22 个文件（1 新增 + 2 删 + 19 改）**

## 9. 影响矩阵

| 现有功能 | 状态 | 说明 |
|---------|------|------|
| `CLIENT_FORCE_RELOAD` | ✅ **修复** | WebSocket 全站覆盖 + HTTP 轮询重启恢复 |
| `TWIN_GLOBAL_EVENT` | ✅ 不变 | 全体广播 → `console:live` room，等价 |
| `TWIN_PIE_UPDATE` | ✅ 不变 | 同上 |
| `SOCKET_TELEMETRY_*` | ✅ 不变 | 同上 |
| `DASHBOARD_RANKING_REFRESH` | ✅ 不变 | 同上 |
| `DASHBOARD_CODEX_REFRESH` | ✅ 不变 | 同上 |
| `SWIPE_FAILURE_ALERT` | ✅ 不变 | 同上 |
| `SWIPE_FAILURE_ALERT_DISMISS` | ✅ 不变 | 同上 |
| `CAGE_NOTICE_ALERT` | ✅ 不变 | 同上 |
| `MONITOR_JOB_*` | ✅ 不变 | 同上 |
| `MOBILE_ALERT` | ✅ **改进** | 从全体广播 → `mobile:broadcast` room |
| `MOBILE_USER_NOTIFY` | ✅ 不变 | `mobile_user:{id}` room |
| Mobile WebSocket (`channel=mobile`) | ✅ **改进** | 不再收到 `CLIENT_FORCE_RELOAD`（排除在 reload room 外） |
| Student WebSocket (`channel=student`) | ✅ **改进** | 明确排除在 reload/console room 外 |
| JWT 认证 | ✅ 不变 | `SocketIOConfig` 和 `AuthorizationListener` 零改动 |
| `GET /api/client-version` | ✅ 不变 | API 契约不变 |
| HTTP 轮询双通道 | ✅ **修复** | 重启后 `reloadId` 下行修正 + 不停止 |
| `GracefulReloadBanner` | ✅ **改进** | reason 变化时重置 snooze |
| `FrontendVersionGuard` 信息泄漏 | ✅ **修复** | mobile channel 在版本检查前 return |

## 10. Reload 端到端流程（修复后）

```
Admin 点击 "同步在线页"
  → POST /api/admin/settings/broadcast-client-reload
    → reloadIdCounter.incrementAndGet()    // 0→1 (或在已有基础上递增)
    → getRoomOperations("reload:web")
        .sendEvent("CLIENT_FORCE_RELOAD", { reason:"admin", reloadId:1, at:"...", operatorUserId:"..." })

═══════════════════════════════════════════════════════════
WebSocket 快速通道
═══════════════════════════════════════════════════════════
  ┌── reload:web room ──────────────────────────────────┐
  │  ✅ 所有已登录 web 浏览器 tab（不论路由）             │
  │  ❌ mobile channel — 不在此 room                      │
  │  ❌ student channel — 不在此 room                     │
  │                                                      │
  │  onClientForceReload(payload)                        │
  │    → 冷却检查 (8s) → 通过                            │
  │    → reloadId 去重 (payload.reloadId > last) → 通过  │
  │    → 显示 GracefulReloadBanner                       │
  └──────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════
HTTP 轮询兜底通道 (每 15s)
═══════════════════════════════════════════════════════════
  GET /api/client-version
    → buildId 不匹配?  → version-mismatch 触发
    → reloadId 增长?   → admin-command 触发
    → reloadId < 存储?  → 下行修正（重启恢复），不触发
    → 触发后继续轮询（不停止）
    → NaN 防护 + 版本去重标记

═══════════════════════════════════════════════════════════
重启恢复 (关键场景)
═══════════════════════════════════════════════════════════
  重启前:  reloadId=5,  客户端存储=5
  重启后:  reloadId=0 (AtomicLong(0))
  首次轮询: stored=5, current=0
    → 下行修正: __last_reload_id = "0"
    → 比较: 0 > 5? false → 不触发 ✅
  管理员触发: reloadId=1
  下次轮询: stored=0, current=1
    → 比较: 1 > 0? true → 触发 ✅
```

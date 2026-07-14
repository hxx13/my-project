# WebSocket Room Broadcast 重设计 — 实施计划

> **状态**: 待实施 | **日期**: 2026-07-14 | **版本**: v2.2（D1-D13 + N1-N7 审计修复）
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 WebSocket 广播从 `getBroadcastOperations()` 全体投递重构为 Room-based Pub/Sub，合并 3 个 ConnectListener 为单一 `SocketRoomAssigner`，修复重启后 reloadId 恢复和 mobile student channel 隔离。

**Architecture:** 4 Room（`reload:web`、`console:live`、`mobile:broadcast`、`mobile_user:{userId}`）+ 单一 ConnectListener + 前端共享 Socket 单例 + HTTP 轮询双通道兜底。后端 22 文件变更，前端 5 文件变更。

**Tech Stack:** Java 17 + Spring Boot 3.5 + Socket.IO (netty-socketio) + React 18 + TypeScript + Socket.IO Client

**Spec:** `docs/superpowers/specs/2026-07-14-websocket-room-broadcast-redesign.md` v2.1

**Rollback:** 所有 commit message 以 `[room-refactor]` 前缀标记。若需回退，执行 `git log --oneline --grep="[room-refactor]"` 找到所有相关 commit，从最后一个向前逐个 revert。

---

### Task 1: Create `SocketRoomAssigner.java`

- [ ] **Step 0: Verify dependency interface**

```bash
grep -n 'public static String roomForUser\|public static final String ROOM_PREFIX' src/main/java/com/example/demo/modules/student/service/MobileUserSocketPushService.java
```

Expected:
```
28:    public static String roomForUser(String userId) {
20:    public static final String ROOM_PREFIX = "mobile_user:";
```
If these don't exist, stop — the plan assumes this interface.

Also verify `StudentMobileTokenService.resolveUserIdByToken()`:
```bash
grep -n 'resolveUserIdByToken' src/main/java/com/example/demo/modules/student/service/StudentMobileTokenService.java
```
Expected: at least one match showing `public String resolveUserIdByToken(String token)`. `SocketRoomAssigner` calls this in the mobile channel branch.

**Files:**
- Create: `src/main/java/com/example/demo/common/component/SocketRoomAssigner.java`

This is the core architectural change — a single ConnectListener that routes every incoming connection to the correct rooms based on its `channel` handshake parameter. It replaces the three existing ConnectListeners (`FrontendVersionGuard`, `ClientReloadBroadcastService.registerConnectListener`, `MobileSocketConnectListener`) which have undefined registration order.

- [ ] **Step 1: Create the new file**

```java
package com.example.demo.common.component;

import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.listener.ConnectListener;
import com.example.demo.common.config.JwtTokenService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.service.MobileUserSocketPushService;
import com.example.demo.modules.student.service.StudentMobileTokenService;
import com.example.demo.modules.twin.common.service.ClientVersionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * WebSocket 客户端连接时的 Room 分配器。
 * <p>
 * 合并了原有的 FrontendVersionGuard、ClientReloadBroadcastService.registerConnectListener、
 * MobileSocketConnectListener 三个独立 ConnectListener——它们通过
 * {@code @EventListener(ApplicationReadyEvent.class)} 注册，Spring 不保证执行顺序。
 * 现在所有 room 加入逻辑在一个确定性的分支中完成。
 * <p>
 * Room 映射：
 * <ul>
 *   <li>{@code channel=mobile} → mobile:broadcast + mobile_user:{id}（仅此而已）</li>
 *   <li>{@code channel=student} + JWT → mobile_user:{id}（仅此而已）</li>
 *   <li>其他所有类型 → reload:web + console:live</li>
 * </ul>
 */
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

            // ── mobile channel: 加入广播 + 个人 room ──
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

- [ ] **Step 2: Verify the file compiles**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS (the new file should compile since all dependencies already exist)

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/common/component/SocketRoomAssigner.java
git commit -m "[room-refactor] feat: add SocketRoomAssigner — unified ConnectListener with room-based routing"
```

---

### Task 2: Modify `ClientVersionService.java`

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/common/service/ClientVersionService.java`

Three changes: (1) enhance `readBuildIdFromMetaFile()` with `index.html` lastModified fallback for JAR deployments, (2) add `@Scheduled refreshExpectedBuildId()` for hot-deploy support, (3) remove `broadcastService.setReloadIdSupplier()` call from `init()` since `ClientReloadBroadcastService` no longer needs it.

- [ ] **Step 1: Replace `readBuildIdFromMetaFile()` method body**

Locate the `private String readBuildIdFromMetaFile()` method (search for method name, not line number since it shifts). Replace the entire method body:

```java
private String readBuildIdFromMetaFile() {
    // 1. build-meta.json（首选）
    try {
        ClassPathResource meta = new ClassPathResource("static/build-meta.json");
        if (meta.exists()) {
            try (InputStream is = meta.getInputStream()) {
                Map<String, Object> obj = objectMapper.readValue(is, Map.class);
                Object buildId = obj.get("buildId");
                if (buildId != null && !buildId.toString().isBlank()) {
                    return buildId.toString();
                }
            }
        }
    } catch (Exception e) {
        log.warn("[client-version] build-meta.json 读取失败，尝试 index.html fallback: {}", e.getMessage());
    }

    // 2. index.html lastModified（JAR 部署 fallback）
    try {
        ClassPathResource index = new ClassPathResource("static/index.html");
        if (index.exists()) {
            // 优先 getFile()（exploded 部署）
            try {
                return String.valueOf(index.getFile().lastModified());
            } catch (IOException fileEx) {
                // JAR 内：通过 URLConnection
                java.net.URL url = index.getURL();
                java.net.URLConnection conn = url.openConnection();
                long lastMod = conn.getLastModified();
                if (lastMod > 0) {
                    return String.valueOf(lastMod);
                }
            }
        }
    } catch (Exception e) {
        log.warn("[client-version] index.html lastModified 读取失败: {}", e.getMessage());
    }

    log.warn("[client-version] 无法读取 buildId，使用 'unknown'");
    return "unknown";
}
```

- [ ] **Step 2: Add missing import for `IOException`**

Add to the import block at the top of the file (after line 10 `import java.io.InputStream;`):

```java
import java.io.IOException;
```

- [ ] **Step 3: Remove `broadcastService.setReloadIdSupplier()` from `init()`**

In the `init()` method (line 60-66), delete line 64:

```java
// DELETE this line:
broadcastService.setReloadIdSupplier(reloadIdCounter::get);
```

The `init()` method becomes:

```java
@PostConstruct
public void init() {
    expectedBuildId = readBuildIdFromMetaFile();
    log.info("[client-version] 初始化完成 expectedBuildId={} reloadId={}", expectedBuildId, reloadIdCounter.get());
}
```

- [ ] **Step 4: Remove `Supplier` import**

`Supplier` 的唯一用途是 `broadcastService.setReloadIdSupplier(reloadIdCounter::get)`（已在 Step 3 删除）。先验证无其他引用：

```bash
grep -n 'Supplier' src/main/java/com/example/demo/modules/twin/common/service/ClientVersionService.java
```

Expected: 仅在 import 行匹配（或在后续 Task 中被删除后无匹配）。

确认后，删除 import：
```java
// DELETE this line:
import java.util.function.Supplier;
```

- [ ] **Step 5: Add `@Scheduled refreshExpectedBuildId()` method**

Add this method after the `cleanupStaleClients()` method (search for method name, not line number):

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

- [ ] **Step 6: Verify compilation**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/common/service/ClientVersionService.java
git commit -m "[room-refactor] feat: ClientVersionService — index.html fallback + scheduled refresh + remove reloadIdSupplier"
```

---

### Task 3: Simplify `ClientReloadBroadcastService.java`

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/common/service/ClientReloadBroadcastService.java`

Remove the pending-reload window mechanism, ConnectListener, and all legacy fields. Change broadcast from `getBroadcastOperations()` to `getRoomOperations(ROOM_RELOAD_WEB)`.

- [ ] **Step 0: Verify no external references to deleted methods**

```bash
grep -rn 'isReloadPending\|setReloadIdSupplier\|reloadRequestedAt' src/main/java/ --include="*.java" | grep -v ClientReloadBroadcastService | grep -v ClientVersionService
```

Expected: No output (only `ClientReloadBroadcastService` defines them; `ClientVersionService` reference removed in Task 2). If any hits appear, stop — another file depends on these methods.

- [ ] **Step 1: Replace the entire file content**

```java
package com.example.demo.modules.twin.common.service;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 通过 Socket.IO Room 通知 {@code reload:web} room 中的所有 web 客户端执行页面刷新。
 * <p>
 * 简化版：移除了 ConnectListener/pending-window/过期清理——Room Pub/Sub 保证了
 * 消息只投递给当前在 room 中的客户端，不再需要补发机制。
 */
@Service
public class ClientReloadBroadcastService {

    public static final String EVENT_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

    private static final Logger log = LoggerFactory.getLogger(ClientReloadBroadcastService.class);

    private final SocketIOServer socketIOServer;

    public ClientReloadBroadcastService(SocketIOServer socketIOServer) {
        this.socketIOServer = socketIOServer;
    }

    /**
     * @param operatorUserId 触发人用户 ID（审计用）
     * @param reloadId       客户端版本 reload 序号
     * @return 广播载荷（含触发时间）
     */
    public Map<String, Object> broadcastForceReload(String operatorUserId, long reloadId) {
        String at = Instant.now().toString();
        String uid = operatorUserId != null ? operatorUserId.trim() : "";
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("reason", "admin");
        payload.put("at", at);
        payload.put("operatorUserId", uid);
        payload.put("reloadId", reloadId);

        socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_RELOAD_WEB)
                .sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
        log.info("[client-reload] broadcast to reload:web operatorUserId={} at={}", uid, at);
        return payload;
    }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/common/service/ClientReloadBroadcastService.java
git commit -m "[room-refactor] refactor: ClientReloadBroadcastService — room-based broadcast, remove pending window + ConnectListener"
```

---

### Task 4: Modify `MobileNotificationBroadcastService.java`

**Files:**
- Modify: `src/main/java/com/example/demo/modules/notification/service/MobileNotificationBroadcastService.java`

Add `ROOM_MOBILE_BROADCAST` constant and change from `getBroadcastOperations()` (broadcast to all clients including web) to `getRoomOperations(ROOM_MOBILE_BROADCAST)` (only mobile clients).

- [ ] **Step 0: Read the current file to confirm scope**

Read the file first to confirm it only contains the two expected public methods (`broadcastAlert`, `broadcastSimple`) and no hidden helpers:
```bash
grep -n 'public\|private\|protected' src/main/java/com/example/demo/modules/notification/service/MobileNotificationBroadcastService.java
```
Expected output (46-line file with only these methods):
```
16:public class MobileNotificationBroadcastService {
27:    public void broadcastAlert(String title, String summary, String type) {
43:    public void broadcastSimple(String message) {
```
If any additional public methods appear, stop and adjust the replacement code.

- [ ] **Step 1: Replace the file content**

```java
package com.example.demo.modules.notification.service;

import com.corundumstudio.socketio.SocketIOServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 手机端 HTML5 全局强提醒广播。
 * 向 {@code mobile:broadcast} room 中的 mobile 客户端发送 MOBILE_ALERT 事件。
 */
@Service
public class MobileNotificationBroadcastService {

    /** mobile 客户端全局广播 room，与 {@code SocketRoomAssigner} 中保持一致的字符串字面量 */
    public static final String ROOM_MOBILE_BROADCAST = "mobile:broadcast";

    private static final Logger log = LoggerFactory.getLogger(MobileNotificationBroadcastService.class);

    private final SocketIOServer server;

    public MobileNotificationBroadcastService(SocketIOServer server) {
        this.server = server;
    }

    /** 广播全局通知提醒（标题 + 摘要） */
    public void broadcastAlert(String title, String summary, String type) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("title", title);
            payload.put("summary", summary);
            payload.put("type", type != null ? type : "PLATFORM");
            payload.put("at", java.time.LocalDateTime.now().toString());

            server.getRoomOperations(ROOM_MOBILE_BROADCAST).sendEvent("MOBILE_ALERT", payload);
            log.info("[MobileSocket] 向 mobile:broadcast 广播提醒: title={}, type={}", title, type);
        } catch (Exception e) {
            log.warn("[MobileSocket] 广播失败: {}", e.getMessage());
        }
    }

    /** 快速广播纯文本消息 */
    public void broadcastSimple(String message) {
        broadcastAlert(message, "", "PLATFORM");
    }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/notification/service/MobileNotificationBroadcastService.java
git commit -m "[room-refactor] feat: MobileNotificationBroadcastService — room-based broadcast to mobile:broadcast"
```

---

### Task 5: Convert `getBroadcastOperations()` → `getRoomOperations()` — 14 call sites

**Files:**
- Modify: `src/main/java/com/example/demo/modules/aro/task/AroSyncTask.java` (2 sites)
- Modify: `src/main/java/com/example/demo/modules/aro/service/AroStartupAsyncService.java` (1 site)
- Modify: `src/main/java/com/example/demo/modules/swipealert/service/SwipeAlertEngine.java` (2 sites)
- Modify: `src/main/java/com/example/demo/modules/notification/service/NotificationSettingsService.java` (1 site)
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/service/TwinStudentViolationService.java` (1 site)
- Modify: `src/main/java/com/example/demo/modules/telemetry/service/TelemetryWinCcSnapshotBroadcastService.java` (2 sites)
- Modify: `src/main/java/com/example/demo/modules/twin/common/service/AroMiniPenetrationSyncService.java` (2 sites)
- Modify: `src/main/java/com/example/demo/modules/twin/common/service/JobExecutionRegistry.java` (2 sites)
- Modify: `src/main/java/com/example/demo/modules/twin/common/service/JobSchedulerService.java` (1 site)

All 14 sites go to `ROOM_CONSOLE_LIVE`. Each change replaces `socketServer.getBroadcastOperations()` (or `socketIOServer.getBroadcastOperations()`) with the room-based alternative, referencing `SocketRoomAssigner.ROOM_CONSOLE_LIVE`.

- [ ] **Step 1: Add import to each file**

Every modified file needs this import added:

```java
import com.example.demo.common.component.SocketRoomAssigner;
```

- [ ] **Step 2: AroSyncTask.java — lines 460 and 510**

Line 460, replace:
```java
socketServer.getBroadcastOperations().sendEvent("TWIN_PIE_UPDATE", newPieData);
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("TWIN_PIE_UPDATE", newPieData);
```

Line 510, replace:
```java
socketServer.getBroadcastOperations().sendEvent("TWIN_GLOBAL_EVENT", event);
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("TWIN_GLOBAL_EVENT", event);
```

- [ ] **Step 3: AroStartupAsyncService.java — line 78**

Replace:
```java
socketServer.getBroadcastOperations().sendEvent("TWIN_PIE_UPDATE", newPieData);
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("TWIN_PIE_UPDATE", newPieData);
```

- [ ] **Step 4: SwipeAlertEngine.java — lines 124 and 429**

Line 124 is a multi-line call — only the first line changes, `.sendEvent(...)` parameters stay identical:
```java
// OLD (multi-line):
socketServer.getBroadcastOperations().sendEvent(
        "SWIPE_FAILURE_ALERT_DISMISS", dismiss);

// NEW:
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent(
        "SWIPE_FAILURE_ALERT_DISMISS", dismiss);
```

Line 429, replace:
```java
socketServer.getBroadcastOperations().sendEvent("SWIPE_FAILURE_ALERT", alert);
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("SWIPE_FAILURE_ALERT", alert);
```

- [ ] **Step 5: NotificationSettingsService.java — line 149**

Replace:
```java
socketServer.getBroadcastOperations().sendEvent("DASHBOARD_CODEX_REFRESH",
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("DASHBOARD_CODEX_REFRESH",
```

- [ ] **Step 6: TwinStudentViolationService.java — line 874**

Replace:
```java
socketServer.getBroadcastOperations().sendEvent("CAGE_NOTICE_ALERT", alert);
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("CAGE_NOTICE_ALERT", alert);
```

- [ ] **Step 7: TelemetryWinCcSnapshotBroadcastService.java — lines 40 and 48**

Line 40, replace:
```java
socketIOServer.getBroadcastOperations().sendEvent(EVENT_TAG_DELTA, Map.of("items", items));
```
with:
```java
socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent(EVENT_TAG_DELTA, Map.of("items", items));
```

Line 48, replace:
```java
socketIOServer.getBroadcastOperations().sendEvent(EVENT_SNAPSHOT_FULL, Collections.emptyMap());
```
with:
```java
socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent(EVENT_SNAPSHOT_FULL, Collections.emptyMap());
```

- [ ] **Step 8: AroMiniPenetrationSyncService.java — lines 52 and 57**

Line 52, replace:
```java
socketIOServer.getBroadcastOperations().sendEvent("TWIN_GLOBAL_EVENT", toEvent(target));
```
with:
```java
socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("TWIN_GLOBAL_EVENT", toEvent(target));
```

Line 57, replace:
```java
socketIOServer.getBroadcastOperations().sendEvent("TWIN_PIE_UPDATE", twinDashboardService.getTodayRoomStats());
```
with:
```java
socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("TWIN_PIE_UPDATE", twinDashboardService.getTodayRoomStats());
```

- [ ] **Step 9: JobExecutionRegistry.java — lines 423 and 431**

Line 423, replace:
```java
socketServer.getBroadcastOperations().sendEvent("DASHBOARD_RANKING_REFRESH",
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("DASHBOARD_RANKING_REFRESH",
```

Line 431, replace:
```java
socketServer.getBroadcastOperations().sendEvent("DASHBOARD_RANKING_REFRESH",
```
with:
```java
socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("DASHBOARD_RANKING_REFRESH",
```

- [ ] **Step 10: JobSchedulerService.java — line 722**

Replace:
```java
socketIOServer.getBroadcastOperations().sendEvent(event, payload);
```
with:
```java
socketIOServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent(event, payload);
```

- [ ] **Step 11: Verify compilation**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS

- [ ] **Step 12: Commit**

```bash
git add src/main/java/com/example/demo/modules/aro/task/AroSyncTask.java \
        src/main/java/com/example/demo/modules/aro/service/AroStartupAsyncService.java \
        src/main/java/com/example/demo/modules/swipealert/service/SwipeAlertEngine.java \
        src/main/java/com/example/demo/modules/notification/service/NotificationSettingsService.java \
        src/main/java/com/example/demo/modules/twin/dashboard/service/TwinStudentViolationService.java \
        src/main/java/com/example/demo/modules/telemetry/service/TelemetryWinCcSnapshotBroadcastService.java \
        src/main/java/com/example/demo/modules/twin/common/service/AroMiniPenetrationSyncService.java \
        src/main/java/com/example/demo/modules/twin/common/service/JobExecutionRegistry.java \
        src/main/java/com/example/demo/modules/twin/common/service/JobSchedulerService.java
git commit -m "[room-refactor] refactor: 14 call sites — getBroadcastOperations() → getRoomOperations(ROOM_CONSOLE_LIVE)"
```

---

### Task 6: Delete `FrontendVersionGuard.java` + `MobileSocketConnectListener.java`

**Files:**
- Delete: `src/main/java/com/example/demo/common/component/FrontendVersionGuard.java`
- Delete: `src/main/java/com/example/demo/modules/student/component/MobileSocketConnectListener.java`

Both files' logic has been merged into `SocketRoomAssigner`. The ConnectListener registration race condition is eliminated.

- [ ] **Step 1: Delete both files**

```bash
rm src/main/java/com/example/demo/common/component/FrontendVersionGuard.java
rm src/main/java/com/example/demo/modules/student/component/MobileSocketConnectListener.java
```

- [ ] **Step 2: Verify compilation**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS (no other code imports these files — they are self-contained ConnectListener registrations)

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/common/component/FrontendVersionGuard.java \
        src/main/java/com/example/demo/modules/student/component/MobileSocketConnectListener.java
git commit -m "[room-refactor] refactor: delete FrontendVersionGuard + MobileSocketConnectListener — merged into SocketRoomAssigner"
```

---

### Task 7: Backend build verification

**Files:** All backend files from Tasks 1-6

- [ ] **Step 1: Full Maven compile**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile 2>&1 | tail -20
```

Expected: BUILD SUCCESS with no warnings related to the changed files.

- [ ] **Step 2: Run existing tests to check for regressions**

```bash
cd d:/codex/verson.1.2/20260416 && mvn test -q 2>&1 | tail -20
```

Expected: All existing tests pass. If any test fails, investigate before proceeding.

- [ ] **Step 3: Commit (if tests pass)**

```bash
git commit -m "[room-refactor] verify: backend compile + tests pass after room-based refactor" --allow-empty
```

---

### Task 8: Create shared socket singleton — `socketUrl.ts`

**Files:**
- Modify: `frontend/src/config/socketUrl.ts`

Add module-level shared socket singleton. The socket is created once at module load time and never replaced. Token refresh happens via the `reconnect_attempt` hook updating query parameters — the same pattern currently used in `App.tsx` and `useSocket.ts`. This eliminates the listener-rebinding problem that would occur with a `disconnect()` + `recreate()` pattern.

- [ ] **Step 1a: Add new imports to the top of `socketUrl.ts`**

The existing file has one import at line 1:
```typescript
import type { ManagerOptions } from "socket.io-client";
```

Modify line 1 to also import `Socket` as a type, and add the value import for `io` and `authStorage`:
```typescript
// Line 1 — extend existing import:
import type { ManagerOptions, Socket } from "socket.io-client";
// Line 2-3 — new imports:
import { io } from "socket.io-client";
import { authStorage } from "@/features/auth/authStorage";
```
`Socket` is only used as a type annotation (`const sharedSocket: Socket`), so `import type` avoids verbatimModuleSyntax warnings. `io` must remain a value import.

- [ ] **Step 1b: Append shared socket singleton code to the end of `socketUrl.ts`**

Add the following code after the `resolveSocketUrl` function (after line 51). **Note: no import statements here — imports go at the top per Step 1a.**

```typescript
// ── 共享 Socket 单例 ──
// 模块级同步创建——在 React 渲染之前，消除初始化顺序问题。
// Socket 实例永不替换，避免监听器重新绑定问题。
// Token 刷新通过 reconnect_attempt 钩子更新 query 参数。

function initSharedSocket(): Socket {
    const token = authStorage.getToken();
    return io(resolveSocketUrl(), {
        ...SOCKET_IO_CLIENT_OPTIONS,
        query: { token: token || '', v: APP_BUILD_ID },
    });
}

const sharedSocket: Socket = initSharedSocket();

/** 获取全局共享 Socket 实例。永不返回 null——socket 在模块加载时即创建。 */
export function getSharedSocket(): Socket {
    return sharedSocket;
}

// ── 重连时预刷新 token ──
// 断线超过 token 有效期后，重连携带过期 token 会被服务端拒绝。
// 此钩子确保每次重连都携带当前有效的 token。
sharedSocket.on('reconnect_attempt', (attempt) => {
    console.log(`[SharedSocket] 第 ${attempt} 次重连尝试…`);
    const currentToken = authStorage.getToken();
    if (currentToken) {
        (sharedSocket as any).io.opts.query = {
            token: currentToken,
            v: APP_BUILD_ID,
        };
    }
});
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | tail -20
```

Expected: No new type errors from `socketUrl.ts`. (There may be pre-existing errors in other files — ignore those for now, focus on `socketUrl.ts`.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/config/socketUrl.ts
git commit -m "[room-refactor] feat: add shared socket singleton to socketUrl.ts — module-level init, never replaced"
```

---

### Task 9: Modify `App.tsx` — gate, shared socket, G2 fix, useCallback, falsy

**Files:**
- Modify: `frontend/src/App.tsx`

Five changes: (1) use shared socket instead of creating one, (2) widen connection gate from `#/console` to all routes, (3) add G2 "always sync" downward correction to WebSocket reload handler, (4) fix `payload.reloadId` falsy check, (5) wrap `handleReloadNeeded` in `useCallback`.

- [ ] **Step 1: Replace the socket.io-client import**

`io` is no longer used in `App.tsx`; `Socket` is only used as a type annotation (`socketRef`). Change the import to type-only:
```typescript
// OLD:
import { io, Socket } from "socket.io-client";
// NEW:
import type { Socket } from "socket.io-client";
```

- [ ] **Step 2: Update the socketUrl import**

`resolveSocketUrl` and `SOCKET_IO_CLIENT_OPTIONS` are no longer needed — the shared socket handles both internally. Only `APP_BUILD_ID` and `getSharedSocket` are required:

```typescript
// OLD:
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS, APP_BUILD_ID } from "@/config/socketUrl";
// NEW:
import { APP_BUILD_ID, getSharedSocket } from "@/config/socketUrl";
```

- [ ] **Step 3: Widen the connection gate in `useStaffConsoleSocketGate`**

At line 81, change:
```typescript
return hasToken && routeHash.startsWith("#/console");
```
to:
```typescript
return hasToken;
```

- [ ] **Step 4: Wrap `handleReloadNeeded` in `useCallback`**

At line 102, change:
```typescript
const handleReloadNeeded = (trigger: ReloadTrigger) => { setReloadBanner(prev => prev ?? trigger); };
```
to:
```typescript
const handleReloadNeeded = useCallback((trigger: ReloadTrigger) => {
    setReloadBanner(prev => prev ?? trigger);
}, []);
```

- [ ] **Step 5: Use shared socket instead of creating a new one in `GlobalSocketListener`**

In the `useEffect` at line 114-125, replace the socket creation block:

Change lines 120-124:
```typescript
const socketUrl = resolveSocketUrl();
const socket = io(socketUrl, {
    ...SOCKET_IO_CLIENT_OPTIONS,
    query: { token, v: APP_BUILD_ID },
});
```
to:
```typescript
const socket = getSharedSocket();
```

Also remove line 120 (`const socketUrl = resolveSocketUrl();`) since it's no longer needed.

- [ ] **Step 6: Remove the duplicate `reconnect_attempt` handler**

Delete lines 172-181 (the `socket.on("reconnect_attempt", ...)` block in `GlobalSocketListener`). This logic is now in `socketUrl.ts`'s shared socket init. The full block to delete:

```typescript
// DELETE lines 172-181:
socket.on("reconnect_attempt", (attempt) => {
    console.log(`[数字孪生基站] 第 ${attempt} 次重连尝试…`);
    const currentToken = authStorage.getToken();
    if (currentToken) {
        (socket as any).io.opts.query = {
            token: currentToken,
            v: APP_BUILD_ID,
        };
    }
});
```

- [ ] **Step 7: Fix `payload.reloadId` falsy check (line 278)**

Change:
```typescript
if (payload.reloadId) {
    sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
}
```
to:
```typescript
if (payload.reloadId != null) {
    sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
}
```

- [ ] **Step 8: Add G2 "always sync" downward correction to `onClientForceReload` — admin command path**

Replace lines 285-291 (the admin-command case):

```typescript
// OLD (lines 285-291):
const lastReloadId = parseInt(sessionStorage.getItem('__last_reload_id') || '0', 10);
if (payload.reloadId && payload.reloadId > lastReloadId) {
    sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
    setReloadBanner({ reason: 'admin-command', payload });
    return;
}
```

with:

```typescript
// NEW:
const lastReloadId = parseInt(sessionStorage.getItem('__last_reload_id') || '0', 10);
// 始终同步到服务端当前值——这是重启恢复的关键（与 HTTP 轮询保持一致）
if (payload.reloadId != null) {
    sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
}
// 仅在严格增长时触发
if (payload.reloadId != null && payload.reloadId > lastReloadId) {
    setReloadBanner({ reason: 'admin-command', payload });
}
```

- [ ] **Step 9: Verify import state**

Confirm the final imports in `App.tsx` are clean (Steps 1-2 already applied the changes; this is a sanity check):
```bash
grep -n "from.*socket.io-client\|from.*socketUrl" frontend/src/App.tsx
```
Expected output:
```
5:import type { Socket } from "socket.io-client";
9:import { APP_BUILD_ID, getSharedSocket } from "@/config/socketUrl";
```
No `io`, `resolveSocketUrl`, or `SOCKET_IO_CLIENT_OPTIONS` should appear.

- [ ] **Step 10: Verify TypeScript compilation**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | grep -i "App.tsx" | head -20
```

Expected: No errors in `App.tsx`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "[room-refactor] feat: App.tsx — shared socket, widened gate, G2 downward correction, useCallback, falsy fix"
```

---

### Task 10: Modify `useSocket.ts` — shared socket + remove reload check

**Files:**
- Modify: `frontend/src/hooks/useSocket.ts`

Replace independent `io()` call with `getSharedSocket()`. Remove the independent `reconnect` reload check (G3 — all reload detection is now unified in `App.tsx` WebSocket handler + `useClientVersionPoll` HTTP polling). Keep the token refresh and connection state management logic.

- [ ] **Step 1: Update imports**

Change lines 1-6:

```typescript
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS, APP_BUILD_ID } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";
import { doRefresh } from "@/api/core/tokenRefresh";
import { fetchClientVersion } from '@/api/domains/clientVersion.api';
```

to:

```typescript
import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSharedSocket } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";
import { doRefresh } from "@/api/core/tokenRefresh";
```

- [ ] **Step 2: Replace socket creation in the `useEffect`**

Change lines 19-23:
```typescript
const token = authStorage.getToken();
if (!token) return; // 未登录不建立连接，避免服务端拒绝
const socketInstance = io(resolveSocketUrl(), {
    ...SOCKET_IO_CLIENT_OPTIONS,
    query: { token, v: APP_BUILD_ID },
});
```

to:
```typescript
const token = authStorage.getToken();
if (!token) return; // 未登录不建立连接，避免服务端拒绝
const socketInstance = getSharedSocket();
```

- [ ] **Step 3: Remove the duplicate `reconnect_attempt` handler**

Locate and delete the `reconnect_attempt` handler (search for `socketInstance.on('reconnect_attempt'` — note: line numbers may have shifted due to Steps 1-2 changing the import block):
```typescript
// DELETE this entire block:
socketInstance.on('reconnect_attempt', (attempt) => {
    console.log(`🔄 [WebSocket] 第 ${attempt} 次重连尝试…`);
    const currentToken = authStorage.getToken();
    if (currentToken) {
        (socketInstance as any).io.opts.query = {
            token: currentToken,
            v: APP_BUILD_ID,
        };
    }
});
```

This logic now lives in `socketUrl.ts`.

- [ ] **Step 4: Remove the independent `reconnect` reload check**

Delete lines 116-135 (the entire `socketInstance.on('reconnect', ...)` block that does `fetchClientVersion` + `reloadId` check):

```typescript
// DELETE lines 116-135:
socketInstance.on('reconnect', () => {
    console.log('🟢 [WebSocket] 重连成功! ID:', socketInstance.id);
    recoveryInProgressRef.current = false;
    recoveryAttemptRef.current = 0;

    // 重连后静默检查版本：如果此期间管理员触发了 reload，轮询通道会捕获，但这里做一次主动确认
    const clientId = (() => {
        try { return localStorage.getItem('__client_id') || ''; } catch { return ''; }
    })();
    fetchClientVersion(clientId, APP_BUILD_ID, 'web').then(resp => {
        const stored = sessionStorage.getItem('__last_reload_id');
        const lastReloadId = stored ? parseInt(stored, 10) : 0;
        if (resp.reloadId > lastReloadId) {
            console.log('[WebSocket] 重连后发现 reloadId 递增，补触发刷新');
            sessionStorage.setItem('__last_reload_id', String(resp.reloadId));
            window.dispatchEvent(new CustomEvent('CLIENT_RELOAD_NEEDED', {
                detail: { reason: 'admin-command' as const, payload: resp }
            }));
        }
    }).catch(() => { /* 静默失败 */ });
});
```

Replace with a simplified reconnect handler that just resets state:

```typescript
socketInstance.on('reconnect', () => {
    console.log('🟢 [WebSocket] 重连成功! ID:', socketInstance.id);
    recoveryInProgressRef.current = false;
    recoveryAttemptRef.current = 0;
});
```

> **注意 CLIENT_RELOAD_NEEDED 死代码**：`App.tsx` 的 `GlobalSocketListener` 中仍监听 `CLIENT_RELOAD_NEEDED` CustomEvent（原第 106-112 行）。该事件原本仅由此处删除的 `dispatchEvent` 触发。删除后该监听器变为死代码——无害但可后续清理，不在本次变更范围内。

- [ ] **Step 5: Remove unused `socketEpoch` state**

The `socketEpoch` state was used to trigger re-creation of the socket instance. With a shared singleton that is never recreated, this is dead code. Search for `socketEpoch` (note: line numbers may have shifted due to Steps 1-2 changing the import block) and delete all references:

Delete the state declaration:
```typescript
// DELETE:
const [socketEpoch, setSocketEpoch] = useState(0);
```

Remove `socketEpoch` from the `useEffect` dependency array (search for `}, [socketEpoch]`):

Change:
```typescript
}, [socketEpoch]);
```
to:
```typescript
}, []);
```

> **注意**：`useEffect([], [])` 仅在挂载时运行一次。`useSocket` 消费者（如 `ScannerLayout`）在已认证路由下渲染，挂载时 `authStorage.getToken()` 保证非空。若未来某消费者在未登录时挂载，`const token = authStorage.getToken(); if (!token) return;` 会导致永不注册事件监听器——需改为依赖 token 状态触发重挂载。

- [ ] **Step 6: Verify TypeScript compilation**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | grep -i "useSocket" | head -20
```

Expected: No errors in `useSocket.ts`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useSocket.ts
git commit -m "[room-refactor] refactor: useSocket — shared socket, remove duplicate reconnect_attempt + reload check"
```

---

### Task 11: Modify `useClientVersionPoll.ts` — 4 changes

**Files:**
- Modify: `frontend/src/hooks/useClientVersionPoll.ts`

Four changes: (1) reloadId downward correction (always sync to server current value), (2) polling continues after trigger, (3) version-mismatch dedup flag, (4) NaN guard.

- [ ] **Step 1: Replace the reloadId check section (lines 74-85)**

```typescript
// OLD (lines 74-85):
// 2. reloadId 检查
const stored = sessionStorage.getItem('__last_reload_id');

if (stored === null) {
    // 首次轮询：记录基线，不触发
    sessionStorage.setItem('__last_reload_id', String(response.reloadId));
} else if (response.reloadId > parseInt(stored, 10)) {
    // 新的管理员指令
    sessionStorage.setItem('__last_reload_id', String(response.reloadId));
    onReloadNeeded({ reason: 'admin-command', payload: response });
    return;
}
```

Replace with:

```typescript
// NEW:
// 2. reloadId 检查（含下行修正）
const stored = sessionStorage.getItem('__last_reload_id');
const currentReloadId = response.reloadId;

if (stored === null) {
    // 首次轮询：记录基线，不触发
    sessionStorage.setItem('__last_reload_id', String(currentReloadId));
} else {
    const prevReloadId = parseInt(stored, 10);
    // 始终同步到服务端当前值——这是重启恢复的关键
    sessionStorage.setItem('__last_reload_id', String(currentReloadId));
    // 仅在严格增长时触发（NaN 安全）
    if (!isNaN(prevReloadId) && currentReloadId > prevReloadId) {
        onReloadNeeded({ reason: 'admin-command', payload: response });
        schedule(POLL_NORMAL);
        return;
    }
}
```

- [ ] **Step 2: Fix the version-mismatch trigger — add dedup flag + continue polling**

Change lines 69-72:
```typescript
// OLD:
if (response.buildId !== APP_BUILD_ID && response.buildId !== 'unknown') {
    onReloadNeeded({ reason: 'version-mismatch', payload: response });
    return;
}
```

Replace with:

```typescript
// NEW:
if (response.buildId !== APP_BUILD_ID && response.buildId !== 'unknown') {
    if (!sessionStorage.getItem('__version_mismatch_triggered')) {
        sessionStorage.setItem('__version_mismatch_triggered', '1');
        onReloadNeeded({ reason: 'version-mismatch', payload: response });
    }
    schedule(POLL_NORMAL);
    return;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | grep -i "useClientVersionPoll" | head -20
```

Expected: No errors in `useClientVersionPoll.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useClientVersionPoll.ts
git commit -m "[room-refactor] feat: useClientVersionPoll — downward correction, dedup flag, NaN guard, continue after trigger"
```

---

### Task 12: Modify `GracefulReloadBanner.tsx` — snooze reset on reason change

**Files:**
- Modify: `frontend/src/components/GracefulReloadBanner.tsx`

When the `reason` prop changes (e.g., from `version-mismatch` to `admin-command`), reset the snoozed state and countdown so the banner is visible again immediately.

- [ ] **Step 1: Add the `useEffect` for reason change**

Insert immediately after the cleanup `useEffect` (after line 24):

```typescript
// reason 变化时重置 snooze 状态
useEffect(() => {
    setSnoozed(false);
    setCountdown(COUNTDOWN_SECONDS);
    if (snoozeTimerRef.current) {
        clearTimeout(snoozeTimerRef.current);
        snoozeTimerRef.current = undefined;
    }
}, [reason]);
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | grep -i "GracefulReloadBanner" | head -20
```

Expected: No errors in `GracefulReloadBanner.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GracefulReloadBanner.tsx
git commit -m "[room-refactor] fix: GracefulReloadBanner — reset snooze on reason change"
```

---

### Task 13: Frontend build verification

**Files:** All frontend files from Tasks 8-12

- [ ] **Step 1: TypeScript type-check**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | tail -20
```

Expected: No new errors. Fix any errors before proceeding.

- [ ] **Step 2: Vite production build**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx vite build 2>&1 | tail -20
```

Expected: Build succeeds without errors.

- [ ] **Step 3: Commit**

```bash
git commit -m "[room-refactor] verify: frontend typecheck + build pass after shared socket refactor" --allow-empty
```

---

### Task 14: End-to-end verification

**Files:** None (manual verification)

Run the full application and verify the 9 scenarios from the spec §6 G6.

- [ ] **Step 1: Start the backend**

```bash
cd d:/codex/verson.1.2/20260416 && mvn spring-boot:run 2>&1 | tail -10
```

Wait for "Started" message and Socket.IO on port 9092.

- [ ] **Step 2: Start the frontend dev server**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx vite --port 5173 &
```

- [ ] **Step 3: Scenario 1 — `channel=web` joins correct rooms**

Open browser DevTools → Network → WS tab. Login as admin. Check the WebSocket connection URL includes `channel` parameter (or defaults). Verify the socket connects successfully. Check server logs for `[RoomAssigner]` entries — should show `reload:web` + `console:live` rooms joined.

- [ ] **Step 4: Scenario 2 — `channel=mobile` + valid mobileToken joins correct rooms**

Connect with `?channel=mobile&mobileToken=<valid_token>`. Verify server log shows:
- `mobile:broadcast` room joined
- `mobile_user:{id}` room joined
- NO `reload:web` or `console:live` rooms joined

- [ ] **Step 5: Scenario 3 — `channel=student` + valid JWT joins only personal room**

Connect with `?channel=student&token=<valid_jwt>`. Verify server log shows:
- Only `mobile_user:{id}` room joined
- NO `reload:web` or `console:live` rooms

- [ ] **Step 6: Scenario 4 — `channel=mobile` + invalid token**

Connect with `?channel=mobile&mobileToken=invalid_token`. Verify:
- `mobile:broadcast` room joined (always for mobile channel)
- Warning log about token validation failure
- Connection stays open (graceful degradation)

- [ ] **Step 7: Scenario 5 — Admin reload reaches all web routes**

Login as admin in two browser tabs: one at `#/console`, one at `#/`. Trigger "同步在线页" button. Verify:
- Both tabs show `GracefulReloadBanner` within 1 second (WebSocket fast path)
- No errors in console

- [ ] **Step 8: Scenario 6 — Mobile client does NOT receive reload**

With a `channel=mobile` connection active, trigger admin reload. Verify:
- Mobile client does NOT receive `CLIENT_FORCE_RELOAD`
- Server log confirms broadcast to `reload:web` room only

- [ ] **Step 9: Scenario 7 — Server restart recovery**

Restart the backend. Before triggering reload, check browser sessionStorage `__last_reload_id` — should still hold the old high value. Wait for HTTP poll.

> ⚠️ **重要**：确保浏览器标签页**可见**（不要切换到终端或其他窗口）。`useClientVersionPoll` 在 `visibilityState === 'hidden'` 时使用 `POLL_HIDDEN = 120000`（2 分钟）而非 `POLL_NORMAL = 15000`（15 秒）。若标签页在后台，轮询间隔为 120 秒，测试将严重超时。

Verify `__last_reload_id` is corrected to 0 without triggering banner. Then trigger admin reload. Verify banner appears since `1 > 0`.

- [ ] **Step 10: Scenario 8 — Version mismatch only for web clients**

Deploy a new frontend build (change `APP_BUILD_ID`). Connect a web client with old `v=` parameter. Verify it receives `CLIENT_FORCE_RELOAD` with `reason: "version-mismatch"`. Connect a mobile client with old `v=` — verify it does NOT receive any version mismatch event.

- [ ] **Step 11: Scenario 9 — MOBILE_ALERT isolation**

Trigger a mobile notification broadcast. Verify:
- `channel=mobile` client receives `MOBILE_ALERT`
- `channel=web` client does NOT receive `MOBILE_ALERT` in Network WS frames
- Server log shows `mobile:broadcast` room target

- [ ] **Step 12: Commit**

```bash
git commit -m "[room-refactor] verify: all 9 E2E scenarios pass" --allow-empty
```

---

### Task 15: Final review — grep safety checks

**Files:** All changed files

Run automated checks to confirm no regressions.

- [ ] **Step 1: Verify no `getBroadcastOperations()` remains in non-mobile files**

```bash
grep -rn 'getBroadcastOperations()' src/main/java/com/example/demo/ | grep -v 'MobileUserSocketPushService'
```

Expected: No output (all call sites converted). Only `MobileUserSocketPushService` still uses room operations directly (it already did).

- [ ] **Step 2: Verify no hardcoded `user:{id}` room names**

```bash
grep -rn '"user:' src/main/java/com/example/demo/
```

Expected: No output (all personal rooms use `mobile_user:{id}` prefix via `MobileUserSocketPushService.roomForUser()`).

- [ ] **Step 3: Verify no remaining references to deleted files**

```bash
grep -rn 'FrontendVersionGuard\|MobileSocketConnectListener' src/main/java/com/example/demo/
```

Expected: No output (all import references cleaned up).

- [ ] **Step 4: Verify frontend no longer imports `io` from socket.io-client for new connections**

```bash
grep -rn "from 'socket.io-client'" frontend/src/ | grep -v 'import type'
```

Expected: Only `socketUrl.ts` imports `io`. All other files use `type` import for `Socket` or import `getSharedSocket`.

- [ ] **Step 5: Run full test suite**

```bash
cd d:/codex/verson.1.2/20260416 && mvn test -q 2>&1 | tail -10
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "[room-refactor] verify: safety grep checks — no broadcast regressions, no stale references" --allow-empty
```

---

## Self-Review Checklist

Before marking the plan as complete, validate:

**1. Spec coverage — each spec section maps to a task:**
- §3.1 SocketRoomAssigner → Task 1
- §3.2 ClientReloadBroadcastService → Task 3
- §3.3 16 call sites → Tasks 4 + 5
- §3.4 ClientVersionService → Task 2
- §3.5 Delete FrontendVersionGuard → Task 6
- §3.6 Delete MobileSocketConnectListener → Task 6
- §4.1 Shared socket singleton → Task 8
- §4.2 App.tsx → Task 9
- §4.3 useSocket.ts → Task 10
- §4.4 useClientVersionPoll.ts → Task 11
- §4.5 GracefulReloadBanner.tsx → Task 12
- §6 G1-G6 implementation notes → Tasks 8, 9, 10, 2, 14

**2. Placeholder scan — no TBD, TODO, "implement later", or vague references.** Each step has exact code.

**3. Type consistency — cross-checked:**
- `SocketRoomAssigner.ROOM_RELOAD_WEB` = `"reload:web"` → used by `ClientReloadBroadcastService` ✅
- `SocketRoomAssigner.ROOM_CONSOLE_LIVE` = `"console:live"` → used by all 14 call sites ✅
- `MobileNotificationBroadcastService.ROOM_MOBILE_BROADCAST` = `"mobile:broadcast"` → matches `SocketRoomAssigner` string literal ✅
- `MobileUserSocketPushService.roomForUser(userId)` → `"mobile_user:" + userId` → called from `SocketRoomAssigner` ✅
- `getSharedSocket(): Socket` → used in `App.tsx` and `useSocket.ts` ✅
- `ReloadTrigger` type from `useClientVersionPoll` → used in `App.tsx` and `GracefulReloadBanner` ✅

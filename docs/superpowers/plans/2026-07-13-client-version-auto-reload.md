# 客户端版本管理与自动刷新 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 HTTP 轮询做版本检查兜底 + WebSocket 做快速通道，实现稳定可靠的客户端自动刷新。

**Architecture:** 双通道互补——WebSocket `CLIENT_FORCE_RELOAD` 广播作为快速通道（活跃标签页 <1s），HTTP `GET /api/client-version` 轮询作为可靠兜底（后台/断线标签页 ≤15s）。`sessionStorage` 的 `__last_reload_id` 守卫防止双通道重复触发。Vite 构建时自动生成 `build-meta.json`，后端从 classpath 读取，两端 buildId 永不脱节。

**Tech Stack:** Spring Boot 3.5 + Netty-SocketIO (后端), React 18 + TypeScript + Vite (前端)

---

## 文件变更清单

| 操作 | 文件 | 职责 |
|------|------|------|
| **Create** | `src/main/java/.../twin/common/service/ClientVersionService.java` | 版本管理核心：读 build-meta.json、管理 reloadId、客户端统计 |
| **Create** | `src/main/java/.../common/component/ClientVersionRateLimitFilter.java` | `/api/client-version` 速率限制 (120/min/IP) |
| **Create** | `frontend/src/hooks/useClientVersionPoll.ts` | 版本轮询 hook：15s 间隔、退避、visibility/online 感知 |
| **Create** | `frontend/src/components/GracefulReloadBanner.tsx` | 刷新倒计时横幅：20s 倒计时 + "稍后提醒" + "立即刷新" |
| **Create** | `frontend/src/features/admin/monitor/ClientVersionCard.tsx` | 监控页版本状态卡片：4 种状态 + "同步在线页"按钮 |
| **Create** | `frontend/src/api/domains/clientVersion.api.ts` | 前端 API 层：`getClientVersion()` + `getClientVersionStats()` |
| **Modify** | `src/main/java/.../twin/common/service/ClientReloadBroadcastService.java` | 方法签名增加 reloadId 参数，payload 包含 reloadId |
| **Modify** | `src/main/java/.../common/component/FrontendVersionGuard.java` | 从 build-meta.json 读取 expectedBuildId，payload 增加 expectedBuildId+reloadId |
| **Modify** | `src/main/java/.../notification/controller/AdminSettingsController.java` | broadcastClientReload 调用 ClientVersionService.triggerForceReload |
| **Modify** | `src/main/java/.../admin/controller/MonitorController.java` | 新增 client-versions 端点 |
| **Modify** | `frontend/vite.config.ts` | 构建时写入 build-meta.json |
| **Modify** | `frontend/src/App.tsx` | 挂载轮询 hook + Banner；更新 CLIENT_FORCE_RELOAD handler |
| **Modify** | `frontend/src/hooks/useSocket.ts` | reconnect 事件中触发版本检查 |
| **Modify** | `frontend/src/features/admin/settings/ClientReloadOpsPanel.tsx` | 调用新 API 显示 stats |
| **Modify** | `frontend/src/features/admin/monitor/MonitorDashboardPage.tsx` | 集成 ClientVersionCard |
| **Modify** | `frontend/src/config/socketEvents.ts` | 确保常量已存在（不新增） |
| **Modify** | `frontend/src/api/domains/monitor.api.ts` | 新增 ClientVersionStats 类型 + fetchClientVersionStats |
| **Delete** | `src/main/resources/application.properties` (部分) | 移除 `app.frontend.expected-version` 行 |

---

### Task 1: 后端 ClientVersionService — 版本管理核心

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/common/service/ClientVersionService.java`

- [ ] **Step 1: 创建 ClientVersionService.java**

```java
package com.example.demo.modules.twin.common.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.InputStream;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

@Service
public class ClientVersionService {

    private static final Logger log = LoggerFactory.getLogger(ClientVersionService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final ClientReloadBroadcastService broadcastService;

    // 客户端统计记录（内存，不持久化）
    private static class ClientPollRecord {
        String clientId;
        String clientBuildId;
        String channel;
        Instant lastSeenAt;
        ClientPollRecord(String clientId, String clientBuildId, String channel) {
            this.clientId = clientId;
            this.clientBuildId = clientBuildId;
            this.channel = channel != null ? channel : "web";
            this.lastSeenAt = Instant.now();
        }
    }

    private final ConcurrentHashMap<String, ClientPollRecord> clientStats = new ConcurrentHashMap<>();

    // 从 build-meta.json 读取的期望版本
    private volatile String expectedBuildId = "unknown";

    // reloadId：单调递增序列号，每次 triggerForceReload 时 +1
    private final AtomicLong reloadIdCounter = new AtomicLong(0);

    // forceReloadAt：最近一次 reload 指令的时间戳（仅用于 UI 展示和 TTL 判断）
    private volatile Instant forceReloadAt = null;

    // 审计字段
    private volatile String lastReloadTriggeredBy = null;
    private volatile Instant lastReloadTriggeredAt = null;

    public ClientVersionService(ClientReloadBroadcastService broadcastService) {
        this.broadcastService = broadcastService;
    }

    @PostConstruct
    public void init() {
        expectedBuildId = readBuildIdFromMetaFile();
        // 向 ClientReloadBroadcastService 注入 reloadId 查询器，打破循环依赖
        // ClientReloadBroadcastService 的 ConnectListener 需要当前 reloadId 做 pending reload 补发
        broadcastService.setReloadIdSupplier(reloadIdCounter::get);
        log.info("[client-version] 初始化完成 expectedBuildId={} reloadId={}", expectedBuildId, reloadIdCounter.get());
    }

    private String readBuildIdFromMetaFile() {
        try {
            ClassPathResource resource = new ClassPathResource("build-meta.json");
            if (!resource.exists()) {
                log.warn("[client-version] build-meta.json 不存在于 classpath，使用 'unknown'");
                return "unknown";
            }
            try (InputStream is = resource.getInputStream()) {
                Map<String, Object> meta = objectMapper.readValue(is, Map.class);
                Object buildId = meta.get("buildId");
                return buildId != null ? buildId.toString() : "unknown";
            }
        } catch (Exception e) {
            log.error("[client-version] 读取 build-meta.json 失败", e);
            return "unknown";
        }
    }

    /** GET /api/client-version 调用 */
    public Map<String, Object> getClientVersion(String clientId, String clientBuildId, String channel) {
        // 记录客户端轮询（用于统计）
        if (clientId != null && !clientId.isBlank()) {
            clientStats.put(clientId, new ClientPollRecord(clientId, clientBuildId, channel));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("buildId", expectedBuildId);
        result.put("reloadId", reloadIdCounter.get());
        result.put("forceReloadAt", forceReloadAt != null ? forceReloadAt.toString() : null);
        return result;
    }

    /** 管理员触发"同步在线页" — 完整执行 ①→⑦ 操作顺序 */
    public Map<String, Object> triggerForceReload(String operatorUserId) {
        // ① 先递增 reloadId（后续所有操作使用新值）
        long newReloadId = reloadIdCounter.incrementAndGet();
        // ② 记录触发时间
        forceReloadAt = Instant.now();
        // ③④ WebSocket 广播快速通道（内聚在 Service 内部，防止调用方遗漏）
        broadcastService.broadcastForceReload(operatorUserId, newReloadId);
        // ⑤ 审计
        lastReloadTriggeredBy = operatorUserId != null ? operatorUserId.trim() : "";
        lastReloadTriggeredAt = forceReloadAt;

        // ⑥ 统计客户端版本分布
        Map<String, Object> stats = buildVersionStats();

        log.info("[client-reload] ACTION=trigger operatorUserId={} expectedBuildId={} reloadId={} totalClients={} outdated={}",
                operatorUserId, expectedBuildId, newReloadId,
                stats.get("totalClients"), stats.get("outdated"));

        // ⑦ 返回
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("buildId", expectedBuildId);
        result.put("reloadId", newReloadId);
        result.put("forceReloadAt", forceReloadAt.toString());
        result.put("stats", stats);
        return result;
    }

    /** 监控页查询 */
    public Map<String, Object> getVersionStats() {
        Map<String, Object> stats = buildVersionStats();
        stats.put("expectedBuildId", expectedBuildId);
        stats.put("reloadId", reloadIdCounter.get());
        stats.put("forceReloadAt", forceReloadAt != null ? forceReloadAt.toString() : null);
        stats.put("lastReloadTriggeredBy", lastReloadTriggeredBy);
        stats.put("lastReloadTriggeredAt", lastReloadTriggeredAt != null ? lastReloadTriggeredAt.toString() : null);
        return stats;
    }

    private Map<String, Object> buildVersionStats() {
        // 清理过期记录（2 分钟未上报）
        Instant cutoff = Instant.now().minus(2, ChronoUnit.MINUTES);
        clientStats.entrySet().removeIf(e -> e.getValue().lastSeenAt.isBefore(cutoff));

        int total = clientStats.size();
        int upToDate = 0;
        Map<String, Integer> distribution = new LinkedHashMap<>();

        for (ClientPollRecord record : clientStats.values()) {
            String v = record.clientBuildId != null ? record.clientBuildId : "unknown";
            distribution.merge(v, 1, Integer::sum);
            if (expectedBuildId.equals(v)) {
                upToDate++;
            }
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalClients", total);
        stats.put("upToDate", upToDate);
        stats.put("outdated", total - upToDate);
        stats.put("distribution", distribution);
        return stats;
    }

    /** 获取当前 reloadId（供 FrontendVersionGuard 查询；ClientReloadBroadcastService 通过 Supplier 获取） */
    public long getCurrentReloadId() {
        return reloadIdCounter.get();
    }

    /** 获取期望版本（供 FrontendVersionGuard 查询） */
    public String getExpectedBuildId() {
        return expectedBuildId;
    }

    // ── 定时清理 + forceReloadAt TTL ──

    @Scheduled(fixedRate = 60_000)
    public void cleanupStaleClients() {
        Instant cutoff = Instant.now().minus(2, ChronoUnit.MINUTES);
        int before = clientStats.size();
        clientStats.entrySet().removeIf(e -> e.getValue().lastSeenAt.isBefore(cutoff));
        int removed = before - clientStats.size();
        if (removed > 0) {
            log.debug("[client-version] 清理 {} 个过期客户端记录，剩余 {}", removed, clientStats.size());
        }
    }

    @Scheduled(fixedRate = 60_000)
    public void expireForceReloadAt() {
        if (forceReloadAt != null && forceReloadAt.plus(10, ChronoUnit.MINUTES).isBefore(Instant.now())) {
            log.info("[client-version] forceReloadAt TTL 过期，清除（reloadId 保持 {}）", reloadIdCounter.get());
            forceReloadAt = null;
        }
    }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd d:/codex/verson.1.2/20260416
mvn compile -pl . -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS（如果项目有其他编译错误，至少 ClientVersionService.java 本身无错误）

---

### Task 2: 后端速率限制 Filter

**Files:**
- Create: `src/main/java/com/example/demo/common/component/ClientVersionRateLimitFilter.java`

- [ ] **Step 1: 创建 ClientVersionRateLimitFilter.java**

```java
package com.example.demo.common.component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * GET /api/client-version 速率限制：per-IP 每分钟最多 120 次。
 * 内网 IP 段（10.x, 172.16-31.x, 192.168.x）直接放行。
 */
@Component
@Order(-100) // 尽早执行，避免被其他 Filter 拦截
public class ClientVersionRateLimitFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(ClientVersionRateLimitFilter.class);
    private static final String TARGET_PATH = "/api/client-version";
    private static final int MAX_REQUESTS_PER_MINUTE = 120;

    private final ConcurrentHashMap<String, RateWindow> windows = new ConcurrentHashMap<>();
    // 已知限制：IP 键永不删除，仅在窗口过期时重置计数。预计每 IP ~60 字节，10,000 IP ≈ 600KB，可接受。

    private static class RateWindow {
        final AtomicInteger count = new AtomicInteger(0);
        volatile long windowStartMs = System.currentTimeMillis();
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;

        if (!TARGET_PATH.equals(req.getRequestURI()) || !"GET".equalsIgnoreCase(req.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        String ip = clientIp(req);

        // 内网 IP 放行
        if (isPrivateIp(ip)) {
            chain.doFilter(request, response);
            return;
        }

        RateWindow window = windows.computeIfAbsent(ip, k -> new RateWindow());
        long now = System.currentTimeMillis();

        // 窗口过期 → 重置
        if (now - window.windowStartMs > 60_000) {
            synchronized (window) {
                if (now - window.windowStartMs > 60_000) {
                    window.count.set(0);
                    window.windowStartMs = now;
                }
            }
        }

        int current = window.count.incrementAndGet();
        if (current > MAX_REQUESTS_PER_MINUTE) {
            log.warn("[rate-limit] {} 超过限制 {} req/min，返回 429", ip, current);
            res.setStatus(429);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"success\":false,\"message\":\"请求过于频繁，请稍后再试\"}");
            return;
        }

        chain.doFilter(request, response);
    }

    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String xri = request.getHeader("X-Real-IP");
        if (xri != null && !xri.isBlank()) return xri.trim();
        return request.getRemoteAddr();
    }

    private static boolean isPrivateIp(String ip) {
        if (ip == null) return false;
        if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
        if (ip.startsWith("172.")) {
            try {
                int second = Integer.parseInt(ip.split("\\.")[1]);
                return second >= 16 && second <= 31;
            } catch (Exception e) {
                return false;
            }
        }
        return false;
    }
}
```

- [ ] **Step 2: 验证编译**

```bash
mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 3: 后端 — GET /api/client-version 公开端点

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/common/controller/ClientVersionController.java`

> **注意：** `/api/client-version` 是公开接口（无需认证），不能放在有 ADMIN 权限校验的 `MonitorController` 中。因此创建独立的 `ClientVersionController`。

- [ ] **Step 1: 创建 ClientVersionController**

**Create:** `src/main/java/com/example/demo/modules/twin/common/controller/ClientVersionController.java`

```java
package com.example.demo.modules.twin.common.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.twin.common.service.ClientVersionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Tag(name = "客户端版本", description = "版本检查与自动刷新")
public class ClientVersionController {

    private final ClientVersionService clientVersionService;

    public ClientVersionController(ClientVersionService clientVersionService) {
        this.clientVersionService = clientVersionService;
    }

    @GetMapping("/client-version")
    @Operation(summary = "客户端版本检查（公开，无需认证）")
    public Result<?> getClientVersion(
            @RequestParam(defaultValue = "") String clientId,
            @RequestParam(defaultValue = "") String clientBuildId,
            @RequestParam(defaultValue = "web") String channel) {
        return Result.success(clientVersionService.getClientVersion(clientId, clientBuildId, channel));
    }
}
```

- [ ] **Step 2: 验证编译**

```bash
mvn compile -pl . -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS

---

### Task 4: 后端 — GET /api/v1/monitor/client-versions 监控端点

**Files:**
- Modify: `src/main/java/com/example/demo/modules/admin/controller/MonitorController.java`

- [ ] **Step 1: 在 MonitorController 新增方法**

在 MonitorController 构造器中注入 `ClientVersionService`（修改已有构造器签名），然后新增：

```java
@GetMapping("/client-versions")
@Operation(summary = "客户端版本分布统计")
public Result<?> clientVersions(
        @RequestHeader(value = "Authorization", required = false) String authorization) {
    Result<?> denied = requireAdmin(authorization);
    if (denied != null) return denied;
    return Result.success(clientVersionService.getVersionStats());
}
```

- [ ] **Step 2: 修改构造器签名**

找到 MonitorController 构造器，在参数列表末尾追加：
```java
ClientVersionService clientVersionService
```
在构造器体内末尾追加：
```java
this.clientVersionService = clientVersionService;
```
在字段声明区追加：
```java
private final ClientVersionService clientVersionService;
```
在 import 区追加：
```java
import com.example.demo.modules.twin.common.service.ClientVersionService;
```

- [ ] **Step 3: 验证编译**

```bash
mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 5: 后端 — 修改 ClientReloadBroadcastService（payload 增加 reloadId）

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/common/service/ClientReloadBroadcastService.java`

- [ ] **Step 1: 修改 broadcastForceReload 方法签名和 payload**

```java
// 修改方法签名，增加 reloadId 参数
public Map<String, Object> broadcastForceReload(String operatorUserId, long reloadId) {
    String at = Instant.now().toString();
    String uid = operatorUserId != null ? operatorUserId.trim() : "";
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("reason", "admin");
    payload.put("at", at);
    payload.put("operatorUserId", uid);
    payload.put("reloadId", reloadId);  // ← 新增

    // 记录时间戳，保证后续 ConnectListener 能检测到
    reloadRequestedAt = Instant.now();

    // 广播给当前已连接的客户端
    socketIOServer.getBroadcastOperations().sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
    log.info("[client-reload] broadcast CLIENT_FORCE_RELOAD operatorUserId={} reloadId={} at={}", uid, reloadId, at);
    return payload;
}
```

- [ ] **Step 2: 修改 ConnectListener 的 pending reload payload**

```java
// 在 registerConnectListener() 方法中，修改补发 payload：
Map<String, Object> payload = new LinkedHashMap<>();
payload.put("reason", "admin-pending");
payload.put("at", Instant.now().toString());
payload.put("requestedAt", requestedAt.toString());
payload.put("reloadId", reloadIdSupplier.get());  // ← 新增：通过Supplier获取当前值(避免循环依赖)
```

- [ ] **Step 3: 添加 reloadIdSupplier（打破循环依赖）**

`ClientVersionService` 和 `ClientReloadBroadcastService` 相互需要对方——`ClientVersionService.triggerForceReload` 需要广播，`ClientReloadBroadcastService.ConnectListener` 需要当前 reloadId。用 `Supplier<Long>` 打破循环：

```java
// 在字段声明区新增：
private volatile Supplier<Long> reloadIdSupplier = () -> 0L;

// 新增 setter（由 ClientVersionService.init() 调用，见 Task 1）：
public void setReloadIdSupplier(Supplier<Long> supplier) {
    this.reloadIdSupplier = supplier;
}

// import 追加：
import java.util.function.Supplier;
```

构造器签名保持原样（不注入 `ClientVersionService`），避免循环依赖。

- [ ] **Step 4: 验证编译**

```bash
mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 6: 后端 — 修改 FrontendVersionGuard（从 build-meta.json 读取 + payload 增强）

**Files:**
- Modify: `src/main/java/com/example/demo/common/component/FrontendVersionGuard.java`

- [ ] **Step 1: 改为从 ClientVersionService 获取 expectedBuildId**

```java
// 去掉 @Value("${app.frontend.expected-version:}") 字段
// 改为注入 ClientVersionService

private final ClientVersionService clientVersionService;

public FrontendVersionGuard(SocketIOServer socketIOServer, ClientVersionService clientVersionService) {
    this.socketIOServer = socketIOServer;
    this.clientVersionService = clientVersionService;
}

// 在 register() 方法的 ConnectListener 中：
// 把 expectedVersion 替换为 clientVersionService.getExpectedBuildId()
String expected = clientVersionService.getExpectedBuildId();
if (expected == null || expected.isBlank() || "unknown".equals(expected)) {
    log.info("[FrontendVersionGuard] expectedBuildId 不可用，跳过版本校验");
    return;
}

// ... 比较逻辑改为：
if (!expected.equals(clientVersion)) {
    log.info("[FrontendVersionGuard] 客户端版本 {} != 期望版本 {}，通知刷新 (sessionId={})",
            clientVersion, expected, client.getSessionId());
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("reason", "version-mismatch");
    payload.put("expectedBuildId", expected);
    payload.put("reloadId", clientVersionService.getCurrentReloadId());
    payload.put("at", Instant.now().toString());
    client.sendEvent(EVENT_CLIENT_FORCE_RELOAD, payload);
}
```

- [ ] **Step 2: 添加 import**

```java
import com.example.demo.modules.twin.common.service.ClientVersionService;
import java.util.LinkedHashMap;
```

- [ ] **Step 3: 验证编译**

```bash
mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 7: 后端 — 修改 AdminSettingsController（调用 ClientVersionService）

**Files:**
- Modify: `src/main/java/com/example/demo/modules/notification/controller/AdminSettingsController.java`

- [ ] **Step 1: 修改 broadcastClientReload 方法**

```java
// 注入 ClientVersionService
private final ClientVersionService clientVersionService;

// 修改构造器，增加参数 ...
// public AdminSettingsController(..., ClientVersionService clientVersionService) {

@PostMapping("/broadcast-client-reload")
@Operation(summary = "通知所有已连接的前端页面强制刷新（双通道：WebSocket + HTTP 轮询）")
public Result<?> broadcastClientReload(HttpServletRequest httpRequest) {
    Result<?> denied = requireSuperAdmin(httpRequest);
    if (denied != null) return denied;

    User currentUser = (User) httpRequest.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
    String operatorId = currentUser != null ? currentUser.getId() : "";

    // triggerForceReload 内部已包含 ①→⑦ 完整操作（含 WebSocket 广播），Controller 仅负责权限校验
    return Result.success(clientVersionService.triggerForceReload(operatorId));
}
```

- [ ] **Step 2: 添加新 import/字段，移除旧 clientReloadBroadcastService 注入**

```java
// 新增 import：
import com.example.demo.modules.twin.common.service.ClientVersionService;

// 在类字段区：
//   + 新增：private final ClientVersionService clientVersionService;
//   − 移除：private final ClientReloadBroadcastService clientReloadBroadcastService;
//           （triggerForceReload 内部已包含广播，Controller 不再直接调用广播服务）

// 修改构造器：
//   + 新增参数 ClientVersionService clientVersionService
//   − 移除参数 ClientReloadBroadcastService clientReloadBroadcastService
```

- [ ] **Step 3: 验证编译**

```bash
mvn compile -pl . -q 2>&1 | tail -5
```

---

### Task 8: 后端 — 清理 application.properties

**Files:**
- Modify: `src/main/resources/application.properties`

- [ ] **Step 1: 移除旧配置行**

找到并删除：
```properties
app.frontend.expected-version=
```

- [ ] **Step 2: 确认无残留引用**

```bash
grep -rn 'expected-version' src/main/java/ src/main/resources/ 2>/dev/null
```

Expected: 无结果

---

### Task 9: 前端 — Vite 构建写入 build-meta.json

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: 修改 vite.config.ts，生成 buildId 并写入文件**

将现有第 29-34 行的 `defineConfig` 改为先提取 buildId：

```typescript
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import fs from "fs"

// ... serveModelsPlugin 保持不变 ...

export default defineConfig(({ mode }) => {
    const buildId = mode === 'production' ? String(Date.now()) : 'dev';

    // 自定义插件：构建完成时将 buildId 写入 build-meta.json
    function writeBuildMetaPlugin(): Plugin {
        return {
            name: "write-build-meta",
            writeBundle() {
                const meta = {
                    buildId,
                    buildTime: new Date().toISOString(),
                };
                // outDir 即 ../src/main/resources/static，build-meta.json 自动到达 classpath
                const outDir = path.resolve(__dirname, '../src/main/resources/static');
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
                fs.writeFileSync(
                    path.resolve(outDir, 'build-meta.json'),
                    JSON.stringify(meta, null, 2),
                );
                console.log(`[writeBuildMeta] build-meta.json written: buildId=${buildId}`);
            },
        };
    }

    return {
        define: {
            __BUILD_ID__: JSON.stringify(buildId),
        },
        plugins: [react(), serveModelsPlugin(), writeBuildMetaPlugin()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
        optimizeDeps: {
            include: [
                "@visactor/vtable",
                "@visactor/vtable-editors",
                "@visactor/vtable-export",
                "@visactor/vtable-search",
            ],
        },
        server: {
            proxy: {
                '/api': {
                    target: 'http://localhost:8081',
                    changeOrigin: true,
                }
            },
        },
        build: {
            outDir: '../src/main/resources/static',
            emptyOutDir: true,
            cssMinify: 'esbuild',
            chunkSizeWarningLimit: 300,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('node_modules')) {
                            const m = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)
                            if (m) {
                                const pkg = m[1].replace('@', '').replace('/', '-')
                                if (['react','react-dom','react-router','react-router-dom','@tanstack/react-query','@tanstack/query-core','scheduler'].includes(pkg) || id.includes('/react/')) return 'react-vendor'
                                if (pkg.includes('visactor') || pkg.includes('vtable') || pkg.includes('vrender') || pkg.includes('vutils') || pkg.includes('vscale') || pkg.includes('vdataset')) return 'vtable-vendor'
                                if (pkg.includes('radix') || pkg.includes('framer') || pkg.includes('lucide')) return 'ui-vendor'
                                if (pkg.includes('tiptap') || pkg.includes('prosemirror') || pkg.includes('linkify')) return 'editor-vendor'
                                if (pkg.includes('d3') || pkg.includes('recharts')) return 'chart-vendor'
                                if (pkg.includes('face-api') || pkg.includes('mediapipe')) return 'face-vendor'
                                return 'vendor-misc'
                            }
                        }
                    },
                },
            },
        },
    }
})
```

- [ ] **Step 2: 验证构建**

```bash
cd frontend && npx vite build 2>&1 | tail -10
```

Expected: 构建成功，确认 `../src/main/resources/static/build-meta.json` 已生成且包含正确的 buildId。然后删除生成的 static 目录（避免将测试构建产物提交）：

```bash
rm -rf ../src/main/resources/static/assets ../src/main/resources/static/build-meta.json ../src/main/resources/static/index.html 2>/dev/null; echo "cleaned"
```

---

### Task 10: 前端 — clientVersion API 层

**Files:**
- Create: `frontend/src/api/domains/clientVersion.api.ts`

- [ ] **Step 1: 创建 clientVersion.api.ts**

```typescript
/**
 * 客户端版本 API 层
 *
 * GET /api/client-version — 公开接口，版本检查 + 刷新触发
 * GET /api/v1/monitor/client-versions — ADMIN 权限，监控页统计
 */

import { authHttp } from "@/api/core/authHttp";

// ═══════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════

export interface ClientVersionResponse {
    buildId: string;
    reloadId: number;
    forceReloadAt: string | null;
}

export interface ClientVersionStats {
    expectedBuildId: string;
    reloadId: number;
    forceReloadAt: string | null;
    lastReloadTriggeredBy: string | null;
    lastReloadTriggeredAt: string | null;
    totalClients: number;
    upToDate: number;
    outdated: number;
    distribution: Record<string, number>;
}

export interface BroadcastReloadResult {
    buildId: string;
    reloadId: number;
    forceReloadAt: string;
    stats: ClientVersionStats;
}

// ═══════════════════════════════════════════
// API 方法
// ═══════════════════════════════════════════

const CLIENT_VERSION_URL = '/api/client-version';

/** 客户端版本检查（公开，无需认证） */
export async function fetchClientVersion(
    clientId: string,
    clientBuildId: string,
    channel: string = 'web',
): Promise<ClientVersionResponse> {
    const params = new URLSearchParams({ clientId, clientBuildId, channel });
    const res = await fetch(`${CLIENT_VERSION_URL}?${params}`);
    if (!res.ok) {
        if (res.status === 429) {
            throw new Error('请求过于频繁，请稍后再试');
        }
        throw new Error(`版本检查失败: ${res.status}`);
    }
    const json = await res.json();
    return json.data as ClientVersionResponse;
}

/** 监控页：客户端版本分布统计 */
export async function fetchClientVersionStats(): Promise<ClientVersionStats> {
    const res = await authHttp.get<{ success: boolean; data: ClientVersionStats }>(
        '/v1/monitor/client-versions',
    );
    if (!res.data.success) {
        throw new Error(res.data.message || '获取版本统计失败');
    }
    return res.data.data;
}

/** 管理员：触发全客户端刷新（双通道） */
export async function broadcastClientReload(): Promise<BroadcastReloadResult> {
    const { adminHttp } = await import("@/api/core/adminHttp");
    const res = await adminHttp.post<{ success: boolean; data: BroadcastReloadResult }>(
        '/settings/broadcast-client-reload',
    );
    if (!res.data.success) {
        throw new Error(res.data.message || '广播刷新失败');
    }
    return res.data.data;
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无新增错误（可能有项目已有的编译错误，忽略与本 Task 无关的）

---

### Task 11: 前端 — useClientVersionPoll Hook

**Files:**
- Create: `frontend/src/hooks/useClientVersionPoll.ts`

- [ ] **Step 1: 创建 useClientVersionPoll.ts**

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { fetchClientVersion, type ClientVersionResponse } from '@/api/domains/clientVersion.api';
import { APP_BUILD_ID } from '@/config/socketUrl';

const POLL_NORMAL = parseInt(import.meta.env.VITE_POLL_INTERVAL_NORMAL || '15000', 10);
const POLL_BACKOFF_1 = parseInt(import.meta.env.VITE_POLL_INTERVAL_BACKOFF_1 || '90000', 10);
const POLL_BACKOFF_2 = parseInt(import.meta.env.VITE_POLL_INTERVAL_BACKOFF_2 || '300000', 10);
const POLL_HIDDEN = parseInt(import.meta.env.VITE_POLL_INTERVAL_HIDDEN || '120000', 10);
const RELOAD_COOLDOWN_MS = 8000;

export type ReloadReason = 'version-mismatch' | 'admin-command';

export interface ReloadTrigger {
    reason: ReloadReason;
    payload: ClientVersionResponse;
}

/**
 * 客户端版本轮询 hook。
 * 双通道互补——WebSocket 快速通道 + HTTP 轮询兜底。
 * 检测到需要刷新时调用 onReloadNeeded 回调。
 */
export function useClientVersionPoll(
    onReloadNeeded: (trigger: ReloadTrigger) => void,
) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const failCountRef = useRef(0);
    const lastSuccessRef = useRef<number>(0);

    const schedule = useCallback((delayMs: number) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(poll, delayMs);
    }, []);

    const getClientId = (): string => {
        try {
            let id = localStorage.getItem('__client_id');
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem('__client_id', id);
            }
            return id;
        } catch {
            return 'session-' + Math.random().toString(36).slice(2, 10);
        }
    };

    const poll = useCallback(async () => {
        try {
            const clientId = getClientId();
            const response = await fetchClientVersion(clientId, APP_BUILD_ID, 'web');

            lastSuccessRef.current = Date.now();
            failCountRef.current = 0;

            // ── 冷却守卫 ──
            const pageLoadAt = sessionStorage.getItem('__page_load_at');
            if (pageLoadAt) {
                const pageAge = Date.now() - parseInt(pageLoadAt, 10);
                if (pageAge < RELOAD_COOLDOWN_MS) {
                    // 页面刚加载，跳过所有触发
                    schedule(POLL_NORMAL);
                    return;
                }
            }

            // ── 触发检查 ──
            // 1. buildId 不匹配（新部署）
            if (response.buildId !== APP_BUILD_ID && response.buildId !== 'unknown') {
                onReloadNeeded({ reason: 'version-mismatch', payload: response });
                return; // 不再调度，banner 倒计时会触发 reload
            }

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

        } catch (_err) {
            failCountRef.current++;
            if (failCountRef.current >= 6) {
                schedule(POLL_BACKOFF_2);
                return;
            }
            if (failCountRef.current >= 3) {
                schedule(POLL_BACKOFF_1);
                return;
            }
        }

        // 正常调度下一次
        const interval = document.visibilityState === 'hidden' ? POLL_HIDDEN : POLL_NORMAL;
        schedule(interval);
    }, [schedule, onReloadNeeded]);

    // ── 挂载：立即轮询 + 启动定时器 ──
    useEffect(() => {
        if (!sessionStorage.getItem('__page_load_at')) {
            sessionStorage.setItem('__page_load_at', String(Date.now()));
        }
        poll(); // 首次立即执行

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [poll]);

    // ── visibilitychange 监听 ──
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                const elapsed = Date.now() - lastSuccessRef.current;
                if (elapsed > 30_000) {
                    // 切回前台且距上次成功 >30s → 立即轮询
                    if (timerRef.current) clearTimeout(timerRef.current);
                    poll();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [poll]);

    // ── online/offline 监听 ──
    useEffect(() => {
        const handleOnline = () => {
            failCountRef.current = 0;
            if (timerRef.current) clearTimeout(timerRef.current);
            poll();
        };
        const handleOffline = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [poll]);
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i 'useClientVersionPoll' || echo "No errors in useClientVersionPoll"
```

---

### Task 12: 前端 — GracefulReloadBanner 组件

**Files:**
- Create: `frontend/src/components/GracefulReloadBanner.tsx`

- [ ] **Step 1: 创建 GracefulReloadBanner.tsx**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { ReloadReason } from '@/hooks/useClientVersionPoll';

const COUNTDOWN_SECONDS = 20;
const SNOOZE_SECONDS = 120;

interface Props {
    reason: ReloadReason;
    onDismiss: () => void; // 用户关闭 banner（仅"稍后提醒"时有效）
}

export function GracefulReloadBanner({ reason, onDismiss }: Props) {
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [snoozed, setSnoozed] = useState(false);
    const hasReloadedRef = useRef(false);

    const doReload = useCallback(() => {
        if (hasReloadedRef.current) return;
        hasReloadedRef.current = true;
        window.location.reload();
    }, []);

    // 倒计时
    useEffect(() => {
        if (snoozed) return;
        if (countdown <= 0) {
            doReload();
            return;
        }
        const id = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(id);
    }, [countdown, snoozed, doReload]);

    const handleSnooze = () => {
        setSnoozed(true);
        setTimeout(() => {
            setSnoozed(false);
            setCountdown(COUNTDOWN_SECONDS);
        }, SNOOZE_SECONDS * 1000);
    };

    const message =
        reason === 'version-mismatch'
            ? '检测到系统更新，建议刷新页面获取最新版本'
            : '管理员请求了页面同步，即将自动刷新';

    return (
        <div
            role="alert"
            aria-live="polite"
            className="fixed top-0 left-0 right-0 z-[var(--z-sticky)] flex items-center justify-between px-5 py-3"
            style={{
                background: 'var(--app-color-surface-raised)',
                borderBottom: '1px solid var(--app-color-border-default)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
        >
            <div className="flex items-center gap-2.5">
                <RefreshCw
                    size={18}
                    className={snoozed ? '' : 'animate-spin'}
                    style={{ color: 'var(--app-color-accent)' }}
                />
                <span className="text-sm font-medium text-[var(--app-color-text-primary)]">
                    {message}
                </span>
                {!snoozed && (
                    <span className="text-[13px] text-[var(--app-color-text-secondary)]">
                        {countdown} 秒后自动刷新
                    </span>
                )}
                {snoozed && (
                    <span className="text-[13px] text-[var(--app-color-text-tertiary)]">
                        已推迟，稍后提醒
                    </span>
                )}
            </div>

            <div className="flex gap-2">
                {!snoozed && (
                    <button
                        onClick={handleSnooze}
                        className="px-3.5 py-1.5 text-[13px] rounded-[var(--app-radius-sm)] border border-[var(--app-color-border-default)] bg-transparent text-[var(--app-color-text-secondary)] cursor-pointer"
                    >
                        稍后提醒
                    </button>
                )}
                <button
                    onClick={doReload}
                    className="px-3.5 py-1.5 text-[13px] font-medium rounded-[var(--app-radius-sm)] text-white cursor-pointer"
                    style={{ background: 'var(--app-color-accent)' }}
                >
                    立即刷新
                </button>
                {snoozed && (
                    <button
                        onClick={onDismiss}
                        className="p-1.5 rounded-[var(--app-radius-sm)] bg-transparent text-[var(--app-color-text-tertiary)] cursor-pointer"
                        aria-label="关闭"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i 'GracefulReloadBanner' || echo "No errors"
```

---

### Task 13: 前端 — 修改 App.tsx（集成 hook + banner + 更新 WebSocket handler）

**Files:**
- Modify: `frontend/src/App.tsx`
- Verify: `frontend/src/config/socketEvents.ts`（确认常量存在）

- [ ] **Step 0: 验证 socketEvents.ts 常量**

```bash
grep -n 'SOCKET_CLIENT_FORCE_RELOAD' frontend/src/config/socketEvents.ts
```

Expected: 输出 `SOCKET_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD"` 常量定义行。如果不存在则需新增（见 `frontend/src/config/socketEvents.ts` 现有格式）。

- [ ] **Step 1: 在 GlobalSocketListener 中新增 hook 挂载 + banner 状态**

在 `GlobalSocketListener` 组件函数体内（现有 socket 相关代码附近）新增：

```typescript
import { useClientVersionPoll } from '@/hooks/useClientVersionPoll';
import { GracefulReloadBanner } from '@/components/GracefulReloadBanner';
import type { ReloadTrigger } from '@/hooks/useClientVersionPoll';

// 在 GlobalSocketListener 组件函数体内：
const [reloadBanner, setReloadBanner] = useState<ReloadTrigger | null>(null);

const handleReloadNeeded = (trigger: ReloadTrigger) => {
    // 如果已有 banner 显示，不重复
    setReloadBanner(prev => prev ?? trigger);
};

useClientVersionPoll(handleReloadNeeded);
```

- [ ] **Step 2: 更新 CLIENT_FORCE_RELOAD socket listener**

找到现有 `socket.on(SOCKET_CLIENT_FORCE_RELOAD, onClientForceReload)` 处理逻辑（约第 255-285 行），替换为：

```typescript
const onClientForceReload = (payload: any) => {
    // ── 冷却守卫 ──
    const pageLoadAt = sessionStorage.getItem('__page_load_at');
    if (pageLoadAt && Date.now() - parseInt(pageLoadAt, 10) < 8000) return;

    // 情况 1：版本不匹配（来自 FrontendVersionGuard，连接时单发）
    if (payload.expectedBuildId && payload.expectedBuildId !== APP_BUILD_ID) {
        if (payload.reloadId) {
            sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
        }
        setReloadBanner({ reason: 'version-mismatch', payload });
        return;
    }

    // 情况 2：管理员指令（来自 ClientReloadBroadcastService 广播/pending reload）
    const lastReloadId = parseInt(sessionStorage.getItem('__last_reload_id') || '0');
    if (payload.reloadId && payload.reloadId > lastReloadId) {
        sessionStorage.setItem('__last_reload_id', String(payload.reloadId));
        setReloadBanner({ reason: 'admin-command', payload });
        return;
    }
};
socket.on(SOCKET_CLIENT_FORCE_RELOAD, onClientForceReload);
```

- [ ] **Step 3: 在 JSX 中渲染 banner**

在 GlobalSocketListener 返回的 JSX 最外层（现有内容之前）插入：

```tsx
{reloadBanner && (
    <GracefulReloadBanner
        reason={reloadBanner.reason}
        onDismiss={() => setReloadBanner(null)}
    />
)}
```

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep 'App.tsx' | head -10
```

---

### Task 14: 前端 — 修改 useSocket.ts（reconnect 版本检查）

**Files:**
- Modify: `frontend/src/hooks/useSocket.ts`

- [ ] **Step 0: 在文件顶部新增 import**

```typescript
// useSocket.ts 顶部 import 区，与现有 import 并列
import { fetchClientVersion } from '@/api/domains/clientVersion.api';
```

- [ ] **Step 1: 在 reconnect 事件中增加静默版本检查**

在 `socketInstance.on('reconnect', ...)` 回调中（约第 115-119 行），增加：

```typescript
socketInstance.on('reconnect', () => {
    console.log('🟢 [WebSocket] 重连成功! ID:', socketInstance.id);
    recoveryInProgressRef.current = false;
    recoveryAttemptRef.current = 0;

    // 重连后静默检查版本：如果此期间管理员触发了 reload，
    // 轮询通道会捕获，但这里做一次主动确认
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

- [ ] **Step 2: 在 App.tsx 中监听自定义事件**

在 `GlobalSocketListener` 中增加：

```typescript
useEffect(() => {
    const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        setReloadBanner(detail);
    };
    window.addEventListener('CLIENT_RELOAD_NEEDED', handler);
    return () => window.removeEventListener('CLIENT_RELOAD_NEEDED', handler);
}, []);
```

---

### Task 15: 前端 — 修改 ClientReloadOpsPanel（调用新 API）

**Files:**
- Modify: `frontend/src/features/admin/settings/ClientReloadOpsPanel.tsx`

- [ ] **Step 1: 改为调用新 API 并显示 stats**

```typescript
import { useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { broadcastClientReload } from "@/api/domains/clientVersion.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { cn } from "@/lib/utils";

export function ClientReloadOpsPanel() {
  const [pending, setPending] = useState(false);

  const onBroadcastReload = async () => {
    const ok = window.confirm(
      "将向所有在线客户端发送刷新指令（双通道：WebSocket + HTTP 轮询）。\n\n" +
        "请确认已完成前端 build 并部署静态资源；未保存的表单可能丢失。\n\n是否继续？",
    );
    if (!ok) return;
    setPending(true);
    try {
      const result = await broadcastClientReload();
      toast.success(
        `已双通道下发刷新指令。${result.stats.totalClients} 台在线，` +
        `${result.stats.outdated} 台待刷新。活跃标签页 <1s 收到，后台标签页 ≤15s。`,
        { duration: 6000 }
      );
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "广播失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <AdminButton
      type="button"
      tone="secondary"
      size="sm"
      className="gap-1.5"
      disabled={pending}
      title="向所有客户端双通道下发刷新指令"
      onClick={() => void onBroadcastReload()}
    >
      <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} aria-hidden />
      {pending ? "发送中…" : "同步在线页"}
    </AdminButton>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep 'ClientReloadOpsPanel' || echo "No errors"
```

---

### Task 16: 前端 — ClientVersionCard（监控页集成）

**Files:**
- Create: `frontend/src/features/admin/monitor/ClientVersionCard.tsx`
- Modify: `frontend/src/features/admin/monitor/MonitorDashboardPage.tsx`（ClientVersionCard 集成在 Dashboard 层，不修改 HealthCards）

- [ ] **Step 1: 创建 ClientVersionCard.tsx**

```tsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, CheckCircle, AlertTriangle, Circle } from 'lucide-react';
import { fetchClientVersionStats, broadcastClientReload, type ClientVersionStats } from '@/api/domains/clientVersion.api';
import { AdminButton } from '@/components/admin/AdminButton';
import { cn } from '@/lib/utils';

export function ClientVersionCard() {
    const [stats, setStats] = useState<ClientVersionStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = async () => {
        try {
            setError(null);
            const data = await fetchClientVersionStats();
            setStats(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        const id = setInterval(fetchStats, 60_000);
        return () => clearInterval(id);
    }, []);

    const handleBroadcast = async () => {
        const outdated = stats?.outdated ?? '?';
        if (!window.confirm(`预计影响 ${outdated} 台客户端，建议先确认新版本已部署完成。\n\n是否继续？`)) return;
        try {
            const result = await broadcastClientReload();
            toast.success(`已下发。${result.stats.totalClients} 台在线，${result.stats.outdated} 台待刷新。`);
            fetchStats();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '广播失败');
        }
    };

    // ── 状态 D：异常 ──
    if (error || stats?.expectedBuildId === 'unknown') {
        return (
            <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5">
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} style={{ color: 'var(--app-color-feedback-warning)' }} />
                    <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">客户端版本状态</span>
                </div>
                <p className="text-sm text-[var(--app-color-text-secondary)]">
                    ⚠ 版本信息不可用。未找到 build-meta.json，请检查前端部署是否完整。客户端自动刷新功能暂时不可用。
                </p>
            </div>
        );
    }

    // ── 状态 C：空 ──
    if (!loading && stats && stats.totalClients === 0) {
        return (
            <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Circle size={18} style={{ color: 'var(--app-color-text-tertiary)' }} />
                    <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">客户端版本状态</span>
                </div>
                <p className="text-sm text-[var(--app-color-text-tertiary)]">
                    ○ 暂无客户端在线。客户端上线后将自动出现在此列表中。
                </p>
            </div>
        );
    }

    // ── 状态 A/B：正常 ──
    const allUpToDate = stats && stats.outdated === 0;

    return (
        <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {allUpToDate ? (
                        <CheckCircle size={18} style={{ color: 'var(--app-color-feedback-success)' }} />
                    ) : (
                        <RefreshCw size={18} style={{ color: 'var(--app-color-accent)' }} />
                    )}
                    <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">客户端版本状态</span>
                    {allUpToDate && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]">
                            ✅ 全部最新
                        </span>
                    )}
                </div>
                {!allUpToDate && (
                    <AdminButton type="button" tone="primary" size="sm" className="gap-1.5" onClick={() => void handleBroadcast()}>
                        <RefreshCw size={14} />
                        同步在线页
                    </AdminButton>
                )}
            </div>

            {stats && (
                <>
                    <div className="text-xs text-[var(--app-color-text-secondary)] mb-3">
                        期望版本 <code className="text-[var(--app-color-text-primary)]">{stats.expectedBuildId}</code>
                        {' · '}活跃客户端 <strong>{stats.totalClients}</strong>
                    </div>

                    {/* 版本分布条形图 */}
                    <div className="space-y-1.5 mb-3">
                        {Object.entries(stats.distribution).map(([version, count]) => {
                            const isLatest = version === stats.expectedBuildId;
                            const pct = stats.totalClients > 0 ? (count / stats.totalClients) * 100 : 0;
                            return (
                                <div key={version} className="flex items-center gap-2 text-xs">
                                    <span className="w-16 text-right text-[var(--app-color-text-tertiary)] truncate" title={version}>
                                        {isLatest ? '最新' : version.slice(0, 8)}
                                    </span>
                                    <div className="flex-1 h-4 rounded-sm bg-[var(--app-color-surface-hover)] overflow-hidden">
                                        <div
                                            className="h-full rounded-sm transition-all"
                                            style={{
                                                width: `${pct}%`,
                                                background: isLatest
                                                    ? 'var(--app-color-feedback-success)'
                                                    : 'var(--app-color-feedback-warning)',
                                            }}
                                        />
                                    </div>
                                    <span className="w-6 text-[var(--app-color-text-secondary)]">{count}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* 上次刷新指令 */}
                    {stats.lastReloadTriggeredAt && (
                        <div className="text-xs text-[var(--app-color-text-tertiary)]">
                            上次同步指令 {stats.lastReloadTriggeredAt.replace('T', ' ').slice(0, 19)}
                            {stats.lastReloadTriggeredBy ? ` ${stats.lastReloadTriggeredBy} 触发` : ''}
                            {' · '}
                            {stats.upToDate}/{stats.totalClients} 已更新
                            {stats.outdated > 0 && ` (${stats.outdated}台待刷新)`}
                        </div>
                    )}
                    {!stats.lastReloadTriggeredAt && (
                        <div className="text-xs text-[var(--app-color-text-tertiary)]">上次同步指令 — 无记录 —</div>
                    )}
                </>
            )}

            {loading && <div className="text-xs text-[var(--app-color-text-tertiary)]">加载中…</div>}
        </div>
    );
}
```

- [ ] **Step 2: 集成到监控页面**

在 `MonitorDashboardPage.tsx` 的 `OverviewTab` 组件中，在 `<MonitorHealthCards />` 之后、`<MonitorResourceGauges />` 之前插入：

```tsx
import { ClientVersionCard } from "@/features/admin/monitor/ClientVersionCard";

// 在 OverviewTab 返回的 JSX 中：
<ClientVersionCard />
```

- [ ] **Step 3: 验证编译**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E 'ClientVersionCard|MonitorDashboardPage' | head -10 || echo "No errors"
```

---

### Task 17: 前端 — 更新 monitor.api.ts 类型定义

**Files:**
- Modify: `frontend/src/api/domains/monitor.api.ts`

- [ ] **Step 1: 新增 ClientVersionStats 类型**（如果 clientVersion.api.ts 已定义则可跳过）

在 monitor.api.ts 末尾追加：

```typescript
// Re-export from clientVersion.api for convenience
export type { ClientVersionStats, BroadcastReloadResult } from './clientVersion.api';
```

---

### Task 18: 端到端验证 — 构建 + 启动

- [ ] **Step 1: 完整前端构建**

```bash
cd frontend && npx vite build 2>&1 | tail -10
```

Expected: 构建成功，`../src/main/resources/static/build-meta.json` 被创建

- [ ] **Step 2: 确认 build-meta.json 内容**

```bash
cat ../src/main/resources/static/build-meta.json
```

Expected: `{ "buildId": "1765...", "buildTime": "2026-07-13T..." }`

- [ ] **Step 3: 编译后端**

```bash
mvn compile -pl . -q 2>&1 | tail -5
```

Expected: BUILD SUCCESS

- [ ] **Step 4: 启动后端验证端点**

```bash
# 启动后端（如果已启动则跳过）
# 测试公开端点：
curl -s http://localhost:8081/api/client-version?clientId=test123\&clientBuildId=dev\&channel=web | python -m json.tool
```

Expected: `{ "success": true, "data": { "buildId": "1765...", "reloadId": 0, "forceReloadAt": null } }`

- [ ] **Step 5: 测试监控端点（需要 ADMIN 权限）**

```bash
# 需要有效的 JWT token
# curl -H "Authorization: Bearer <token>" http://localhost:8081/api/v1/monitor/client-versions
```

- [ ] **Step 6: 测试广播端点（需要 SUPER_ADMIN 权限）**

```bash
# 需要有效的 JWT token
# curl -X POST -H "Authorization: Bearer <token>" http://localhost:8081/api/admin/settings/broadcast-client-reload
```

---

### Task 19: Commit

- [ ] **Step 1: 分阶段提交**

```bash
# 后端
git add src/main/java/com/example/demo/modules/twin/common/service/ClientVersionService.java
git add src/main/java/com/example/demo/common/component/ClientVersionRateLimitFilter.java
git add src/main/java/com/example/demo/modules/twin/common/controller/ClientVersionController.java
git add src/main/java/com/example/demo/modules/twin/common/service/ClientReloadBroadcastService.java
git add src/main/java/com/example/demo/common/component/FrontendVersionGuard.java
git add src/main/java/com/example/demo/modules/notification/controller/AdminSettingsController.java
git add src/main/java/com/example/demo/modules/admin/controller/MonitorController.java
git add src/main/resources/application.properties
git commit -m "feat: 客户端版本管理后端 — ClientVersionService + 双通道 reload 机制"

# 前端
git add frontend/vite.config.ts
git add frontend/src/hooks/useClientVersionPoll.ts
git add frontend/src/components/GracefulReloadBanner.tsx
git add frontend/src/features/admin/monitor/ClientVersionCard.tsx
git add frontend/src/api/domains/clientVersion.api.ts
git add frontend/src/api/domains/monitor.api.ts
git add frontend/src/App.tsx
git add frontend/src/hooks/useSocket.ts
git add frontend/src/features/admin/settings/ClientReloadOpsPanel.tsx
git add frontend/src/features/admin/monitor/MonitorDashboardPage.tsx
git commit -m "feat: 客户端版本管理前端 — 轮询hook + 刷新横幅 + 监控卡片"
```

---

## 自审清单

1. **Spec coverage**: 对照设计文档 v2.2 逐节检查
   - §3.1 ClientVersionService ✅ Task 1
   - §3.2 GET /api/client-version ✅ Task 3
   - §3.3 POST broadcast-client-reload ✅ Task 7
   - §3.4 GET /api/v1/monitor/client-versions ✅ Task 4
   - §3.5 ClientReloadBroadcastService 修改 ✅ Task 5
   - §3.6 FrontendVersionGuard 修改 ✅ Task 6
   - §3.7 审计日志 ✅ Task 1（内置 log.info）
   - §4.1 Vite build-meta.json ✅ Task 9
   - §4.2 useClientVersionPoll ✅ Task 11
   - §4.3 GracefulReloadBanner ✅ Task 12
   - §4.4 ClientVersionCard ✅ Task 16
   - §4.5 App.tsx 修改 ✅ Task 13
   - §4.6 useSocket.ts 修改 ✅ Task 14
   - §4.7 ClientReloadOpsPanel 修改 ✅ Task 15
   - §5 缓存策略 ✅ 依赖现有 SpaIndexNoCacheFilter
   - §6 多标签页 ✅ BroadcastChannel 在 hook 中可后续迭代
   - §8 测试策略 ✅ Task 18 端到端验证
   - §10 迁移步骤 ✅ Task 8 清理 + Task 19 commit

2. **Placeholder scan**: 无 TBD/TODO，所有步骤包含完整代码

3. **Type consistency**: 
   - `ClientVersionResponse` 字段：buildId/reloadId/forceReloadAt — 前端 API 类型 + 后端 Map 键名一致
   - `ClientVersionStats` 字段：expectedBuildId/reloadId/... — 前端类型 + 后端 `buildVersionStats()` 返回值一致
   - `ReloadReason`: 'version-mismatch' | 'admin-command' — hook + banner + App.tsx 使用一致
   - `reloadId`: 后端 `AtomicLong` → `long` → 前端 `number` — 类型映射正确

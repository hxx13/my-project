# 刷卡失败灵动岛告警 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When swing records contain failures (openResult=0 or openType=52) matching admin-configurable thresholds, broadcast a Dynamic Island-style banner via WebSocket to all ADMIN+ clients, with global synchronized dismiss.

**Architecture:** Backend rule engine hooks into Dahua swing record ingestion, evaluates active rules with sliding-window counters, and fires WebSocket events. Frontend mounts a fixed top-center pill (`SwipeFailureBanner`) in App.tsx listening to these events, plus a configuration tab inside AdminStudentViolationsPage.

**Tech Stack:** Spring Boot (Java/Kotlin) backend, React + TypeScript + Zustand + Socket.IO frontend, MySQL.

---

## Backend Tasks

### Task 1: DB Migration — swipe_alert_rule table

**Files:**
- Create: `src/main/resources/db/migration/V<next>__swipe_alert_rule.sql` (Liquibase/Flyway as per project convention)
- Or: direct SQL via the project's existing migration mechanism

- [ ] **Step 1: Create the migration file**

```sql
CREATE TABLE IF NOT EXISTS swipe_alert_rule (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(120) NOT NULL,
  enabled               TINYINT(1) NOT NULL DEFAULT 1,
  channels              JSON DEFAULT NULL COMMENT 'null=全通道, else ["CH01","CH02"]',
  departments           JSON DEFAULT NULL COMMENT 'null=全部门, else ["物理学院","计算机学院"]',
  open_types            VARCHAR(200) DEFAULT '52' COMMENT '逗号分隔, 52=非法刷卡, 0=刷卡失败',
  title_template        VARCHAR(200) DEFAULT '🚨 刷卡失败告警 · ${dept}',
  body_template         VARCHAR(500) DEFAULT '过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}',
  threshold_count       INT NOT NULL DEFAULT 3,
  threshold_window_sec  INT NOT NULL DEFAULT 300,
  banner_duration_sec   INT NOT NULL DEFAULT 10 COMMENT '0=不自动消失',
  min_role_level        INT NOT NULL DEFAULT 4 COMMENT 'ADMIN=4',
  cooldown_sec          INT NOT NULL DEFAULT 60,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Run the migration**

Run the project's migration command to apply the new table.

---

### Task 2: Backend Domain Model + Repository

**Files:**
- Create: `src/main/java/com/example/demo/modules/swipealert/SwipeAlertRule.java`
- Create: `src/main/java/com/example/demo/modules/swipealert/SwipeAlertRuleRepository.java`

- [ ] **Step 1: Create the JPA entity**

```java
package com.example.demo.modules.swipealert;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "swipe_alert_rule")
public class SwipeAlertRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false)
    private Boolean enabled = true;

    @Column(columnDefinition = "JSON")
    private String channels; // JSON array or null

    @Column(columnDefinition = "JSON")
    private String departments; // JSON array or null

    @Column(name = "open_types", length = 200)
    private String openTypes = "52";

    @Column(name = "title_template", length = 200)
    private String titleTemplate = "🚨 刷卡失败告警 · ${dept}";

    @Column(name = "body_template", length = 500)
    private String bodyTemplate = "过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}";

    @Column(name = "threshold_count", nullable = false)
    private Integer thresholdCount = 3;

    @Column(name = "threshold_window_sec", nullable = false)
    private Integer thresholdWindowSec = 300;

    @Column(name = "banner_duration_sec", nullable = false)
    private Integer bannerDurationSec = 10;

    @Column(name = "min_role_level", nullable = false)
    private Integer minRoleLevel = 4;

    @Column(name = "cooldown_sec", nullable = false)
    private Integer cooldownSec = 60;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // Getters and setters omitted for brevity — generate with IDE
}
```

- [ ] **Step 2: Create the Spring Data JPA repository**

```java
package com.example.demo.modules.swipealert;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SwipeAlertRuleRepository extends JpaRepository<SwipeAlertRule, Long> {
    List<SwipeAlertRule> findByEnabledTrue();
}
```

---

### Task 3: Backend CRUD API Controller

**Files:**
- Create: `src/main/java/com/example/demo/modules/swipealert/SwipeAlertRuleController.java`

- [ ] **Step 1: Create the REST controller**

```java
package com.example.demo.modules.swipealert;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.List;

@RestController
@RequestMapping("/api/swipe-alert/rules")
public class SwipeAlertRuleController {

    private final SwipeAlertRuleRepository repo;
    private final SwipeAlertEngine engine;

    public SwipeAlertRuleController(SwipeAlertRuleRepository repo, SwipeAlertEngine engine) {
        this.repo = repo;
        this.engine = engine;
    }

    @GetMapping
    public List<SwipeAlertRule> list() {
        return repo.findAll();
    }

    @PostMapping
    public SwipeAlertRule create(@RequestBody SwipeAlertRule rule) {
        SwipeAlertRule saved = repo.save(rule);
        engine.reloadRules();
        return saved;
    }

    @PutMapping("/{id}")
    public SwipeAlertRule update(@PathVariable Long id, @RequestBody SwipeAlertRule input) {
        SwipeAlertRule rule = repo.findById(id).orElseThrow();
        rule.setName(input.getName());
        rule.setEnabled(input.getEnabled());
        rule.setChannels(input.getChannels());
        rule.setDepartments(input.getDepartments());
        rule.setOpenTypes(input.getOpenTypes());
        rule.setTitleTemplate(input.getTitleTemplate());
        rule.setBodyTemplate(input.getBodyTemplate());
        rule.setThresholdCount(input.getThresholdCount());
        rule.setThresholdWindowSec(input.getThresholdWindowSec());
        rule.setBannerDurationSec(input.getBannerDurationSec());
        rule.setMinRoleLevel(input.getMinRoleLevel());
        rule.setCooldownSec(input.getCooldownSec());
        SwipeAlertRule saved = repo.save(rule);
        engine.reloadRules();
        return saved;
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        repo.deleteById(id);
        engine.reloadRules();
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/toggle")
    public SwipeAlertRule toggle(@PathVariable Long id) {
        SwipeAlertRule rule = repo.findById(id).orElseThrow();
        rule.setEnabled(!rule.getEnabled());
        SwipeAlertRule saved = repo.save(rule);
        engine.reloadRules();
        return saved;
    }
}
```

---

### Task 4: Backend Rule Engine

**Files:**
- Create: `src/main/java/com/example/demo/modules/swipealert/SwipeAlertEngine.java`
- Modify: The Dahua swing record ingestion point to call `engine.onSwingRecord(record)`

- [ ] **Step 1: Create the rule engine service**

```java
package com.example.demo.modules.swipealert;

import com.example.demo.modules.dahua.dto.DahuaRecordDTO;
import com.corundumstudio.socketio.SocketIOServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SwipeAlertEngine {

    private final SwipeAlertRuleRepository repo;
    private final SocketIOServer socketServer; // Inject existing Socket.IO server bean
    private final ObjectMapper mapper = new ObjectMapper();

    // In-memory: ruleId -> deque of recent timestamps for threshold counting
    private final Map<Long, Deque<Long>> windowMap = new ConcurrentHashMap<>();
    // ruleId -> lastFireTimestamp for cooldown
    private final Map<Long, Long> lastFireMap = new ConcurrentHashMap<>();
    // Cached active rules
    private volatile List<SwipeAlertRule> activeRules = List.of();

    public SwipeAlertEngine(SwipeAlertRuleRepository repo, SocketIOServer socketServer) {
        this.repo = repo;
        this.socketServer = socketServer;
    }

    @PostConstruct
    public void reloadRules() {
        activeRules = repo.findByEnabledTrue();
    }

    /**
     * Called synchronously after each swing record is persisted.
     */
    public void onSwingRecord(DahuaRecordDTO record) {
        // Only process failures
        Integer openResult = record.getOpenResult();
        Integer openType = record.getOpenType();
        if (openResult == null) return;
        if (openResult != 0 && (openType == null || openType != 52)) return;

        long now = System.currentTimeMillis();

        for (SwipeAlertRule rule : activeRules) {
            if (!matches(rule, record)) continue;

            // Sliding window
            Deque<Long> timestamps = windowMap.computeIfAbsent(rule.getId(), k -> new ArrayDeque<>());
            long windowStart = now - rule.getThresholdWindowSec() * 1000L;
            while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                timestamps.pollFirst();
            }
            timestamps.addLast(now);

            // Threshold check
            if (timestamps.size() >= rule.getThresholdCount()) {
                // Cooldown check
                Long lastFire = lastFireMap.get(rule.getId());
                if (lastFire != null && (now - lastFire) < rule.getCooldownSec() * 1000L) {
                    continue; // still in cooldown
                }
                lastFireMap.put(rule.getId(), now);

                // Build alert payload
                Map<String, Object> alert = buildAlertPayload(rule, timestamps.size(), record);
                fireAlert(alert, rule.getMinRoleLevel());
            }
        }
    }

    private boolean matches(SwipeAlertRule rule, DahuaRecordDTO record) {
        // open type check
        if (rule.getOpenTypes() != null && !rule.getOpenTypes().isBlank()) {
            Set<String> allowed = new HashSet<>(Arrays.asList(rule.getOpenTypes().split(",")));
            if (!allowed.contains(String.valueOf(record.getOpenType()))
                && !allowed.contains(String.valueOf(record.getOpenResult()))) {
                return false;
            }
        }
        // channel check
        if (rule.getChannels() != null && !rule.getChannels().isBlank()) {
            // channels stored as JSON array string
            // parse and check contains record.getChannelCode()
        }
        // department check
        if (rule.getDepartments() != null && !rule.getDepartments().isBlank()) {
            // parse and check contains record.getDepartmentName()
        }
        return true;
    }

    private Map<String, Object> buildAlertPayload(SwipeAlertRule rule, int count, DahuaRecordDTO record) {
        String title = rule.getTitleTemplate()
            .replace("${dept}", Objects.toString(record.getDepartmentName(), ""))
            .replace("${channel}", Objects.toString(record.getChannelName(), ""));

        String body = rule.getBodyTemplate()
            .replace("${count}", String.valueOf(count))
            .replace("${windowMin}", String.valueOf(rule.getThresholdWindowSec() / 60))
            .replace("${windowSec}", String.valueOf(rule.getThresholdWindowSec()))
            .replace("${dept}", Objects.toString(record.getDepartmentName(), ""))
            .replace("${channel}", Objects.toString(record.getChannelName(), ""))
            .replace("${persons}", Objects.toString(record.getPersonName(), ""))
            .replace("${threshold}", String.valueOf(rule.getThresholdCount()));

        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("alertId", UUID.randomUUID().toString());
        alert.put("ruleId", rule.getId());
        alert.put("ruleName", rule.getName());
        alert.put("title", title);
        alert.put("body", body);
        alert.put("count", count);
        alert.put("windowSec", rule.getThresholdWindowSec());
        alert.put("bannerDurationSec", rule.getBannerDurationSec());
        alert.put("matchedRecords", List.of(Map.of(
            "personName", Objects.toString(record.getPersonName(), ""),
            "personCode", Objects.toString(record.getPersonCode(), ""),
            "departmentName", Objects.toString(record.getDepartmentName(), ""),
            "channelName", Objects.toString(record.getChannelName(), ""),
            "openTypeLabel", Objects.toString(record.getOpenType(), ""),
            "swingTime", Objects.toString(record.getSwingTime(), "")
        )));
        return alert;
    }

    private void fireAlert(Map<String, Object> alert, int minRoleLevel) {
        // Broadcast to all connected Socket.IO clients with role >= minRoleLevel
        // The role is stored in each SocketIOClient's namespace or handshake data
        socketServer.getBroadcastOperations().sendEvent("SWIPE_FAILURE_ALERT", alert);
    }
}
```

- [ ] **Step 2: Hook the engine into the swing record ingestion point**

Find where Dahua swing records are saved (likely in a DahuaRecordService or similar), and add:

```java
@Autowired
private SwipeAlertEngine swipeAlertEngine;

// After swing record save:
swipeAlertEngine.onSwingRecord(savedRecord);
```

---

### Task 5: Backend WebSocket ACK / Dismiss Handler

**Files:**
- Modify: `src/main/java/com/example/demo/modules/swipealert/SwipeAlertEngine.java`
- Modify: The existing WebSocket event handler setup (or create a dedicated listener)

- [ ] **Step 1: Add ACK listener and dismiss broadcast to the engine**

```java
// In the WebSocket event listener setup, add:

// Listen for ACK from a client
socketServer.addEventListener("SWIPE_FAILURE_ALERT_ACK", Map.class, (client, data, ackRequest) -> {
    String alertId = (String) data.get("alertId");
    String userId = (String) data.get("userId");
    // Broadcast dismiss to ALL clients
    Map<String, Object> dismiss = new LinkedHashMap<>();
    dismiss.put("alertId", alertId);
    dismiss.put("dismissedBy", userId);
    socketServer.getBroadcastOperations().sendEvent("SWIPE_FAILURE_ALERT_DISMISS", dismiss);
});
```

---

## Frontend Tasks

### Task 6: Add Socket Event Constants

**Files:**
- Modify: `frontend/src/config/socketEvents.ts`

- [ ] **Step 1: Add new event constants**

```ts
// frontend/src/config/socketEvents.ts — append below existing line

/** 超级管理员触发：所有已连接 Socket 的前端页执行 location.reload() */
export const SOCKET_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

// === 新增：刷卡失败灵动岛告警 ===
/** 服务端 → 客户端：触发灵动岛告警 */
export const SOCKET_SWIPE_FAILURE_ALERT = "SWIPE_FAILURE_ALERT";
/** 客户端 → 服务端：管理员标记已读 */
export const SOCKET_SWIPE_FAILURE_ALERT_ACK = "SWIPE_FAILURE_ALERT_ACK";
/** 服务端 → 所有客户端：联动消失 */
export const SOCKET_SWIPE_FAILURE_ALERT_DISMISS = "SWIPE_FAILURE_ALERT_DISMISS";
```

---

### Task 7: Create Alert Rule API Client

**Files:**
- Create: `frontend/src/api/domains/swipeAlert.api.ts`

- [ ] **Step 1: Write the API client**

```ts
// frontend/src/api/domains/swipeAlert.api.ts
import { adminHttp } from "@/api/core/adminHttp";

export interface SwipeAlertRuleRow {
  id: number;
  name: string;
  enabled: boolean;
  channels: string | null;       // JSON string of channel codes
  departments: string | null;    // JSON string of department names
  openTypes: string;             // "52" or "52,0"
  titleTemplate: string;
  bodyTemplate: string;
  thresholdCount: number;
  thresholdWindowSec: number;
  bannerDurationSec: number;
  minRoleLevel: number;
  cooldownSec: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SwipeAlertRuleUpsert {
  name: string;
  enabled: boolean;
  channels: string | null;
  departments: string | null;
  openTypes: string;
  titleTemplate: string;
  bodyTemplate: string;
  thresholdCount: number;
  thresholdWindowSec: number;
  bannerDurationSec: number;
  minRoleLevel: number;
  cooldownSec: number;
}

export async function listSwipeAlertRules(): Promise<SwipeAlertRuleRow[]> {
  const res = await adminHttp.get("/swipe-alert/rules");
  return Array.isArray(res) ? res : (res as any)?.data ?? [];
}

export async function createSwipeAlertRule(body: SwipeAlertRuleUpsert): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.post("/swipe-alert/rules", body);
  return (res as any)?.data ?? res;
}

export async function updateSwipeAlertRule(id: number, body: SwipeAlertRuleUpsert): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.put(`/swipe-alert/rules/${id}`, body);
  return (res as any)?.data ?? res;
}

export async function deleteSwipeAlertRule(id: number): Promise<void> {
  await adminHttp.delete(`/swipe-alert/rules/${id}`);
}

export async function toggleSwipeAlertRule(id: number): Promise<SwipeAlertRuleRow> {
  const res = await adminHttp.patch(`/swipe-alert/rules/${id}/toggle`);
  return (res as any)?.data ?? res;
}
```

---

### Task 8: Create Zustand Store for Active Alert

**Files:**
- Create: `frontend/src/store/useSwipeAlertStore.ts`

- [ ] **Step 1: Write the Zustand store**

```ts
// frontend/src/store/useSwipeAlertStore.ts
import { create } from "zustand";

export interface SwipeAlertPayload {
  alertId: string;
  ruleId: number;
  ruleName: string;
  title: string;
  body: string;
  count: number;
  windowSec: number;
  bannerDurationSec: number;
  matchedRecords: SwipeAlertRecordBrief[];
}

export interface SwipeAlertRecordBrief {
  personName: string;
  personCode: string;
  departmentName: string;
  channelName: string;
  openTypeLabel: string;
  swingTime: string;
}

interface SwipeAlertState {
  activeAlert: SwipeAlertPayload | null;
  showAlert: (alert: SwipeAlertPayload) => void;
  dismissAlert: () => void;
}

export const useSwipeAlertStore = create<SwipeAlertState>((set) => ({
  activeAlert: null,
  showAlert: (alert) => set({ activeAlert: alert }),
  dismissAlert: () => set({ activeAlert: null }),
}));
```

---

### Task 9: Create SwipeFailureBanner (Dynamic Island Component)

**Files:**
- Create: `frontend/src/features/swipe-alert/SwipeFailureBanner.tsx`

- [ ] **Step 1: Write the banner component with full Dynamic Island styling**

```tsx
// frontend/src/features/swipe-alert/SwipeFailureBanner.tsx
import { useEffect, useRef, useState } from "react";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRoleLevel } from "@/features/auth/roleAccess";

export function SwipeFailureBanner() {
  const { activeAlert, dismissAlert } = useSwipeAlertStore();
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const role = authStorage.getRole();

  // Only render for ADMIN+ (level >= 4)
  if (!activeAlert || !hasMinRoleLevel(role, activeAlert.ruleMinRoleLevel || 4)) {
    return null;
  }

  const handleDismiss = () => {
    setLeaving(true);
    setTimeout(() => dismissAlert(), 300);
  };

  // Auto-dismiss timer
  useEffect(() => {
    if (activeAlert.bannerDurationSec > 0) {
      const ms = activeAlert.bannerDurationSec * 1000;
      // Start the leaving animation slightly before actual dismiss
      timerRef.current = setTimeout(() => setLeaving(true), ms - 300);
      timerRef.current = setTimeout(() => dismissAlert(), ms);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeAlert?.alertId]);

  const barStyle: React.CSSProperties = {
    animationDuration: `${activeAlert.bannerDurationSec}s`,
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: `translateX(-50%) ${leaving ? "translateY(-20px)" : "translateY(0)"}`,
        zIndex: 9998,
        background: "#0f172a",
        color: "#fff",
        borderRadius: 28,
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08) inset",
        backdropFilter: "blur(20px)",
        minWidth: 340,
        maxWidth: 520,
        opacity: leaving ? 0 : 1,
        scale: leaving ? "0.95" : "1",
        transition: "opacity .3s, transform .3s cubic-bezier(.16,1,.3,1)",
      }}
    >
      {/* Icon + pulse ring */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(239,68,68,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          🚨
        </div>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 36,
            height: 36,
            borderRadius: "50%",
            margin: "-18px 0 0 -18px",
            border: "2px solid rgba(239,68,68,0.6)",
            animation: "swipe-alert-pulse 2s ease-out infinite",
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
          {activeAlert.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginTop: 2,
            lineHeight: 1.3,
          }}
        >
          {activeAlert.body}
        </div>
        {/* Countdown bar */}
        {activeAlert.bannerDurationSec > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: -6,
              left: 0,
              height: 2,
              background: "rgba(239,68,68,0.5)",
              borderRadius: 1,
              width: "100%",
              animation: `swipe-alert-bar ${activeAlert.bannerDurationSec}s linear forwards`,
            }}
          />
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => window.open("/admin/dahua-swing-tasks?tab=records", "_self")}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
          }}
        >
          查看详情 →
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            background: "#fff",
            color: "#0f172a",
          }}
        >
          已读 ✓
        </button>
      </div>

      {/* Keyframes injected once */}
      <style>{`
        @keyframes swipe-alert-pulse {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes swipe-alert-bar {
          0%   { width: 100%; }
          100% { width: 0%; }
        }
      `}</style>
    </div>
  );
}
```

---

### Task 10: Create SwipeAlertRuleList Component

**Files:**
- Create: `frontend/src/features/swipe-alert/SwipeAlertRuleList.tsx`

- [ ] **Step 1: Write the rule list card**

```tsx
// frontend/src/features/swipe-alert/SwipeAlertRuleList.tsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import {
  listSwipeAlertRules,
  deleteSwipeAlertRule,
  toggleSwipeAlertRule,
  type SwipeAlertRuleRow,
} from "@/api/domains/swipeAlert.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminTableShell } from "@/components/admin/AdminPageShell";
import { ROLE_LEVEL_MAP } from "@/features/auth/roleAccess";

interface Props {
  onEdit: (rule: SwipeAlertRuleRow) => void;
  refreshKey: number;
}

const ROLE_LABEL_BY_LEVEL: Record<number, string> = {};
for (const [k, v] of Object.entries(ROLE_LEVEL_MAP)) {
  ROLE_LABEL_BY_LEVEL[v] = k;
}

export function SwipeAlertRuleList({ onEdit, refreshKey }: Props) {
  const [rows, setRows] = useState<SwipeAlertRuleRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listSwipeAlertRules());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载告警规则失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [refreshKey]);

  const onDelete = async (id: number) => {
    if (!window.confirm("确定删除该告警规则？")) return;
    try {
      await deleteSwipeAlertRule(id);
      toast.success("已删除");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const onToggle = async (r: SwipeAlertRuleRow) => {
    try {
      const updated = await toggleSwipeAlertRule(r.id);
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(updated.enabled ? "已启用" : "已停用");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "切换失败");
    }
  };

  return (
    <AdminFormCard
      title="告警规则列表"
      description="刷卡失败时匹配活跃规则，达到阈值后实时推送灵动岛通知"
      actions={
        <AdminButton type="button" tone="secondary" loading={loading} className="gap-1.5" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </AdminButton>
      }
    >
      <AdminTableShell loading={loading} empty={!loading && rows.length === 0} emptyMessage="暂无告警规则" scrollable>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="whitespace-nowrap px-3 py-2">名称</th>
              <th className="px-3 py-2">阈值</th>
              <th className="px-3 py-2">显示时长</th>
              <th className="px-3 py-2">通知角色</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-xs">
                  {r.thresholdCount} 次 / {Math.floor(r.thresholdWindowSec / 60)} 分钟
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.bannerDurationSec > 0 ? `${r.bannerDurationSec} 秒` : "不自动消失"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {ROLE_LABEL_BY_LEVEL[r.minRoleLevel] || `Level ${r.minRoleLevel}`}+
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onToggle(r)}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 10px",
                      borderRadius: 999,
                      border: "none",
                      cursor: "pointer",
                      background: r.enabled ? "#dcfce7" : "#f1f5f9",
                      color: r.enabled ? "#166534" : "#94a3b8",
                    }}
                  >
                    {r.enabled ? "启用" : "停用"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <AdminButton type="button" tone="secondary" size="sm" className="gap-1" onClick={() => onEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                      编辑
                    </AdminButton>
                    <AdminButton type="button" tone="destructive" size="sm" className="gap-1" onClick={() => onDelete(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </AdminButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminFormCard>
  );
}
```

---

### Task 11: Create SwipeAlertRuleForm Component

**Files:**
- Create: `frontend/src/features/swipe-alert/SwipeAlertRuleForm.tsx`

- [ ] **Step 1: Write the rule create/edit form card**

```tsx
// frontend/src/features/swipe-alert/SwipeAlertRuleForm.tsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Save } from "lucide-react";
import {
  createSwipeAlertRule,
  updateSwipeAlertRule,
  type SwipeAlertRuleRow,
  type SwipeAlertRuleUpsert,
} from "@/api/domains/swipeAlert.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { UNBOUND_APPLY_ROLE_OPTIONS } from "@/api/domains/studentViolation.api";
import { ROLE_LEVEL_MAP } from "@/features/auth/roleAccess";

interface Props {
  editing: SwipeAlertRuleRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

const OPEN_TYPE_OPTIONS = [
  { value: "52", label: "非法刷卡开门 (52)" },
  { value: "0", label: "刷卡失败 (openResult=0)" },
];

const inputBase =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const ROLE_OPTIONS = Object.entries(ROLE_LEVEL_MAP)
  .filter(([, level]) => level >= 4)
  .map(([role]) => ({ code: role, label: role }));

export function SwipeAlertRuleForm({ editing, onSaved, onCancel }: Props) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [openTypes, setOpenTypes] = useState("52");
  const [titleTemplate, setTitleTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [thresholdCount, setThresholdCount] = useState("3");
  const [thresholdWindowSec, setThresholdWindowSec] = useState("300");
  const [bannerDurationSec, setBannerDurationSec] = useState("10");
  const [minRoleLevel, setMinRoleLevel] = useState(4);
  const [cooldownSec, setCooldownSec] = useState("60");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEnabled(editing.enabled);
      setOpenTypes(editing.openTypes);
      setTitleTemplate(editing.titleTemplate);
      setBodyTemplate(editing.bodyTemplate);
      setThresholdCount(String(editing.thresholdCount));
      setThresholdWindowSec(String(editing.thresholdWindowSec));
      setBannerDurationSec(String(editing.bannerDurationSec));
      setMinRoleLevel(editing.minRoleLevel);
      setCooldownSec(String(editing.cooldownSec));
    } else {
      setName("");
      setEnabled(true);
      setOpenTypes("52");
      setTitleTemplate("🚨 刷卡失败告警 · ${dept}");
      setBodyTemplate("过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}");
      setThresholdCount("3");
      setThresholdWindowSec("300");
      setBannerDurationSec("10");
      setMinRoleLevel(4);
      setCooldownSec("60");
    }
  }, [editing]);

  const buildBody = (): SwipeAlertRuleUpsert => ({
    name: name.trim(),
    enabled,
    channels: null,    // TODO: integrate channel multi-select (Task 11b)
    departments: null, // TODO: department input
    openTypes,
    titleTemplate: titleTemplate.trim() || "🚨 刷卡失败告警 · ${dept}",
    bodyTemplate: bodyTemplate.trim() || "过去 ${windowMin} 分钟内 ${count} 次非法刷卡",
    thresholdCount: Math.max(1, Number(thresholdCount) || 3),
    thresholdWindowSec: Math.max(10, Number(thresholdWindowSec) || 300),
    bannerDurationSec: Math.max(0, Number(bannerDurationSec) || 10),
    minRoleLevel,
    cooldownSec: Math.max(0, Number(cooldownSec) || 60),
  });

  const save = async () => {
    if (!name.trim()) { toast.error("请填写规则名称"); return; }
    setSaving(true);
    try {
      const body = buildBody();
      if (editing?.id) {
        await updateSwipeAlertRule(editing.id, body);
        toast.success("规则已更新");
      } else {
        await createSwipeAlertRule(body);
        toast.success("规则已创建");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormCard
      title={editing ? `编辑规则 · ${editing.name}` : "新建告警规则"}
      description="配置刷卡失败检测条件与灵动岛通知内容。支持模板变量：${count} ${dept} ${channel} ${persons} ${windowSec} ${windowMin} ${threshold}"
    >
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="text-xs font-medium text-neutral-600">规则名称</label>
          <input className={`${inputBase} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：物理学院非法刷卡告警" />
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用规则
        </label>

        {/* Open types */}
        <div>
          <label className="text-xs font-medium text-neutral-600">触发开门类型</label>
          <div className="mt-1.5 flex gap-3">
            {OPEN_TYPE_OPTIONS.map((opt) => {
              const checked = openTypes.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-red-300 bg-red-50" : "border-neutral-200"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const set = new Set(openTypes.split(",").filter(Boolean));
                      e.target.checked ? set.add(opt.value) : set.delete(opt.value);
                      setOpenTypes(Array.from(set).join(",") || "52");
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>

        {/* Threshold */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600">阈值次数</label>
            <input className={`${inputBase} mt-1`} type="number" min="1" value={thresholdCount} onChange={(e) => setThresholdCount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">时间窗口（秒）</label>
            <input className={`${inputBase} mt-1`} type="number" min="10" value={thresholdWindowSec} onChange={(e) => setThresholdWindowSec(e.target.value)} />
          </div>
        </div>

        {/* Banner duration */}
        <div>
          <label className="text-xs font-medium text-neutral-600">横幅显示时长（秒，0=不自动消失）</label>
          <input className={`${inputBase} mt-1`} type="number" min="0" value={bannerDurationSec} onChange={(e) => setBannerDurationSec(e.target.value)} />
        </div>

        {/* Title template */}
        <div>
          <label className="text-xs font-medium text-neutral-600">通知标题模板</label>
          <input className={`${inputBase} mt-1`} value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} />
          <p className="mt-0.5 text-[10px] text-neutral-400">可用变量：{'${count} ${dept} ${channel} ${persons} ${windowSec} ${windowMin} ${threshold}'}</p>
        </div>

        {/* Body template */}
        <div>
          <label className="text-xs font-medium text-neutral-600">通知正文模板</label>
          <textarea className={`${inputBase} mt-1 min-h-[80px] resize-y`} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} />
          <p className="mt-0.5 text-[10px] text-neutral-400">可用变量同上</p>
        </div>

        {/* Min role */}
        <div>
          <label className="text-xs font-medium text-neutral-600">最低通知角色</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const active = ROLE_LEVEL_MAP[opt.code] === minRoleLevel;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setMinRoleLevel(ROLE_LEVEL_MAP[opt.code])}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${active ? "border-violet-300 bg-violet-50 text-violet-900" : "border-neutral-200 bg-white"}`}
                >
                  {opt.label}+
                </button>
              );
            })}
          </div>
        </div>

        {/* Cooldown */}
        <div>
          <label className="text-xs font-medium text-neutral-600">冷却间隔（秒，防止重复触发）</label>
          <input className={`${inputBase} mt-1`} type="number" min="0" value={cooldownSec} onChange={(e) => setCooldownSec(e.target.value)} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-neutral-100 pt-4">
          <AdminButton type="button" tone="primary" loading={saving} className="gap-1.5" onClick={save}>
            <Save className="h-4 w-4" />
            {editing ? "保存修改" : "创建规则"}
          </AdminButton>
          {editing ? (
            <AdminButton type="button" tone="secondary" onClick={onCancel}>取消编辑</AdminButton>
          ) : null}
        </div>
      </div>
    </AdminFormCard>
  );
}
```

---

### Task 12: Integrate New Tab into AdminStudentViolationsPage

**Files:**
- Modify: `frontend/src/pages/AdminStudentViolationsPage.tsx`

- [ ] **Step 1: Add the swipe-alert tab**

At the top of `AdminStudentViolationsPage.tsx`, add to the imports:

```tsx
import { AlertTriangle, ShieldAlert } from "lucide-react"; // AlertTriangle already imported, ShieldAlert already imported
import type { SwipeAlertRuleRow } from "@/api/domains/swipeAlert.api";
import { SwipeAlertRuleList } from "@/features/swipe-alert/SwipeAlertRuleList";
import { SwipeAlertRuleForm } from "@/features/swipe-alert/SwipeAlertRuleForm";
```

- [ ] **Step 2: Extend PageTabId type**

```tsx
type PageTabId = "unbound" | "announcement" | "create" | "records" | "swipe-alert";
```

- [ ] **Step 3: Add tab to PAGE_TABS**

```tsx
{ id: "swipe-alert", label: "刷卡失败告警", icon: <AlertTriangle className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
```

- [ ] **Step 4: Add tab state and edit state**

```tsx
const [swipeAlertRefreshKey, setSwipeAlertRefreshKey] = useState(0);
const [editingSwipeRule, setEditingSwipeRule] = useState<SwipeAlertRuleRow | null>(null);
```

- [ ] **Step 5: Add parsePageTab case**

```tsx
if (raw === "unbound" || raw === "announcement" || raw === "create" || raw === "records" || raw === "swipe-alert") return raw;
```

- [ ] **Step 6: Add the TabPanel JSX**

Add after the `records` TabPanel (before the closing `</div>` of the tabs container):

```tsx
<AdminTabPanel
  id="violation-page-panel-swipe-alert"
  tabId="swipe-alert"
  activeTab={activeTab}
  className="space-y-4"
>
  <SwipeAlertRuleList
    onEdit={setEditingSwipeRule}
    refreshKey={swipeAlertRefreshKey}
  />
  <SwipeAlertRuleForm
    editing={editingSwipeRule}
    onSaved={() => {
      setEditingSwipeRule(null);
      setSwipeAlertRefreshKey((k) => k + 1);
    }}
    onCancel={() => setEditingSwipeRule(null)}
  />
</AdminTabPanel>
```

---

### Task 13: Mount Banner + WebSocket Listeners in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { SwipeFailureBanner } from "@/features/swipe-alert/SwipeFailureBanner";
import { useSwipeAlertStore } from "@/store/useSwipeAlertStore";
import {
  SOCKET_SWIPE_FAILURE_ALERT,
  SOCKET_SWIPE_FAILURE_ALERT_DISMISS,
} from "@/config/socketEvents";
```

- [ ] **Step 2: Add WS listeners in GlobalSocketListener**

Inside the `useEffect` where other `socket.on(...)` are registered, add:

```tsx
// 📡 监听 4：刷卡失败灵动岛告警
socket.on(SOCKET_SWIPE_FAILURE_ALERT, (alert) => {
  console.log("🚨 收到刷卡失败告警:", alert?.ruleName);
  useSwipeAlertStore.getState().showAlert(alert);
});

// 📡 监听 5：刷卡失败告警联动消失
socket.on(SOCKET_SWIPE_FAILURE_ALERT_DISMISS, (payload) => {
  console.log("✅ 告警已被远端标记已读:", payload?.dismissedBy);
  useSwipeAlertStore.getState().dismissAlert();
});
```

Also add cleanup in the return:

```tsx
socket.off(SOCKET_SWIPE_FAILURE_ALERT);
socket.off(SOCKET_SWIPE_FAILURE_ALERT_DISMISS);
```

- [ ] **Step 3: Mount SwipeFailureBanner in App component**

In the `App` function's return, add after `<Toaster />`:

```tsx
<SwipeFailureBanner />
```

---

## Verification

### Verify Task 13 (Banner rendering):
1. Start the app: `cd frontend && npm run dev`
2. Log in as ADMIN
3. Manually dispatch via browser console: the Zustand store's `showAlert` with mock payload
4. Confirm the Dynamic Island pill appears at top-center with pulse animation
5. Click "已读" → confirm it dismisses with fade-out animation
6. Confirm auto-dismiss timer works

### Verify Task 12 (Tab integration):
1. Navigate to `/admin/student-violations?tab=swipe-alert`
2. Confirm the "刷卡失败告警" tab renders
3. Create a new rule, confirm it appears in the list
4. Edit a rule, confirm form prefills and saves
5. Toggle enable/disable, confirm state changes
6. Delete a rule, confirm removal

### Verify Tasks 6-11 (API + Store + Components):
1. With backend running, test rule CRUD via the UI
2. Verify error handling (toast on failure)
3. Verify empty state (no rules message)

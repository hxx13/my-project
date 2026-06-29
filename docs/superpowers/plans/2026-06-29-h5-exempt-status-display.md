# H5 首页豁免状态实时展示 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 H5 学生端首页 `MobilePresenceStatusBar` 内实时展示豁免/延迟授权状态

**Architecture:** 后端新建 `ExemptStatusDTO`，在 `TwinScanAppService.analyzeScan()` 中填充（Token 路径内嵌，JWT 路径通过新独立接口 `/student/mobile/exempt-status` 补充）。前端扩展 `MobilePresenceSnapshot` 加 `exemptStatus` 字段，`MobilePresenceStatusBar` 渲染豁免行。

**Tech Stack:** Java Spring Boot + MyBatis (后端), React TypeScript + Tailwind (前端)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/.../scan/dto/ExemptStatusDTO.java` | Create | 豁免状态 DTO，前后端数据契约 |
| `src/.../scan/dto/ScanAnalyzeResponseDTO.java` | Modify | 加 `exemptStatus` 字段 |
| `src/.../scan/service/TwinScanAppService.java` | Modify | 填充 exemptStatus |
| `src/.../student/controller/StudentMobileController.java` | Modify | 新增 `GET /exempt-status` |
| `frontend/src/api/domains/mobileStudent.api.ts` | Modify | 类型定义加 `ExemptStatus` |
| `frontend/src/api/domains/studentMobile.api.ts` | Modify | 新增 `fetchStudentMobileExemptStatus` |
| `frontend/src/pages/mobile/useMobilePresenceStatus.ts` | Modify | Snapshot 加 exemptStatus，JWT 补充调用 |
| `frontend/src/pages/mobile/mobilePresenceTheme.ts` | Modify | 新增 `EXEMPT_DISPLAY` 主题 |
| `frontend/src/pages/mobile/MobilePresenceStatusBar.tsx` | Modify | 渲染豁免行 |

---

### Task 1: 后端 — 新建 ExemptStatusDTO

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/scan/dto/ExemptStatusDTO.java`

- [ ] **Step 1: 创建 DTO 类**

```java
package com.example.demo.modules.twin.scan.dto;

import lombok.Data;
import java.util.List;

@Data
public class ExemptStatusDTO {
    /** none / pending_review / approved_active / approved_expired / rejected */
    private String phase;

    /** TIME / COUNT / BOTH / null */
    private String mode;

    /** yyyy-MM-dd HH:mm:ss，到期时间 */
    private String expireAt;

    /** 前端实时计算的剩余时长文本，后端给空字符串 */
    private String remainingText;

    /** 授权房间名称列表 */
    private List<String> roomNames;

    /** 总次数（COUNT/BOTH 模式） */
    private Integer maxCount;

    /** 已用次数 */
    private int usedCount;

    /** 申请单号（pending/rejected 时填充） */
    private Long requestId;

    /** 延长至 HH:mm（pending_review 时展示用） */
    private String extendUntilTime;
}
```

- [ ] **Step 2: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q
```

Expected: BUILD SUCCESS

- [ ] **Step 3: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/scan/dto/ExemptStatusDTO.java
git commit -m "feat: add ExemptStatusDTO for H5 exempt status display"
```

---

### Task 2: 后端 — ScanAnalyzeResponseDTO 加字段

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/scan/dto/ScanAnalyzeResponseDTO.java`

- [ ] **Step 1: 添加 exemptStatus 字段**

在 `ScanAnalyzeResponseDTO.java` 的 `scanDelayOptionsByRoom` 字段之后（第48行后），`}` 之前添加：

```java
    /** H5 首页豁免状态（综合 twin_card_mapping + 延迟申请推导） */
    private ExemptStatusDTO exemptStatus;
```

同时添加 import：
```java
// 无需额外 import，同包类自动可见
```

- [ ] **Step 2: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q
```

Expected: BUILD SUCCESS

- [ ] **Step 3: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/scan/dto/ScanAnalyzeResponseDTO.java
git commit -m "feat: add exemptStatus field to ScanAnalyzeResponseDTO"
```

---

### Task 3: 后端 — TwinScanAppService 填充 exemptStatus

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/scan/service/TwinScanAppService.java`

- [ ] **Step 1: 添加依赖注入**

在 `TwinScanAppService.java` 类顶部，现有的 `@Autowired` 区域末尾，添加 scan delay request mapper 注入（如果尚未注入）：

```java
    @Autowired
    private com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRequestMapper scanDelayRequestMapper;

    @Autowired
    private com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayOptionMapper scanDelayOptionMapper;
```

检查 `TwinScanDelayOptionMapper` 是否存在。如果不存在，检查 `ScanDelayConfigService` 中如何根据 optionId 查询 delay option。

- [ ] **Step 2: 添加 buildExemptStatus 方法**

在 `TwinScanAppService.java` 末尾（类结束 `}` 之前）添加私有方法：

```java
    /**
     * 构建 H5 首页豁免状态。综合 twin_card_mapping + 当日延迟申请记录推导 phase。
     */
    private ExemptStatusDTO buildExemptStatus(String userId) {
        if (userId == null || userId.isBlank()) return null;

        ExemptStatusDTO dto = new ExemptStatusDTO();
        dto.setPhase("none");
        dto.setUsedCount(0);

        try {
            // 1. 查询用户卡片映射（含豁免字段）
            TwinCardMapping mapping = twinCardMappingService.getByAroUserId(userId);
            boolean hasActiveExempt = mapping != null
                    && mapping.getFreezeExemptFlag() != null
                    && mapping.getFreezeExemptFlag() == 1;

            // 2. 查询当日延迟申请记录（取最新一条）
            java.util.List<com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest> recentRequests =
                    scanDelayRequestMapper.listRecentBySubjectUserId(userId, 5);
            com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest latestRequest = null;
            if (recentRequests != null && !recentRequests.isEmpty()) {
                // 筛选今天的记录
                java.time.LocalDate today = java.time.LocalDate.now();
                for (com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest req : recentRequests) {
                    if (req.getCreatedAt() != null && req.getCreatedAt().toLocalDate().equals(today)) {
                        latestRequest = req;
                        break; // 按时间倒序，第一条即最新
                    }
                }
            }

            // 3. 推导 phase
            if (latestRequest != null) {
                String status = latestRequest.getStatus();
                if ("PENDING".equalsIgnoreCase(status)) {
                    dto.setPhase("pending_review");
                    dto.setRequestId(latestRequest.getId());
                    // 查询 delay option 获取 extendUntilTime 和 roomIds
                    if (latestRequest.getOptionId() != null) {
                        com.example.demo.modules.twin.scan.delay.dto.ScanDelayOptionDTO option =
                                scanDelayConfigService.getOptionById(latestRequest.getOptionId());
                        if (option != null) {
                            dto.setExtendUntilTime(option.getExtendUntilTime());
                            dto.setRoomNames(parseExemptRoomNames(option.getExemptRoomIds()));
                        }
                    }
                    if (dto.getRoomNames() == null) dto.setRoomNames(java.util.List.of());
                    dto.setRemainingText("");
                    return dto;
                } else if ("REJECTED".equalsIgnoreCase(status)) {
                    dto.setPhase("rejected");
                    dto.setRequestId(latestRequest.getId());
                    if (latestRequest.getOptionId() != null) {
                        com.example.demo.modules.twin.scan.delay.dto.ScanDelayOptionDTO option =
                                scanDelayConfigService.getOptionById(latestRequest.getOptionId());
                        if (option != null) {
                            dto.setRoomNames(parseExemptRoomNames(option.getExemptRoomIds()));
                        }
                    }
                    if (dto.getRoomNames() == null) dto.setRoomNames(java.util.List.of());
                    dto.setRemainingText("");
                    return dto;
                }
            }

            if (hasActiveExempt && mapping != null) {
                // 判断是否已过期
                String expireAt = mapping.getFreezeExemptExpireAt();
                if (expireAt != null && !expireAt.isBlank()) {
                    try {
                        java.time.LocalDateTime expireTime = java.time.LocalDateTime.parse(
                                expireAt.replace(" ", "T"),
                                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd['T']HH:mm:ss"));
                        if (expireTime.isAfter(java.time.LocalDateTime.now())) {
                            dto.setPhase("approved_active");
                        } else {
                            dto.setPhase("approved_expired");
                        }
                    } catch (Exception e) {
                        // 解析失败，视为已过期
                        dto.setPhase("approved_expired");
                    }
                } else {
                    dto.setPhase("approved_active");
                }
                dto.setExpireAt(expireAt);
                dto.setMode(mapping.getFreezeExemptMode());
                dto.setMaxCount(mapping.getFreezeExemptMaxCount());
                dto.setUsedCount(mapping.getFreezeExemptUsedCount() != null ? mapping.getFreezeExemptUsedCount() : 0);
                dto.setRoomNames(parseExemptRoomNames(mapping.getFreezeExemptRoomIds()));
                dto.setRemainingText("");
            }

            return dto;
        } catch (Exception e) {
            log.warn("[analyzeScan] buildExemptStatus failed for userId={}: {}", userId, e.getMessage());
            dto.setPhase("none");
            return dto;
        }
    }

    /** 解析 freezeExemptRoomIds JSON → 房间名列表 */
    private java.util.List<String> parseExemptRoomNames(String roomIdsJson) {
        if (roomIdsJson == null || roomIdsJson.isBlank()) return java.util.List.of();
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            java.util.List<?> arr = mapper.readValue(roomIdsJson, java.util.List.class);
            if (arr == null || arr.isEmpty()) return java.util.List.of();
            java.util.List<String> names = new java.util.ArrayList<>();
            for (Object item : arr) {
                if (item instanceof java.util.Map) {
                    @SuppressWarnings("unchecked")
                    java.util.Map<String, Object> map = (java.util.Map<String, Object>) item;
                    Object name = map.get("roomName");
                    if (name != null && !String.valueOf(name).isBlank()) {
                        names.add(String.valueOf(name).trim());
                    } else {
                        Object id = map.get("roomId");
                        if (id != null) names.add(String.valueOf(id));
                    }
                } else if (item instanceof String) {
                    names.add((String) item);
                }
            }
            return names;
        } catch (Exception e) {
            return java.util.List.of();
        }
    }
```

- [ ] **Step 2: 在 analyzeScan 方法中调用**

在 `analyzeScan()` 方法的 `result.setSuccess(true);`（当前第304行）之前添加：

```java
        // H5 首页豁免状态
        result.setExemptStatus(buildExemptStatus(realPhysicalId));
```

- [ ] **Step 3: 检查 TwinScanDelayOptionMapper 是否存在**

```bash
grep -rn "TwinScanDelayOptionMapper" src/main/java/
```

如果不存在，需要创建并注入。检查 `ScanDelayConfigService` 中 `getOptionById` 方法是否已存在：

```bash
grep -rn "getOptionById" src/main/java/com/example/demo/modules/twin/scan/delay/
```

如果 `ScanDelayConfigService.getOptionById()` 不存在，添加方法：

```java
// 在 ScanDelayConfigService.java 中添加
public ScanDelayOptionDTO getOptionById(Long id) {
    if (id == null) return null;
    TwinScanDelayOption entity = delayOptionMapper.findById(id);
    return entity != null ? toDTO(entity) : null;
}
```

- [ ] **Step 4: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q
```

Expected: BUILD SUCCESS

- [ ] **Step 5: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/scan/service/TwinScanAppService.java
git commit -m "feat: populate exemptStatus in analyzeScan for H5 display"
```

---

### Task 4: 后端 — StudentMobileController 新增 exempt-status 接口

**Files:**
- Modify: `src/main/java/com/example/demo/modules/student/controller/StudentMobileController.java`

- [ ] **Step 1: 添加 GET /exempt-status 端点**

在 `StudentMobileController.java` 的 `getRoomDashboard` 方法之后（约第151行后），`getRooms` 方法之前添加：

```java
    @GetMapping("/exempt-status")
    @Operation(summary = "获取当前学生豁免/延迟授权状态（轻量接口，JWT）")
    public Result<ExemptStatusDTO> getExemptStatus(HttpServletRequest request) {
        User user = requireCurrentUser(request);
        try {
            ExemptStatusDTO status = twinScanAppService.buildExemptStatusForUser(user.getId());
            return Result.success(status);
        } catch (Exception e) {
            log.warn("[StudentMobile] exempt-status failed for userId={}: {}", user.getId(), e.getMessage());
            return Result.success(null); // 静默失败，前端不显示
        }
    }
```

添加 import：
```java
import com.example.demo.modules.twin.scan.dto.ExemptStatusDTO;
```

- [ ] **Step 2: 在 TwinScanAppService 中暴露 public 方法**

把 `buildExemptStatus` 改为 public，或新增一个 public 包装方法：

```java
    // 在 TwinScanAppService.java 中，将 buildExemptStatus 改为 public
    public ExemptStatusDTO buildExemptStatusForUser(String userId) {
        return buildExemptStatus(userId);
    }
```

- [ ] **Step 3: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -pl . -q
```

Expected: BUILD SUCCESS

- [ ] **Step 4: 提交**

```bash
git add src/main/java/com/example/demo/modules/student/controller/StudentMobileController.java
git add src/main/java/com/example/demo/modules/twin/scan/service/TwinScanAppService.java
git commit -m "feat: add GET /student/mobile/exempt-status endpoint"
```

---

### Task 5: 前端 — 类型定义加 ExemptStatus

**Files:**
- Modify: `frontend/src/api/domains/mobileStudent.api.ts`

- [ ] **Step 1: 添加 ExemptStatus 类型**

在 `mobileStudent.api.ts` 的类型定义区域（`MobileRoomAnalyzeDto` 接口附近）添加：

```typescript
// ======================== 豁免状态 ========================

export type ExemptDisplayPhase =
  | "none"
  | "pending_review"
  | "approved_active"
  | "approved_expired"
  | "rejected";

export interface ExemptStatus {
  phase: ExemptDisplayPhase;
  mode: "TIME" | "COUNT" | "BOTH" | null;
  expireAt: string | null;
  remainingText: string;
  roomNames: string[];
  maxCount: number | null;
  usedCount: number;
  requestId?: number;
  extendUntilTime?: string | null;
}
```

- [ ] **Step 2: 在 MobileRoomAnalyzeDto 中添加字段**

在 `MobileRoomAnalyzeDto` 接口末尾（`scanDelayEnabled` 之后，`}` 之前）添加：

```typescript
  exemptStatus?: ExemptStatus | null;
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/api/domains/mobileStudent.api.ts
git commit -m "feat: add ExemptStatus types to mobileStudent.api"
```

---

### Task 6: 前端 — studentMobile.api.ts 新增获取接口

**Files:**
- Modify: `frontend/src/api/domains/studentMobile.api.ts`

- [ ] **Step 1: 添加 fetchStudentMobileExemptStatus 函数**

在 `studentMobile.api.ts` 的 room-dashboard 相关函数之后（`fetchStudentMobileRoomDashboard` 之后），添加：

```typescript
import type { ExemptStatus } from "./mobileStudent.api";

// ======================== Exempt Status ========================

export async function fetchStudentMobileExemptStatus(): Promise<ExemptStatus | null> {
  const resp = await authHttp.get<{
    code: number;
    success: boolean;
    message: string;
    data: ExemptStatus | null;
  }>(`/student/mobile/exempt-status`);
  if (!resp.data.success) return null;
  return resp.data.data ?? null;
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/api/domains/studentMobile.api.ts
git commit -m "feat: add fetchStudentMobileExemptStatus for JWT mode"
```

---

### Task 7: 前端 — mobilePresenceTheme.ts 新增 EXEMPT_DISPLAY

**Files:**
- Modify: `frontend/src/pages/mobile/mobilePresenceTheme.ts`

- [ ] **Step 1: 添加豁免主题映射**

在 `mobilePresenceTheme.ts` 末尾添加：

```typescript
import { Sparkles, Clock, AlarmClock, XCircle } from "lucide-react";
import type { ExemptDisplayPhase } from "@/api/domains/mobileStudent.api";

export type ExemptTheme = {
  icon: typeof Sparkles;
  badge: string;
  accent: string;
  soft: string;
  border: string;
  text: string;
};

export const EXEMPT_THEME: Record<ExemptDisplayPhase, ExemptTheme> = {
  none: {
    icon: Sparkles,
    badge: "",
    accent: "transparent",
    soft: "transparent",
    border: "transparent",
    text: "transparent",
  },
  pending_review: {
    icon: Clock,
    badge: "待审核",
    accent: "#d97706",
    soft: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.28)",
    text: "#b45309",
  },
  approved_active: {
    icon: Sparkles,
    badge: "已授权",
    accent: "#16a34a",
    soft: "rgba(22,163,74,0.1)",
    border: "rgba(22,163,74,0.28)",
    text: "#15803d",
  },
  approved_expired: {
    icon: AlarmClock,
    badge: "已过期",
    accent: "#dc2626",
    soft: "rgba(220,38,38,0.1)",
    border: "rgba(220,38,38,0.28)",
    text: "#b91c1c",
  },
  rejected: {
    icon: XCircle,
    badge: "已拒绝",
    accent: "#6b7280",
    soft: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.28)",
    text: "#4b5563",
  },
};
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/pages/mobile/mobilePresenceTheme.ts
git commit -m "feat: add EXEMPT_THEME for exempt status display"
```

---

### Task 8: 前端 — useMobilePresenceStatus 扩展

**Files:**
- Modify: `frontend/src/pages/mobile/useMobilePresenceStatus.ts`

- [ ] **Step 1: 导入类型和 API**

在 `useMobilePresenceStatus.ts` 顶部添加导入：

```typescript
import type { ExemptStatus } from "@/api/domains/mobileStudent.api";
import { fetchStudentMobileExemptStatus } from "@/api/domains/studentMobile.api";
import { formatExemptRemaining } from "@/constants/exemptDurationPresets";
```

- [ ] **Step 2: 在 MobilePresenceSnapshot 中加字段**

在 `MobilePresenceSnapshot` 类型末尾添加：

```typescript
  exemptStatus: ExemptStatus | null;
```

同时在初始化/默认值位置添加。找到 `return` 语句中的对象（约第194行），在 `lastSyncedAt` 之后添加：

```typescript
      exemptStatus: null,
```

- [ ] **Step 3: 添加 JWT 模式的豁免状态获取**

在 hook 函数体内，添加一个新的 `useEffect` 用于 JWT 模式。在现有的 `useEffect(() => { void load(); }, [load, refreshNonce]);` 之后添加：

```typescript
  /** JWT 模式：独立拉取豁免状态 */
  const [exemptStatus, setExemptStatus] = useState<ExemptStatus | null>(null);

  useEffect(() => {
    if (!jwtMode || !token) return;
    let cancelled = false;
    fetchStudentMobileExemptStatus()
      .then((data) => {
        if (!cancelled) setExemptStatus(data);
      })
      .catch(() => {
        // 静默
      });
    return () => { cancelled = true; };
  }, [jwtMode, token, refreshNonce]);
```

- [ ] **Step 4: 在 useMemo 中合并豁免状态并计算计时**

在 `useMemo` 的回调函数中（`return` 语句之前），添加豁免状态合并逻辑：

```typescript
    // 豁免状态：Token 模式从 analyze 取，JWT 模式从独立接口取
    let exempt: ExemptStatus | null = null;
    if (jwtMode) {
      exempt = exemptStatus;
    } else {
      const raw = (analyze as any).exemptStatus;
      exempt = (raw && raw.phase && raw.phase !== "none") ? (raw as ExemptStatus) : null;
    }

    // 实时计算倒计时
    if (exempt && exempt.phase === "approved_active" && exempt.expireAt) {
      const remaining = formatExemptRemaining(exempt.expireAt);
      if (remaining === "已到期") {
        exempt = { ...exempt, phase: "approved_expired", remainingText: "已到期" };
      } else {
        exempt = { ...exempt, remainingText: remaining };
      }
    }
```

然后在 return 对象中，把 `exemptStatus: null,` 替换为：

```typescript
      exemptStatus: exempt,
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/mobile/useMobilePresenceStatus.ts
git commit -m "feat: extend useMobilePresenceStatus with exemptStatus"
```

---

### Task 9: 前端 — MobilePresenceStatusBar 渲染豁免行

**Files:**
- Modify: `frontend/src/pages/mobile/MobilePresenceStatusBar.tsx`

- [ ] **Step 1: 导入豁免主题**

在 `MobilePresenceStatusBar.tsx` 顶部添加导入：

```typescript
import { EXEMPT_THEME } from "./mobilePresenceTheme";
import type { ExemptStatus } from "@/api/domains/mobileStudent.api";
```

- [ ] **Step 2: 在组件中添加豁免行渲染**

在 `MobilePresenceStatusBar` 组件中，现有 PresenceBar 卡片的最外层 `</div>` 闭合标签之前（即 `PresencePill` 区域之后、最外层 `</div>` 之前），添加豁免行渲染：

```typescript
          {/* 豁免状态行 */}
          {snapshot.exemptStatus && snapshot.exemptStatus.phase !== "none" && (() => {
            const exempt = snapshot.exemptStatus;
            const theme = EXEMPT_THEME[exempt.phase];
            const ExemptIcon = theme.icon;

            const roomText = exempt.roomNames.length > 0
              ? exempt.roomNames.join(" · ")
              : "—";

            let rightPill: string | null = null;
            if (exempt.phase === "pending_review") {
              rightPill = exempt.extendUntilTime
                ? `延长至 ${exempt.extendUntilTime}`
                : "待审核";
            } else if (exempt.phase === "approved_active") {
              if (exempt.mode === "COUNT") {
                const count = exempt.maxCount != null
                  ? `剩余 ${Math.max(0, exempt.maxCount - exempt.usedCount)}/${exempt.maxCount} 次`
                  : null;
                rightPill = count;
              } else if (exempt.mode === "BOTH") {
                const time = exempt.remainingText || "";
                const count = exempt.maxCount != null
                  ? `剩余 ${Math.max(0, exempt.maxCount - exempt.usedCount)}/${exempt.maxCount} 次`
                  : "";
                rightPill = [time, count].filter(Boolean).join(" · ");
              } else {
                rightPill = exempt.remainingText && exempt.expireAt
                  ? `${exempt.remainingText} · 至 ${exempt.expireAt.slice(11, 16)}`
                  : exempt.remainingText || null;
              }
            } else if (exempt.phase === "approved_expired") {
              rightPill = exempt.expireAt
                ? `已到期（至 ${exempt.expireAt.slice(11, 16)}）`
                : "已到期";
            } else if (exempt.phase === "rejected") {
              rightPill = null; // 仅显示"已拒绝"
            }

            return (
              <>
                <div
                  className="mt-2 pt-2 flex items-center gap-1.5 flex-wrap"
                  style={{ borderTop: `1px dashed ${theme.border}` }}
                >
                  <ExemptIcon className="size-[15px] shrink-0" style={{ color: theme.accent }} strokeWidth={2.2} />
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0"
                    style={{ background: theme.soft, color: theme.text }}
                  >
                    {theme.badge}
                  </span>
                  <span className="text-[11px] truncate min-w-0" style={{ color: "#64748b" }}>
                    {exempt.phase === "rejected" ? `${roomText} · 已拒绝` : roomText}
                  </span>
                  {rightPill && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums whitespace-nowrap shrink-0 ml-auto"
                      style={{
                        background: theme.soft,
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                      }}
                    >
                      {rightPill}
                    </span>
                  )}
                </div>
              </>
            );
          })()}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/pages/mobile/MobilePresenceStatusBar.tsx
git commit -m "feat: render exempt status row in MobilePresenceStatusBar"
```

---

### Task 10: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd d:/codex/verson.1.2/20260416 && mvn spring-boot:run
```

- [ ] **Step 2: 启动前端**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npm run dev
```

- [ ] **Step 3: 验证 Token 模式（直链）**

1. 用 token 访问 `/m/sc/{token}` 
2. 确认无豁免用户 → PresenceBar 无豁免行
3. 在后台给用户设置豁免 (`POST /api/v1/twin/mappings/exempt`)
4. 刷新页面 → PresenceBar 显示 `✨ 已授权 · {房间} · 剩余 XhXm · 至 HH:mm`
5. 设置过期豁免 → 显示 `⏰ 已过期`

- [ ] **Step 4: 验证 JWT 模式（登录）**

1. 登录后访问 `/m/home`
2. 打开 Network 面板确认 `GET /student/mobile/exempt-status` 被调用
3. 确认豁免状态正确显示

- [ ] **Step 5: 验证状态流转**

1. 提交延迟申请 → 显示 `⏳ 已申请 · 待审核`
2. 管理员拒绝 → 显示 `❌ 已拒绝`
3. 管理员通过 → 显示 `✨ 已授权`
4. 倒计时归零 → 自动切换 `⏰ 已过期`

- [ ] **Step 6: 验证边界情况**

1. 断网 → 豁免行不显示，页面不阻塞
2. `freezeExemptRoomIds` 为 null → 显示 "—"
3. OUTSIDE/UNKNOWN 状态 → 豁免行照样显示

---

## Self-Review Checklist

- [x] Spec coverage: 所有 spec 章节都有对应 task
- [x] Placeholder scan: 无 TBD/TODO，所有代码完整
- [x] Type consistency: 前后端类型字段一致（phase/mode/expireAt/roomNames/maxCount/usedCount/requestId/extendUntilTime）

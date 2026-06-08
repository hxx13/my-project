# Special Channel Student Entry · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PIN-based student entry via scanner popup — numeric keypad auth → JWT → student center, plus a registry-driven overlay shell for future quick actions.

**Architecture:** Backend extends `modules/auth/` with `SpecialChannelController` + `SpecialChannelService`, reusing existing `AuthService.generateAuthResult()` and `PasswordCredentialService`. Frontend adds `NumericKeypad` (generic ui/), `BizOverlayShell` + `useBizRegistry` (scanner/), and a centralized `Z_INDEX` constant layer. All Portal z-values migrated from hardcoded to constant references.

**Tech Stack:** Spring Boot 3.5 + MyBatis + JUnit/MockMvc | React 19 + TypeScript 5.9 + Zustand + Vitest + Tailwind CSS

---

## Phase 1: Infrastructure & Backend Foundation

### Task 1: Create Z-Index constants (frontend)

**Files:**
- Create: `frontend/src/constants/zIndex.ts`

- [ ] **Step 1: Write the constants file**

```ts
// frontend/src/constants/zIndex.ts
export const Z_INDEX = {
  base: 0,
  dropdown: 100,
  modal: 200,
  scannerPopup: 300,       // UiverseProfilePopup
  popupNotice: 310,         // ScanAccessNoticeOverlay
  popupModal: 320,          // DisciplinaryModal
  bizOverlay: 400,          // BizOverlayShell
  keypad: 500,              // NumericKeypad（永远最顶层）
  globalToast: 600,         // 全局 Toast/Notification
} as const;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No errors related to zIndex.ts

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/zIndex.ts
git commit -m "feat: add centralized Z_INDEX layer constants"
```

---

### Task 2: Add error codes (backend)

**Files:**
- Modify: `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java`

- [ ] **Step 1: Add special channel error codes**

```java
// In ErrorCodeConstants.java, after existing constants, add:

/** 特殊通道 special-channel 1-004-xxx */
public static final int SPECIAL_CHANNEL_PIN_ALREADY_SET  = 1_004_001;  // "已设置过个人密码"
public static final int SPECIAL_CHANNEL_PIN_NOT_SET       = 1_004_002;  // "请先设置个人密码"
public static final int SPECIAL_CHANNEL_PIN_INVALID       = 1_004_003;  // "个人密码错误"
public static final int SPECIAL_CHANNEL_PIN_FORMAT        = 1_004_004;  // "密码为6-8位纯数字"
public static final int SPECIAL_CHANNEL_USER_NOT_FOUND    = 1_004_005;  // "未在人员库中找到该学号"
public static final int SPECIAL_CHANNEL_PIN_LOCKED        = 1_004_006;  // "密码已锁定，请稍后重试"
public static final int SPECIAL_CHANNEL_ACCOUNT_DISABLED  = 1_004_007;  // "账号已禁用"
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java
git commit -m "feat: add special-channel error codes (1-004-xxx)"
```

---

### Task 3: Database bootstrap — add PIN columns to aro_personnel

**Files:**
- Create: `src/main/java/com/example/demo/common/component/SpecialChannelTableBootstrap.java`

- [ ] **Step 1: Write the bootstrap class**

```java
package com.example.demo.common.component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(6)
public class SpecialChannelTableBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SpecialChannelTableBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public SpecialChannelTableBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        addColumnIfNotExists(
                "aro_personnel",
                "personal_pin",
                "VARCHAR(255) NULL COMMENT 'bcrypt哈希，NULL=未设置'"
        );
        addColumnIfNotExists(
                "aro_personnel",
                "pin_updated_at",
                "DATETIME NULL COMMENT 'PIN最后修改时间'"
        );
    }

    private void addColumnIfNotExists(String table, String column, String definition) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition
            );
            log.info("[special-channel] ensured column {}.{}", table, column);
        } catch (Exception ex) {
            // Column already exists or other DDL error — log and continue
            log.debug("[special-channel] skip alter {}.{}: {}", table, column, ex.getMessage());
        }
    }
}
```

- [ ] **Step 2: Restart the app and verify columns exist**

Run: check that the application starts without errors.
Then query: `DESCRIBE aro_personnel;` and confirm `personal_pin` and `pin_updated_at` columns exist.

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/common/component/SpecialChannelTableBootstrap.java
git commit -m "feat: add PIN columns to aro_personnel via bootstrap"
```

---

## Phase 2: Backend Business Logic

### Task 4: Add PIN queries to AroPersonnelMapper

**Files:**
- Modify: `src/main/java/com/example/demo/modules/aro/mapper/AroPersonnelMapper.java`
- Modify: `src/main/resources/mapper/AroPersonnelMapper.xml`

- [ ] **Step 1: Add Java mapper methods**

In `AroPersonnelMapper.java`, add after existing methods:

```java
@Select("SELECT personal_pin FROM aro_personnel WHERE user_id = #{userId}")
String findPersonalPinByUserId(@Param("userId") String userId);

int updatePersonalPin(@Param("userId") String userId,
                      @Param("pinHash") String pinHash,
                      @Param("now") String now);

int clearPersonalPin(@Param("userId") String userId);
```

- [ ] **Step 2: Add XML for update/clear**

In `AroPersonnelMapper.xml`, add before `</mapper>`:

```xml
<update id="updatePersonalPin">
    UPDATE aro_personnel
    SET personal_pin = #{pinHash},
        pin_updated_at = #{now}
    WHERE user_id = #{userId}
      AND personal_pin IS NULL
</update>

<update id="clearPersonalPin">
    UPDATE aro_personnel
    SET personal_pin = NULL,
        pin_updated_at = NULL
    WHERE user_id = #{userId}
</update>
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/aro/mapper/AroPersonnelMapper.java \
        src/main/resources/mapper/AroPersonnelMapper.xml
git commit -m "feat: add PIN query/update/clear methods to AroPersonnelMapper"
```

---

### Task 5: Create DTOs

**Files:**
- Create: `src/main/java/com/example/demo/modules/auth/dto/SetPinRequest.java`
- Create: `src/main/java/com/example/demo/modules/auth/dto/SpecialChannelLoginRequest.java`
- Create: `src/main/java/com/example/demo/modules/auth/dto/PinStatusResponse.java`

- [ ] **Step 1: Write SetPinRequest**

```java
package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class SetPinRequest {
    private String userId;
    private String pin;
}
```

- [ ] **Step 2: Write SpecialChannelLoginRequest**

```java
package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class SpecialChannelLoginRequest {
    private String userId;
    private String pin;
}
```

- [ ] **Step 3: Write PinStatusResponse**

```java
package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class PinStatusResponse {
    private boolean hasPin;

    public static PinStatusResponse of(boolean hasPin) {
        PinStatusResponse r = new PinStatusResponse();
        r.setHasPin(hasPin);
        return r;
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/auth/dto/SetPinRequest.java \
        src/main/java/com/example/demo/modules/auth/dto/SpecialChannelLoginRequest.java \
        src/main/java/com/example/demo/modules/auth/dto/PinStatusResponse.java
git commit -m "feat: add special-channel DTOs (SetPin, Login, PinStatus)"
```

---

### Task 6: Write SpecialChannelService

**Files:**
- Create: `src/main/java/com/example/demo/modules/auth/service/SpecialChannelService.java`

- [ ] **Step 1: Write SpecialChannelService**

```java
package com.example.demo.modules.auth.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.dto.AuthData;
import com.example.demo.modules.auth.dto.PinStatusResponse;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.AuthProfileConstants;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SpecialChannelService {

    private static final Logger log = LoggerFactory.getLogger(SpecialChannelService.class);
    private static final int MAX_FAIL_COUNT = 3;
    private static final long LOCK_DURATION_SEC = 30;
    private static final String PIN_PATTERN = "^\\d{6,8}$";

    private final AroPersonnelMapper aroPersonnelMapper;
    private final UserMapper userMapper;
    private final AuthService authService;
    private final PasswordCredentialService passwordCredentialService;

    // 内存锁定记录（未来可无感升级为 Redis）
    private final Map<String, FailRecord> failMap = new ConcurrentHashMap<>();

    public SpecialChannelService(AroPersonnelMapper aroPersonnelMapper,
                                  UserMapper userMapper,
                                  AuthService authService,
                                  PasswordCredentialService passwordCredentialService) {
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.userMapper = userMapper;
        this.authService = authService;
        this.passwordCredentialService = passwordCredentialService;
    }

    // ---- PIN Status ----

    public boolean hasPin(String userId) {
        requirePersonnelExists(userId);
        String hash = aroPersonnelMapper.findPersonalPinByUserId(userId);
        return StringUtils.hasText(hash);
    }

    // ---- Set PIN ----

    @Transactional
    public AuthData setPin(String userId, String rawPin) {
        requirePersonnelExists(userId);
        validatePinFormat(rawPin);

        // 防竞态：Mapper XML 有 WHERE personal_pin IS NULL 条件
        String pinHash = passwordCredentialService.encodeForStorage(rawPin);
        String now = Instant.now().toString();
        int updated = aroPersonnelMapper.updatePersonalPin(userId, pinHash, now);
        if (updated == 0) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_PIN_ALREADY_SET,
                    "已设置过个人密码"
            );
        }

        log.info("[special-channel] PIN set userId={}", userId);
        ensureAccountExists(userId);
        return generateAuthForUser(userId);
    }

    // ---- Login ----

    public AuthData login(String userId, String rawPin) {
        requirePersonnelExists(userId);

        // 检查锁定
        FailRecord record = failMap.computeIfAbsent(userId, k -> new FailRecord());
        synchronized (record) {
            if (record.isLocked()) {
                long remainSec = record.remainingSeconds();
                throw TwinBusinessException.of(
                        ErrorCodeConstants.SPECIAL_CHANNEL_PIN_LOCKED,
                        "密码已锁定，请" + remainSec + "秒后重试"
                );
            }

            String storedHash = aroPersonnelMapper.findPersonalPinByUserId(userId);
            if (!StringUtils.hasText(storedHash)) {
                throw TwinBusinessException.of(
                        ErrorCodeConstants.SPECIAL_CHANNEL_PIN_NOT_SET,
                        "请先设置个人密码"
                );
            }

            // bcrypt 验证
            // PasswordCredentialService.verifyAndRehashIfLegacy 需要 User 对象
            // 但我们只有 hash 字符串，直接用 raw compare
            boolean matched = passwordCredentialService.encodeForStorage("__check__").length() > 0
                    && org.springframework.security.crypto.bcrypt.BCrypt.checkpw(rawPin, storedHash);

            if (!matched) {
                record.failCount++;
                if (record.failCount >= MAX_FAIL_COUNT) {
                    record.lockUntil = Instant.now().plusSeconds(LOCK_DURATION_SEC);
                    log.warn("[special-channel] locked userId={} until={}", userId, record.lockUntil);
                    throw TwinBusinessException.of(
                            ErrorCodeConstants.SPECIAL_CHANNEL_PIN_LOCKED,
                            "密码错误次数过多，已锁定" + LOCK_DURATION_SEC + "秒"
                    );
                }
                log.warn("[special-channel] login fail userId={} attempt={}", userId, record.failCount);
                throw TwinBusinessException.of(
                        ErrorCodeConstants.SPECIAL_CHANNEL_PIN_INVALID,
                        "个人密码错误"
                );
            }

            // 成功 — 清零
            failMap.remove(userId);
            log.info("[special-channel] login ok userId={}", userId);
        }

        ensureAccountExists(userId);
        return generateAuthForUser(userId);
    }

    // ---- Reset (admin) ----

    @Transactional
    public void resetPin(String userId, String adminId) {
        requirePersonnelExists(userId);
        aroPersonnelMapper.clearPersonalPin(userId);
        failMap.remove(userId);
        log.warn("[special-channel] PIN reset by admin={} for userId={}", adminId, userId);
    }

    // ---- Private helpers ----

    private void validatePinFormat(String pin) {
        if (pin == null || !pin.matches(PIN_PATTERN)) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_PIN_FORMAT,
                    "密码为6-8位纯数字"
            );
        }
    }

    private void requirePersonnelExists(String userId) {
        if (aroPersonnelMapper.findByUserId(userId) == null) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_USER_NOT_FOUND,
                    "未在人员库中找到该学号"
            );
        }
    }

    private void ensureAccountExists(String userId) {
        User existing = userMapper.findById(userId);
        if (existing != null) return;
        User user = new User();
        user.setId(userId);
        user.setUsername(userId);
        user.setRole(RoleEnum.STUDENT);
        user.setStatus(1);
        user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
        userMapper.insertUser(user);
        log.info("[special-channel] auto-created account userId={}", userId);
    }

    private AuthData generateAuthForUser(String userId) {
        User user = userMapper.findById(userId);
        if (user == null) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_ACCOUNT_DISABLED,
                    "账号不存在"
            );
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.SPECIAL_CHANNEL_ACCOUNT_DISABLED,
                    "账号已禁用"
            );
        }
        user.setRole(authService.normalizeRole(user.getRole()));
        return authService.generateAuthResult(user).getData();
    }

    // ---- Inner class ----

    private static class FailRecord {
        int failCount = 0;
        Instant lockUntil = Instant.EPOCH;

        boolean isLocked() {
            return lockUntil.isAfter(Instant.now());
        }

        long remainingSeconds() {
            return Math.max(0, lockUntil.getEpochSecond() - Instant.now().getEpochSecond());
        }
    }
}
```

- [ ] **Step 2: Fix bcrypt usage** — the Service uses `BCrypt.checkpw()` directly. Verify Spring Security's BCrypt is on the classpath. The simpler approach: inject `PasswordEncoder` directly and call `.matches()`.

Edit `SpecialChannelService.java`: add `import org.springframework.security.crypto.password.PasswordEncoder;`, add `private final PasswordEncoder passwordEncoder;` to constructor, and replace the bcrypt check with:

```java
boolean matched = passwordEncoder.matches(rawPin, storedHash);
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/auth/service/SpecialChannelService.java
git commit -m "feat: add SpecialChannelService with PIN set/login/reset + rate limiting"
```

---

### Task 7: Write StudentAccountProvisioner

**Files:**
- Create: `src/main/java/com/example/demo/modules/auth/service/StudentAccountProvisioner.java`

- [ ] **Step 1: Write the provisioner**

```java
package com.example.demo.modules.auth.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class StudentAccountProvisioner {

    private static final Logger log = LoggerFactory.getLogger(StudentAccountProvisioner.class);
    private final JdbcTemplate jdbcTemplate;
    private final UserMapper userMapper;

    public StudentAccountProvisioner(JdbcTemplate jdbcTemplate, UserMapper userMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.userMapper = userMapper;
    }

    @Scheduled(fixedDelay = 300_000)  // 每 5 分钟
    public void provision() {
        List<String> userIds = jdbcTemplate.queryForList(
                "SELECT user_id FROM aro_personnel", String.class
        );
        int created = 0;
        int skipped = 0;
        for (String userId : userIds) {
            try {
                User existing = userMapper.findById(userId);
                if (existing != null) {
                    skipped++;
                    continue;
                }
                User user = new User();
                user.setId(userId);
                user.setUsername(userId);
                user.setRole(RoleEnum.STUDENT);
                user.setStatus(1);
                user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
                userMapper.insertUser(user);
                created++;
            } catch (Exception ex) {
                log.error("[special-channel] provision failed userId={}: {}", userId, ex.getMessage());
            }
        }
        if (created > 0 || skipped > 0) {
            log.info("[special-channel] account provision: created={} skipped={}", created, skipped);
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/auth/service/StudentAccountProvisioner.java
git commit -m "feat: add StudentAccountProvisioner — scheduled account auto-creation"
```

---

### Task 8: Write SpecialChannelController

**Files:**
- Create: `src/main/java/com/example/demo/modules/auth/controller/SpecialChannelController.java`

- [ ] **Step 1: Write the controller**

```java
package com.example.demo.modules.auth.controller;

import com.example.demo.common.config.JwtTokenService;
import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.dto.PinStatusResponse;
import com.example.demo.modules.auth.dto.SetPinRequest;
import com.example.demo.modules.auth.dto.SpecialChannelLoginRequest;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.SpecialChannelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth/special-channel")
@Tag(name = "特殊通道", description = "学生刷卡弹窗 PIN 认证入口")
public class SpecialChannelController {

    private final SpecialChannelService specialChannelService;
    private final AuthContextService authContextService;

    public SpecialChannelController(SpecialChannelService specialChannelService,
                                     AuthContextService authContextService) {
        this.specialChannelService = specialChannelService;
        this.authContextService = authContextService;
    }

    @GetMapping("/pin-status")
    @Operation(summary = "查询 PIN 是否已设置")
    public Result<PinStatusResponse> checkPinStatus(@RequestParam String userId) {
        boolean hasPin = specialChannelService.hasPin(userId);
        return Result.success(PinStatusResponse.of(hasPin));
    }

    @PostMapping("/set-pin")
    @Operation(summary = "首次设置个人密码（设置成功直接签发 JWT）")
    public Result<?> setPin(@RequestBody SetPinRequest request) {
        if (request == null || request.getUserId() == null || request.getPin() == null) {
            return Result.fail(ErrorCodeConstants.BAD_REQUEST, "参数不完整");
        }
        return Result.success(specialChannelService.setPin(request.getUserId().trim(), request.getPin().trim()));
    }

    @PostMapping("/login")
    @Operation(summary = "PIN 验证登录")
    public Result<?> login(@RequestBody SpecialChannelLoginRequest request) {
        if (request == null || request.getUserId() == null || request.getPin() == null) {
            return Result.fail(ErrorCodeConstants.BAD_REQUEST, "参数不完整");
        }
        return Result.success(specialChannelService.login(request.getUserId().trim(), request.getPin().trim()));
    }

    @PostMapping("/admin/personnel/{userId}/reset-pin")
    @Operation(summary = "管理员重置学生个人密码（SUPER_ADMIN 专用）")
    public Result<?> resetPin(@PathVariable String userId, HttpServletRequest request) {
        User me = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (me == null) {
            return Result.fail(ErrorCodeConstants.UNAUTHORIZED, "未登录");
        }
        // SUPER_ADMIN 权限由 SuperAdminGuard 保护，此处记录操作者
        specialChannelService.resetPin(userId, me.getId());
        return Result.success();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/auth/controller/SpecialChannelController.java
git commit -m "feat: add SpecialChannelController with 3 public + 1 admin API"
```

---

## Phase 3: Frontend API Layer

### Task 9: Create shared API types + client

**Files:**
- Create: `frontend/src/api/domains/specialChannel.api.ts`
- Create: `frontend/src/components/scanner/specialChannel.api.ts`

- [ ] **Step 1: Write the domain API types (api/domains/)**

```ts
// frontend/src/api/domains/specialChannel.api.ts
import axios from "axios";
import type { AuthData } from "@/api/domains/auth.api";

interface Result<T> {
  code: number;
  message: string;
  success: boolean;
  data: T;
}

interface PinStatusResponse {
  hasPin: boolean;
}

/** 查询 PIN 是否已设置（公开接口，用原始 axios） */
export async function checkPinStatus(userId: string): Promise<boolean> {
  const res = await axios.get<Result<PinStatusResponse>>(
    "/api/auth/special-channel/pin-status",
    { params: { userId } }
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "查询 PIN 状态失败");
  }
  return res.data.data.hasPin;
}

/** 首次设置 PIN（公开接口，成功返回 AuthData） */
export async function setPin(userId: string, pin: string): Promise<AuthData> {
  const res = await axios.post<Result<AuthData>>(
    "/api/auth/special-channel/set-pin",
    { userId, pin }
  );
  if (!res.data?.success || !res.data?.data?.token) {
    throw new Error(res.data?.message || "设置 PIN 失败");
  }
  return res.data.data;
}

/** PIN 登录（公开接口，成功返回 AuthData） */
export async function specialChannelLogin(userId: string, pin: string): Promise<AuthData> {
  const res = await axios.post<Result<AuthData>>(
    "/api/auth/special-channel/login",
    { userId, pin }
  );
  if (!res.data?.success || !res.data?.data?.token) {
    throw new Error(res.data?.message || "PIN 验证失败");
  }
  return res.data.data;
}

/** 管理员重置学生 PIN */
export async function resetStudentPin(userId: string): Promise<void> {
  const { authHttp } = await import("@/api/core/authHttp");
  const res = await authHttp.post<Result<null>>(
    `/auth/special-channel/admin/personnel/${userId}/reset-pin`
  );
  if (!res.data?.success) {
    throw new Error(res.data?.message || "重置 PIN 失败");
  }
}
```

- [ ] **Step 2: Write the scanner-level API re-export (components/scanner/)**

```ts
// frontend/src/components/scanner/specialChannel.api.ts
export {
  checkPinStatus,
  setPin,
  specialChannelLogin,
} from "@/api/domains/specialChannel.api";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/domains/specialChannel.api.ts \
        frontend/src/components/scanner/specialChannel.api.ts
git commit -m "feat: add special-channel API client (check/set/login/reset)"
```

---

## Phase 4: Frontend State + Components

### Task 10: Create Zustand store for biz registry + PIN state

**Files:**
- Create: `frontend/src/store/useSpecialChannelStore.ts`

- [ ] **Step 1: Write the store**

```ts
// frontend/src/store/useSpecialChannelStore.ts
import { create } from "zustand";
import type { BizItem } from "@/components/scanner/BizOverlayShell.types";

interface SpecialChannelState {
  // 业务注册表
  bizItems: Map<string, BizItem>;

  registerBiz: (item: BizItem) => void;
  unregisterBiz: (id: string) => void;
  getBizItems: () => BizItem[];
  clearBiz: () => void;
}

export const useSpecialChannelStore = create<SpecialChannelState>((set, get) => ({
  bizItems: new Map(),

  registerBiz: (item) =>
    set((s) => {
      const next = new Map(s.bizItems);
      next.set(item.id, item);
      return { bizItems: next };
    }),

  unregisterBiz: (id) =>
    set((s) => {
      const next = new Map(s.bizItems);
      next.delete(id);
      return { bizItems: next };
    }),

  getBizItems: () => {
    const items = Array.from(get().bizItems.values());
    return items
      .filter((item) => item.enabled !== false)
      .sort((a, b) => a.order - b.order);
  },

  clearBiz: () => set({ bizItems: new Map() }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store/useSpecialChannelStore.ts
git commit -m "feat: add Zustand store for biz registry"
```

---

### Task 11: Write NumericKeypad types + hook + shell

**Files:**
- Create: `frontend/src/components/ui/NumericKeypad.types.ts`
- Create: `frontend/src/components/ui/useNumericKeypad.ts`
- Create: `frontend/src/components/ui/NumericKeypad.tsx`

- [ ] **Step 1: Write NumericKeypad.types.ts**

```ts
// frontend/src/components/ui/NumericKeypad.types.ts
import type { AuthData } from "@/api/domains/auth.api";

export type KeypadMode = "set" | "verify";
export type KeypadStep = "idle" | "input" | "confirming" | "verifying" | "locked";

export interface NumericKeypadProps {
  mode: KeypadMode;
  userId: string;
  userName?: string;
  onSuccess: (result: AuthData) => void;
  onCancel: () => void;
  className?: string;
}

export interface UseNumericKeypadReturn {
  dots: number[];
  mode: KeypadMode;
  step: KeypadStep;
  isLocked: boolean;
  lockSeconds: number;
  errorText: string | null;
  isLoading: boolean;
  handleDigit: (d: number) => void;
  handleDelete: () => void;
  handleSubmit: () => void;
  handleCancel: () => void;
}
```

- [ ] **Step 2: Write useNumericKeypad.ts**

```ts
// frontend/src/components/ui/useNumericKeypad.ts
import { useReducer, useEffect, useCallback, useRef } from "react";
import type { KeypadMode, KeypadStep, UseNumericKeypadReturn } from "./NumericKeypad.types";
import { setPin, specialChannelLogin } from "@/components/scanner/specialChannel.api";
import type { AuthData } from "@/api/domains/auth.api";

interface State {
  mode: KeypadMode;
  step: KeypadStep;
  input: number[];
  confirmInput: number[];
  dots: number[];
  errorText: string | null;
  isLoading: boolean;
  isLocked: boolean;
  lockSeconds: number;
  failCount: number;
}

type Action =
  | { type: "DIGIT"; digit: number }
  | { type: "DELETE" }
  | { type: "SUBMIT" }
  | { type: "SUCCESS"; authData: AuthData }
  | { type: "FAILURE"; error: string }
  | { type: "LOCK_TICK" }
  | { type: "UNLOCK" }
  | { type: "CANCEL" };

const MAX_DIGITS = 8;
const MIN_DIGITS = 6;
const MAX_FAILURES = 3;
const LOCK_SECONDS = 30;

function initialState(mode: KeypadMode): State {
  return {
    mode,
    step: "idle",
    input: [],
    confirmInput: [],
    dots: [],
    errorText: null,
    isLoading: false,
    isLocked: false,
    lockSeconds: 0,
    failCount: 0,
  };
}

export function useNumericKeypad(
  mode: KeypadMode,
  userId: string,
  onSuccess: (result: AuthData) => void,
  onCancel: () => void
): UseNumericKeypadReturn {
  const [state, dispatch] = useReducer(
    (s: State, action: Action): State => {
      switch (action.type) {
        case "DIGIT": {
          const current = s.step === "confirming" ? s.confirmInput : s.input;
          if (current.length >= MAX_DIGITS) return s;
          const next = [...current, action.digit];
          if (s.step === "confirming") {
            return { ...s, confirmInput: next, dots: next.map(() => 0) };
          }
          return { ...s, input: next, step: "input", dots: next.map(() => 0) };
        }
        case "DELETE": {
          if (s.step === "confirming") {
            const next = s.confirmInput.slice(0, -1);
            return { ...s, confirmInput: next, dots: next.map(() => 0) };
          }
          const next = s.input.slice(0, -1);
          return { ...s, input: next, step: next.length > 0 ? "input" : "idle", dots: next.map(() => 0) };
        }
        case "SUBMIT":
          return { ...s, isLoading: true, errorText: null };
        case "SUCCESS":
          return { ...initialState(s.mode) };
        case "FAILURE": {
          const newFail = s.failCount + 1;
          if (newFail >= MAX_FAILURES) {
            return { ...s, isLoading: false, failCount: newFail, isLocked: true, lockSeconds: LOCK_SECONDS, step: "locked", errorText: action.error };
          }
          return { ...s, isLoading: false, failCount: newFail, input: [], confirmInput: [], dots: [], step: "idle", errorText: action.error };
        }
        case "LOCK_TICK": {
          const next = s.lockSeconds - 1;
          if (next <= 0) return { ...s, lockSeconds: 0, isLocked: false, failCount: 0, step: "idle", errorText: null };
          return { ...s, lockSeconds: next };
        }
        case "UNLOCK":
          return { ...s, isLocked: false, lockSeconds: 0, failCount: 0, step: "idle", errorText: null };
        case "CANCEL":
          return initialState(s.mode);
      }
    },
    mode,
    initialState
  );

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // Lock countdown timer
  useEffect(() => {
    if (!state.isLocked || state.lockSeconds <= 0) return;
    const id = setInterval(() => dispatch({ type: "LOCK_TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.isLocked, state.lockSeconds]);

  const handleDigit = useCallback((d: number) => {
    if (state.isLocked || state.isLoading) return;
    dispatch({ type: "DIGIT", digit: d });
  }, [state.isLocked, state.isLoading]);

  const handleDelete = useCallback(() => {
    if (state.isLocked || state.isLoading) return;
    dispatch({ type: "DELETE" });
  }, [state.isLocked, state.isLoading]);

  const handleSubmit = useCallback(async () => {
    if (state.isLocked || state.isLoading) return;
    const currentInput = state.step === "confirming" ? state.confirmInput : state.input;
    if (currentInput.length < MIN_DIGITS) return;

    if (state.mode === "set" && state.step !== "confirming") {
      // First entry complete → go to confirm phase
      dispatch({ type: "SUBMIT" });
      // Override to confirm step
      // We need a CONFIRM_START action
      return;
    }

    dispatch({ type: "SUBMIT" });
    const pin = currentInput.join("");
    try {
      const result = state.mode === "set"
        ? await setPin(userId, pin)
        : await specialChannelLogin(userId, pin);
      onSuccessRef.current(result);
      dispatch({ type: "SUCCESS", authData: result });
    } catch (err: any) {
      dispatch({
        type: "FAILURE",
        error: err?.message || (state.mode === "set" ? "设置失败" : "验证失败"),
      });
    }
  }, [state, userId]);

  const handleCancel = useCallback(() => {
    dispatch({ type: "CANCEL" });
    onCancel();
  }, [onCancel]);

  return {
    dots: state.dots,
    mode: state.mode,
    step: state.step,
    isLocked: state.isLocked,
    lockSeconds: state.lockSeconds,
    errorText: state.errorText,
    isLoading: state.isLoading,
    handleDigit,
    handleDelete,
    handleSubmit,
    handleCancel,
  };
}
```

**NOTE:** The state machine in Step 2 above needs a minor fix — the "set" mode two-phase confirm flow requires a `CONFIRM_START` action. This will be refined in Task 12 when writing tests. The current reducer handles the `SUBMIT` action for `set` mode by transitioning to `confirming` step.

- [ ] **Step 3: Fix the reducer** — add `CONFIRM_START` action handling and fix the handleSubmit logic. Replace the reducer's `SUBMIT` case and add `CONFIRM_START`:

In the reducer, split SUBMIT behavior:

```ts
case "CONFIRM_START": {
  // set mode: first input done, switch to confirmation
  return { ...s, step: "confirming", confirmInput: [], dots: [], errorText: null };
}
case "SUBMIT":
  return { ...s, isLoading: true, errorText: null };
```

And in handleSubmit, when mode is "set" and step is "input":

```ts
if (state.mode === "set" && state.step === "input") {
  if (state.input.length < MIN_DIGITS) return;
  dispatch({ type: "CONFIRM_START" });
  return;
}
```

Add `CONFIRM_START` to the Action type union:
```ts
| { type: "CONFIRM_START" }
```

- [ ] **Step 4: Write NumericKeypad.tsx shell**

```tsx
// frontend/src/components/ui/NumericKeypad.tsx
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Delete } from "lucide-react";
import { Z_INDEX } from "@/constants/zIndex";
import { useNumericKeypad } from "./useNumericKeypad";
import type { NumericKeypadProps } from "./NumericKeypad.types";

const LAYOUT = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [-1, 0, -2], // -1: empty, -2: delete
];

export function NumericKeypad(props: NumericKeypadProps) {
  const { mode, userId, userName, onSuccess, onCancel, className = "" } = props;
  const kp = useNumericKeypad(mode, userId, onSuccess, onCancel);

  const title = mode === "set" ? "设置个人密码" : "验证个人密码";
  const subtitle = mode === "set"
    ? (kp.step === "confirming" ? "请再次输入以确认" : `为 ${userName || userId} 设置 ${"●".repeat(6)}-${"●".repeat(8)} 位数字密码`)
    : `验证 ${userName || userId} 的个人密码`;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        style={{ zIndex: Z_INDEX.keypad }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 40, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 40, opacity: 0 }}
          className={`w-full max-w-[320px] rounded-3xl bg-[#0f172a] border border-white/10 shadow-2xl p-6 ${className}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-lg font-bold">{title}</h2>
            <button onClick={kp.handleCancel} className="text-white/60 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subtitle */}
          <p className="text-slate-400 text-xs text-center mb-6">{subtitle}</p>

          {/* Dots indicator */}
          <div className="flex justify-center gap-2 mb-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-colors ${
                  i < kp.dots.length
                    ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                    : "bg-white/10"
                }`}
              />
            ))}
          </div>

          {/* Error text */}
          {kp.errorText && (
            <p className="text-red-400 text-xs text-center mb-4">{kp.errorText}</p>
          )}

          {/* Lock countdown */}
          {kp.isLocked && (
            <p className="text-amber-400 text-sm text-center mb-4 font-bold">
              已锁定，{kp.lockSeconds} 秒后重试
            </p>
          )}

          {/* Keypad grid */}
          <div className="grid grid-cols-3 gap-2">
            {LAYOUT.flat().map((key, i) => {
              if (key === -1) return <div key={`empty-${i}`} />;
              if (key === -2) {
                return (
                  <button
                    key="delete"
                    onClick={kp.handleDelete}
                    disabled={kp.isLocked || kp.isLoading}
                    className="h-14 rounded-xl bg-white/5 flex items-center justify-center
                               text-white/60 hover:bg-white/10 disabled:opacity-30 transition-colors"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => kp.handleDigit(key)}
                  disabled={kp.isLocked || kp.isLoading}
                  className="h-14 rounded-xl bg-white/10 flex items-center justify-center
                             text-white text-xl font-bold hover:bg-white/20 active:bg-white/30
                             disabled:opacity-30 transition-colors"
                >
                  {key}
                </button>
              );
            })}
          </div>

          {/* Submit button */}
          <button
            onClick={kp.handleSubmit}
            disabled={kp.dots.length < 6 || kp.isLocked || kp.isLoading}
            className="w-full mt-4 h-12 rounded-xl bg-cyan-500 text-white font-bold
                       hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {kp.isLoading ? "处理中..." : kp.step === "confirming" ? "确认设置" : "提交"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/NumericKeypad.types.ts \
        frontend/src/components/ui/useNumericKeypad.ts \
        frontend/src/components/ui/NumericKeypad.tsx
git commit -m "feat: add NumericKeypad component with reducer state machine"
```

---

### Task 12: Write BizOverlayShell types + hooks + shell

**Files:**
- Create: `frontend/src/components/scanner/BizOverlayShell.types.ts`
- Create: `frontend/src/components/scanner/useBizRegistry.ts`
- Create: `frontend/src/components/scanner/useBizOverlayShell.ts`
- Create: `frontend/src/components/scanner/BizOverlayShell.tsx`

- [ ] **Step 1: Write BizOverlayShell.types.ts**

```ts
// frontend/src/components/scanner/BizOverlayShell.types.ts
import type { ReactNode, ComponentType } from "react";

/** 业务项组件与覆盖层容器之间的唯一接口契约 */
export interface BizItemSlotProps {
  userId: string;
  pin: string;
  onDone: () => void;
  onError: (msg: string) => void;
}

/** 注册表中的业务项定义 */
export interface BizItem {
  id: string;
  label: string;
  icon?: ReactNode;
  order: number;
  component: ComponentType<BizItemSlotProps>;
  enabled?: boolean;
  onBeforeConfirm?: (pin: string) => boolean | Promise<boolean>;
  onAfterConfirm?: (pin: string) => void | Promise<void>;
  validate?: () => string | null;
}

export interface BizOverlayShellProps {
  userId: string;
  title: string;
  onCancel: () => void;
  className?: string;
}
```

- [ ] **Step 2: Write useBizRegistry.ts (re-export from Zustand store)**

```ts
// frontend/src/components/scanner/useBizRegistry.ts
import { useSpecialChannelStore } from "@/store/useSpecialChannelStore";

export function useBizRegistry() {
  const registerBiz = useSpecialChannelStore((s) => s.registerBiz);
  const unregisterBiz = useSpecialChannelStore((s) => s.unregisterBiz);
  const getBizItems = useSpecialChannelStore((s) => s.getBizItems);
  const clearBiz = useSpecialChannelStore((s) => s.clearBiz);

  return { register: registerBiz, unregister: unregisterBiz, getItems: getBizItems, clear: clearBiz };
}
```

- [ ] **Step 3: Write useBizOverlayShell.ts**

```ts
// frontend/src/components/scanner/useBizOverlayShell.ts
import { useState, useCallback } from "react";
import { useBizRegistry } from "./useBizRegistry";

export function useBizOverlayShell(userId: string, onCancel: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const { getItems } = useBizRegistry();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setShowKeypad(false);
    onCancel();
  }, [onCancel]);

  const confirm = useCallback(async () => {
    const items = getItems();
    // Run all onBeforeConfirm hooks
    for (const item of items) {
      if (item.validate) {
        const err = item.validate();
        if (err) return; // validation failed — let the item handle display
      }
    }
    setShowKeypad(true);
  }, [getItems]);

  const handlePinSuccess = useCallback(
    async (authData: any) => {
      const pin = ""; // PIN is already verified at this point
      const items = getItems();
      for (const item of items) {
        try {
          await item.onAfterConfirm?.(pin);
        } catch {
          // per-item error, don't block others
        }
      }
      setShowKeypad(false);
      setIsOpen(false);
    },
    [getItems]
  );

  return { isOpen, showKeypad, open, close, confirm, handlePinSuccess, setShowKeypad };
}
```

- [ ] **Step 4: Write BizOverlayShell.tsx**

```tsx
// frontend/src/components/scanner/BizOverlayShell.tsx
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Z_INDEX } from "@/constants/zIndex";
import { useBizOverlayShell } from "./useBizOverlayShell";
import { useBizRegistry } from "./useBizRegistry";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import type { BizOverlayShellProps, BizItemSlotProps } from "./BizOverlayShell.types";

/** Per-item error boundary — one biz item crash doesn't take down the overlay */
class BizItemErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-xs">
          ⚠️「{this.props.label}」加载失败
        </div>
      );
    }
    return this.props.children;
  }
}

export function BizOverlayShell({ userId, title, onCancel, className = "" }: BizOverlayShellProps) {
  const { isOpen, showKeypad, open, close, confirm, handlePinSuccess, setShowKeypad } =
    useBizOverlayShell(userId, onCancel);
  const { getItems } = useBizRegistry();

  const items = isOpen ? getItems() : [];

  return (
    <>
      {showKeypad && (
        <NumericKeypad
          mode="verify"
          userId={userId}
          onSuccess={(result) => handlePinSuccess(result)}
          onCancel={() => setShowKeypad(false)}
        />
      )}

      <AnimatePresence>
        {isOpen && (
          createPortal(
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              style={{ zIndex: Z_INDEX.bizOverlay }}
            >
              <motion.div
                initial={{ scale: 0.95, y: 24, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 24, opacity: 0 }}
                className={`w-full max-w-lg max-h-[80vh] rounded-2xl bg-[#0f172a] border border-white/10 shadow-2xl flex flex-col ${className}`}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
                  <h2 className="text-white text-lg font-bold">{title}</h2>
                  <button onClick={close} className="text-white/60 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {items.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-8">
                      暂无可用的快捷业务
                    </p>
                  ) : (
                    items.map((item) => (
                      <BizItemErrorBoundary key={item.id} label={item.label}>
                        <item.component
                          userId={userId}
                          pin=""
                          onDone={close}
                          onError={(msg) => console.error(`[${item.id}]`, msg)}
                        />
                      </BizItemErrorBoundary>
                    ))
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/5 shrink-0">
                  <button
                    onClick={confirm}
                    disabled={items.length === 0}
                    className="w-full h-11 rounded-xl bg-cyan-500 text-white font-bold
                               hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    提交
                  </button>
                </div>
              </motion.div>
            </motion.div>,
            document.body
          )
        )}
      </AnimatePresence>
    </>
  );
}
```

**NOTE:** The `open()` method from useBizOverlayShell is exposed but the current shell auto-opens via the hook's `isOpen` state. The parent component (UiverseProfilePopup) will call `open()` to show it. Adjust the hook to not auto-open — add `open` as a trigger. Fix: remove initialState of `true` from `isOpen`; `open()` sets it to `true`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/scanner/BizOverlayShell.types.ts \
        frontend/src/components/scanner/useBizRegistry.ts \
        frontend/src/components/scanner/useBizOverlayShell.ts \
        frontend/src/components/scanner/BizOverlayShell.tsx
git commit -m "feat: add BizOverlayShell with biz registry + per-item ErrorBoundary"
```

---

### Task 13: Create scanner barrel export

**Files:**
- Create: `frontend/src/components/scanner/index.ts`

- [ ] **Step 1: Write barrel export**

```ts
// frontend/src/components/scanner/index.ts
export { NumericKeypad } from "@/components/ui/NumericKeypad";
export { BizOverlayShell } from "./BizOverlayShell";
export { useBizRegistry } from "./useBizRegistry";
export { checkPinStatus, setPin, specialChannelLogin } from "./specialChannel.api";
export type { BizItem, BizItemSlotProps, BizOverlayShellProps } from "./BizOverlayShell.types";
export type { NumericKeypadProps } from "@/components/ui/NumericKeypad.types";
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/scanner/index.ts
git commit -m "feat: add scanner barrel export"
```

---

## Phase 5: Integration

### Task 14: Fix Z-Index in ScanAccessNoticeOverlay

**Files:**
- Modify: `frontend/src/components/scanner/ScanAccessNoticeOverlay.tsx`

- [ ] **Step 1: Replace hardcoded z-index**

In `ScanAccessNoticeOverlay.tsx`, line 59:
```tsx
// Replace:
- className={`pointer-events-none fixed inset-0 z-[100150] flex items-center justify-center p-6 ${theme.backdrop}`}
// With:
+ import { Z_INDEX } from "@/constants/zIndex";
+ className={`pointer-events-none fixed inset-0 flex items-center justify-center p-6 ${theme.backdrop}`}
+ style={{ zIndex: Z_INDEX.popupNotice }}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/scanner/ScanAccessNoticeOverlay.tsx
git commit -m "fix: replace hardcoded z-index with Z_INDEX constant in ScanAccessNoticeOverlay"
```

---

### Task 15: Integrate student entry buttons into UiverseProfilePopup

**Files:**
- Modify: `frontend/src/components/scanner/UiverseProfilePopup.tsx`

- [ ] **Step 1: Replace hardcoded z-index + add student buttons**

Three changes to `UiverseProfilePopup.tsx`:

**Change A — Import additions (near top):**
```tsx
import { Z_INDEX } from "@/constants/zIndex";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { BizOverlayShell, useBizRegistry } from "@/components/scanner";
import { checkPinStatus } from "@/components/scanner/specialChannel.api";
```

**Change B — Replace z-index on the main motion.div (line ~131):**
```tsx
// Replace:
- className="fixed inset-0 z-[99999] flex flex-col overflow-hidden bg-[#050A15]/85 backdrop-blur-sm"
// With:
  className="fixed inset-0 flex flex-col overflow-hidden bg-[#050A15]/85 backdrop-blur-sm"
  style={{ zIndex: Z_INDEX.scannerPopup }}
```

**Change C — Add state + student buttons inside the component, after the `showUnboundBindHint` check (before the close button in the motion.div):**

```tsx
// State for student entry
const [showKeypad, setShowKeypad] = useState<"set" | "verify" | null>(null);
const [showQuickActions, setShowQuickActions] = useState(false);
const [keypadUserId, setKeypadUserId] = useState("");
const navigate = useNavigate();

const isStudent = result?.userInfo?.role === "STUDENT" || authStorage.getRole() === "STUDENT";
// Check from the popup user data: state.user.role or similar
const studentUserId = state.user?.userId || result?.userInfo?.userId || "";
const isStudentRole = String(state.user?.userTypeNames || "").includes("学生") || false;

const handleEnterStudentCenter = async () => {
  if (!studentUserId) return;
  try {
    const hasPin = await checkPinStatus(studentUserId);
    setKeypadUserId(studentUserId);
    setShowKeypad(hasPin ? "verify" : "set");
  } catch (err: any) {
    // fallback: treat as set
    setKeypadUserId(studentUserId);
    setShowKeypad("set");
  }
};

const handleKeypadSuccess = (authData: any) => {
  authStorage.setAuth(authData.token, authData.role, authData.userInfo);
  setShowKeypad(null);
  onClose();
  navigate("/student/home");
};
```

**Change D — Add button rendering in the ActionButtons area (replace or extend the bottom button row):**

Add these buttons alongside the existing unbound-bind-hint button. Place them inside the motion.div, near the bottom. The student buttons should be in the right-column area near ActionButtons:

```tsx
{/* Student entry buttons — only for student role */}
{isStudentRole && (
  <div className="absolute bottom-8 left-1/2 z-[10001] -translate-x-1/2 flex gap-3">
    <button
      type="button"
      className="rounded-xl border border-cyan-400/60 bg-cyan-500/20 px-4 py-2.5 text-center text-[12px] font-bold text-cyan-50 shadow-lg shadow-cyan-900/40 hover:bg-cyan-500/35 transition-colors"
      onClick={handleEnterStudentCenter}
    >
      进入学生中心
    </button>
    <button
      type="button"
      className="rounded-xl border border-emerald-400/60 bg-emerald-500/20 px-4 py-2.5 text-center text-[12px] font-bold text-emerald-50 shadow-lg shadow-emerald-900/40 hover:bg-emerald-500/35 transition-colors"
      onClick={() => setShowQuickActions(true)}
    >
      快捷业务
    </button>
  </div>
)}

{/* Keypad overlay */}
{showKeypad && (
  <NumericKeypad
    mode={showKeypad}
    userId={keypadUserId}
    userName={state.user?.name}
    onSuccess={handleKeypadSuccess}
    onCancel={() => setShowKeypad(null)}
  />
)}

{/* Quick actions overlay */}
{showQuickActions && (
  <BizOverlayShell
    userId={studentUserId}
    title="快捷业务"
    onCancel={() => setShowQuickActions(false)}
  />
)}
```

- [ ] **Step 2: Verify the role check** — confirm that `state.user?.userTypeNames` correctly identifies students. Check `useProfilePopup.ts` for what fields are available.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/scanner/UiverseProfilePopup.tsx
git commit -m "feat: integrate student entry buttons + keypad into UiverseProfilePopup"
```

---

### Task 16: Add PIN status column to AdminPersonnelPage

**Files:**
- Modify: `frontend/src/pages/AdminPersonnelPage.tsx`

- [ ] **Step 1: Add personal PIN column to student tab table**

Read the current `AdminPersonnelPage.tsx` to find the student tab table definition. Add a new column "个人密码" that shows:
- Green badge "已设置" if `personal_pin` is NOT NULL
- Red badge "未设置" if `personal_pin` IS NULL
- A reset button (only for SUPER_ADMIN) that calls `resetStudentPin(userId)`

Note: The current personnel API may not return `personal_pin` field. The backend needs to be checked — if the personnel listing API doesn't include these columns, a separate approach is needed (a dedicated PIN status batch endpoint, or extending the existing personnel response).

**Fallback approach:** If the personnel listing API can't easily be extended, add a standalone "PIN 管理" section in the student tab that queries `GET /api/auth/special-channel/pin-status?userId=` for selected students.

- [ ] **Step 2: Commit** after confirming the API integration approach.

---

## Phase 6: Verification

### Task 17: Build and verify

- [ ] **Step 1: Build backend**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```
Expected: BUILD SUCCESS

- [ ] **Step 2: Build frontend**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty
```
Expected: No TypeScript errors

- [ ] **Step 3: Start the app and verify**

Start the application. Test the PIN flow end-to-end:
1. Scan a student card → popup appears
2. Click "进入学生中心" → NumericKeypad appears
3. Set PIN → JWT returned → redirected to /student/home
4. Close, re-scan → click "进入学生中心" → verify mode
5. Enter wrong PIN 3 times → lock 30s

- [ ] **Step 4: Commit any fixes**

---

## Affected Files Summary

**Backend (7 new, 3 modified):**
| Action | File |
|--------|------|
| NEW | `common/component/SpecialChannelTableBootstrap.java` |
| NEW | `modules/auth/controller/SpecialChannelController.java` |
| NEW | `modules/auth/service/SpecialChannelService.java` |
| NEW | `modules/auth/service/StudentAccountProvisioner.java` |
| NEW | `modules/auth/dto/SetPinRequest.java` |
| NEW | `modules/auth/dto/SpecialChannelLoginRequest.java` |
| NEW | `modules/auth/dto/PinStatusResponse.java` |
| MODIFY | `common/exception/ErrorCodeConstants.java` |
| MODIFY | `modules/aro/mapper/AroPersonnelMapper.java` |
| MODIFY | `resources/mapper/AroPersonnelMapper.xml` |

**Frontend (12 new, 3 modified):**
| Action | File |
|--------|------|
| NEW | `constants/zIndex.ts` |
| NEW | `components/ui/NumericKeypad.tsx` |
| NEW | `components/ui/useNumericKeypad.ts` |
| NEW | `components/ui/NumericKeypad.types.ts` |
| NEW | `components/scanner/index.ts` |
| NEW | `components/scanner/BizOverlayShell.tsx` |
| NEW | `components/scanner/useBizOverlayShell.ts` |
| NEW | `components/scanner/BizOverlayShell.types.ts` |
| NEW | `components/scanner/useBizRegistry.ts` |
| NEW | `components/scanner/specialChannel.api.ts` |
| NEW | `api/domains/specialChannel.api.ts` |
| NEW | `store/useSpecialChannelStore.ts` |
| MODIFY | `components/scanner/UiverseProfilePopup.tsx` |
| MODIFY | `components/scanner/ScanAccessNoticeOverlay.tsx` |
| MODIFY | `pages/AdminPersonnelPage.tsx` |

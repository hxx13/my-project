# 免冻结功能增强 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将免冻结从"全局豁免所有管控"拆分为: 取消激活/签退规则跳过、房间级扫码时段豁免、新增次数限制模式、小程序 dahua-issue 入口。

**Architecture:** 后端 `twin_card_mapping` 新增 4 个字段; `DahuaSwingRuleEngineService` 删除豁免跳过; `TwinCardMappingService` 新增 `isRoomExemptForScanEntry()` 和 `incrementExemptUsedCount()`; 前端和小程序豁免弹窗增加模式/次数/房间选择; 小程序房间页新增 dahua-issue 入口按钮。

**Tech Stack:** Java Spring Boot 3.5 + MyBatis + MySQL, React TypeScript + Tailwind CSS, 微信小程序 (Vant Weapp)

---

### Task 1: 数据库迁移 — twin_card_mapping 新增 4 列

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/card/config/TwinCardMappingSchemaMigrator.java`
- Modify: `src/main/java/com/example/demo/modules/twin/card/entity/TwinCardMapping.java`
- Modify: `src/main/resources/mapper/TwinCardMappingMapper.xml`

- [ ] **Step 1: 在 SchemaMigrator 中添加 4 列的 ensureColumnExists 调用**

`TwinCardMappingSchemaMigrator.java` — 在现有 `migrate()` 方法的 try 块末尾，`log.info("[twin-mapping-schema]...")` 之前，添加:

```java
ensureColumnExists(
    "twin_card_mapping",
    "freeze_exempt_room_ids",
    "ALTER TABLE twin_card_mapping ADD COLUMN freeze_exempt_room_ids TEXT NULL COMMENT '豁免房间权限ID JSON数组'"
);
ensureColumnExists(
    "twin_card_mapping",
    "freeze_exempt_mode",
    "ALTER TABLE twin_card_mapping ADD COLUMN freeze_exempt_mode VARCHAR(20) NULL DEFAULT 'TIME' COMMENT '豁免模式 TIME/COUNT/BOTH'"
);
ensureColumnExists(
    "twin_card_mapping",
    "freeze_exempt_max_count",
    "ALTER TABLE twin_card_mapping ADD COLUMN freeze_exempt_max_count INT NULL COMMENT '次数限制上限'"
);
ensureColumnExists(
    "twin_card_mapping",
    "freeze_exempt_used_count",
    "ALTER TABLE twin_card_mapping ADD COLUMN freeze_exempt_used_count INT NOT NULL DEFAULT 0 COMMENT '已使用次数'"
);
```

- [ ] **Step 2: 在 Entity 中新增字段**

`TwinCardMapping.java` — 在 `freezeExemptExpireAt` 字段之后，`lastModifiedTime` 之前，添加:

```java
/** 豁免房间权限ID JSON数组 ["roomId1","roomId2"] */
private String freezeExemptRoomIds;
/** 豁免模式 TIME / COUNT / BOTH */
private String freezeExemptMode;
/** 次数限制上限（mode=COUNT或BOTH时有效） */
private Integer freezeExemptMaxCount;
/** 已使用次数 */
private Integer freezeExemptUsedCount;
```

- [ ] **Step 3: 在 Mapper XML 中更新列映射**

`TwinCardMappingMapper.xml` — 在 `<sql id="mappingColumns">` 中添加新列:

```xml
freeze_exempt_room_ids AS freezeExemptRoomIds,
freeze_exempt_mode AS freezeExemptMode,
freeze_exempt_max_count AS freezeExemptMaxCount,
freeze_exempt_used_count AS freezeExemptUsedCount,
```

同时更新 `findAllWithUserInfo` 的 SELECT 列表，在 `m.freeze_exempt_expire_at AS freezeExemptExpireAt,` 之后添加:

```xml
m.freeze_exempt_room_ids AS freezeExemptRoomIds,
m.freeze_exempt_mode AS freezeExemptMode,
m.freeze_exempt_max_count AS freezeExemptMaxCount,
m.freeze_exempt_used_count AS freezeExemptUsedCount,
```

- [ ] **Step 4: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```

Expected: BUILD SUCCESS

---

### Task 2: 后端 — 扩展 updateExemptFlag 支持新参数

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/card/mapper/TwinCardMappingMapper.java`
- Modify: `src/main/resources/mapper/TwinCardMappingMapper.xml`
- Modify: `src/main/java/com/example/demo/modules/twin/card/service/TwinCardMappingService.java`
- Modify: `src/main/java/com/example/demo/modules/twin/card/controller/TwinMappingController.java`

- [ ] **Step 1: Mapper 接口签名扩展**

`TwinCardMappingMapper.java` — 修改 `updateExemptFlag` 方法签名:

```java
void updateExemptFlag(@Param("cardNo") String cardNo, @Param("flag") Integer flag,
                      @Param("expireAt") String expireAt, @Param("updateTime") String updateTime,
                      @Param("mode") String mode, @Param("maxCount") Integer maxCount,
                      @Param("roomIds") String roomIds);
```

同时修改 `updateExemptFlagByUserId` 方法签名:

```java
int updateExemptFlagByUserId(@Param("aroUserId") String aroUserId, @Param("flag") int flag,
                             @Param("expireAt") String expireAt,
                             @Param("mode") String mode, @Param("maxCount") Integer maxCount,
                             @Param("roomIds") String roomIds);
```

新增 Mapper 方法:

```java
/** 递增免冻结已使用次数，达到上限时自动收回豁免 */
int incrementExemptUsedCount(@Param("aroUserId") String aroUserId, @Param("roomId") String roomId);

/** 收回次数已耗尽的豁免 */
int revokeExhaustedCountExemptions();
```

- [ ] **Step 2: Mapper XML 更新**

`TwinCardMappingMapper.xml` — 修改 `updateExemptFlag`:

```xml
<update id="updateExemptFlag">
    UPDATE twin_card_mapping
    SET freeze_exempt_flag = #{flag},
        freeze_exempt_grant_date = CASE WHEN #{flag} = 1 THEN CURDATE() ELSE NULL END,
        exempt_granted_at = CASE WHEN #{flag} = 1 THEN NOW() ELSE NULL END,
        freeze_exempt_expire_at = CASE WHEN #{flag} = 1 THEN #{expireAt} ELSE NULL END,
        freeze_exempt_mode = CASE WHEN #{flag} = 1 THEN #{mode} ELSE NULL END,
        freeze_exempt_max_count = CASE WHEN #{flag} = 1 THEN #{maxCount} ELSE NULL END,
        freeze_exempt_used_count = CASE WHEN #{flag} = 1 THEN 0 ELSE 0 END,
        freeze_exempt_room_ids = CASE WHEN #{flag} = 1 THEN #{roomIds} ELSE NULL END,
        last_modified_time = #{updateTime}
    WHERE card_no = #{cardNo}
</update>
```

修改 `updateExemptFlagByUserId`:

```xml
<update id="updateExemptFlagByUserId">
    UPDATE twin_card_mapping
    SET freeze_exempt_flag = #{flag},
        freeze_exempt_grant_date = CASE WHEN #{flag} = 1 THEN CURDATE() ELSE NULL END,
        exempt_granted_at = CASE WHEN #{flag} = 1 THEN NOW() ELSE NULL END,
        freeze_exempt_expire_at = CASE WHEN #{flag} = 1 THEN #{expireAt} ELSE NULL END,
        freeze_exempt_mode = CASE WHEN #{flag} = 1 THEN #{mode} ELSE NULL END,
        freeze_exempt_max_count = CASE WHEN #{flag} = 1 THEN #{maxCount} ELSE NULL END,
        freeze_exempt_used_count = CASE WHEN #{flag} = 1 THEN 0 ELSE 0 END,
        freeze_exempt_room_ids = CASE WHEN #{flag} = 1 THEN #{roomIds} ELSE NULL END,
        last_modified_time = NOW()
    WHERE aro_user_id = #{aroUserId}
</update>
```

新增 `incrementExemptUsedCount`:

```xml
<update id="incrementExemptUsedCount">
    UPDATE twin_card_mapping
    SET freeze_exempt_used_count = freeze_exempt_used_count + 1,
        freeze_exempt_flag = CASE
            WHEN freeze_exempt_mode IN ('COUNT','BOTH')
             AND freeze_exempt_max_count IS NOT NULL
             AND freeze_exempt_used_count + 1 >= freeze_exempt_max_count
            THEN 0 ELSE freeze_exempt_flag END,
        freeze_exempt_room_ids = CASE
            WHEN freeze_exempt_mode IN ('COUNT','BOTH')
             AND freeze_exempt_max_count IS NOT NULL
             AND freeze_exempt_used_count + 1 >= freeze_exempt_max_count
            THEN NULL ELSE freeze_exempt_room_ids END,
        freeze_exempt_mode = CASE
            WHEN freeze_exempt_mode IN ('COUNT','BOTH')
             AND freeze_exempt_max_count IS NOT NULL
             AND freeze_exempt_used_count + 1 >= freeze_exempt_max_count
            THEN NULL ELSE freeze_exempt_mode END,
        freeze_exempt_max_count = CASE
            WHEN freeze_exempt_mode IN ('COUNT','BOTH')
             AND freeze_exempt_max_count IS NOT NULL
             AND freeze_exempt_used_count + 1 >= freeze_exempt_max_count
            THEN NULL ELSE freeze_exempt_max_count END,
        freeze_exempt_expire_at = CASE
            WHEN freeze_exempt_mode IN ('COUNT','BOTH')
             AND freeze_exempt_max_count IS NOT NULL
             AND freeze_exempt_used_count + 1 >= freeze_exempt_max_count
            THEN NULL ELSE freeze_exempt_expire_at END,
        last_modified_time = NOW()
    WHERE aro_user_id = #{aroUserId}
      AND freeze_exempt_flag = 1
</update>
```

新增 `revokeExhaustedCountExemptions`:

```xml
<update id="revokeExhaustedCountExemptions">
    UPDATE twin_card_mapping
    SET freeze_exempt_flag = 0,
        freeze_exempt_grant_date = NULL,
        exempt_granted_at = NULL,
        freeze_exempt_expire_at = NULL,
        freeze_exempt_room_ids = NULL,
        freeze_exempt_mode = NULL,
        freeze_exempt_max_count = NULL,
        freeze_exempt_used_count = 0,
        last_modified_time = NOW()
    WHERE freeze_exempt_flag = 1
      AND freeze_exempt_mode IN ('COUNT', 'BOTH')
      AND freeze_exempt_max_count IS NOT NULL
      AND freeze_exempt_used_count >= freeze_exempt_max_count
</update>
```

- [ ] **Step 3: Service 层 updateExemptFlag 扩展**

`TwinCardMappingService.java` — 修改 `updateExemptFlag` 方法签名，增加新参数:

```java
public synchronized Map<String, Object> updateExemptFlag(
        String cardNo, Integer flag, Integer durationMinutes,
        String mode, Integer maxCount, String roomIds) {
    if (flag == null || (flag != 0 && flag != 1)) {
        throw new IllegalArgumentException("flag 须为 0 或 1");
    }
    // 校验 mode
    if (flag == 1) {
        if (mode == null || mode.isBlank()) {
            mode = "TIME";
        }
        if (!mode.equals("TIME") && !mode.equals("COUNT") && !mode.equals("BOTH")) {
            throw new IllegalArgumentException("mode 须为 TIME / COUNT / BOTH");
        }
        if ((mode.equals("COUNT") || mode.equals("BOTH")) && (maxCount == null || maxCount <= 0)) {
            throw new IllegalArgumentException("次数限制模式须指定 maxCount");
        }
        if ((mode.equals("TIME") || mode.equals("BOTH")) && durationMinutes == null) {
            throw new IllegalArgumentException("时长限制模式须指定 durationMinutes");
        }
    }
    TwinCardMapping cacheItem = resolveMappingByCardNo(cardNo);
    String dbCardNo = cacheItem != null ? cacheItem.getCardNo() : (cardNo == null ? "" : cardNo.trim());
    String updateTime = getCurrentTime();
    String expireAt = null;
    if (flag == 1 && (mode.equals("TIME") || mode.equals("BOTH"))) {
        expireAt = computeExemptExpireAt(durationMinutes);
    }
    mappingMapper.updateExemptFlag(dbCardNo, flag, expireAt, updateTime, mode, maxCount, roomIds);
    if (cacheItem != null) {
        applyExemptFieldsToMapping(cacheItem, flag, expireAt, updateTime);
        cacheItem.setFreezeExemptMode(flag == 1 ? mode : null);
        cacheItem.setFreezeExemptMaxCount(flag == 1 ? maxCount : null);
        cacheItem.setFreezeExemptUsedCount(0);
        cacheItem.setFreezeExemptRoomIds(flag == 1 ? roomIds : null);
    }
    Map<String, Object> out = new HashMap<>();
    out.put("cardNo", dbCardNo);
    out.put("freezeExemptFlag", flag);
    out.put("freezeExemptExpireAt", expireAt);
    out.put("freezeExemptMode", flag == 1 ? mode : null);
    out.put("freezeExemptMaxCount", flag == 1 ? maxCount : null);
    out.put("freezeExemptRoomIds", flag == 1 ? roomIds : null);
    out.put("lastModifiedTime", updateTime);
    return out;
}
```

同时修改 `updateExemptFlagByUserId` 方法:

```java
public synchronized void updateExemptFlagByUserId(String aroUserId, int flag) {
    updateExemptFlagByUserId(aroUserId, flag, flag == 1 ? -1 : null, "TIME", null, null);
}

public synchronized void updateExemptFlagByUserId(
        String aroUserId, int flag, Integer durationMinutes,
        String mode, Integer maxCount, String roomIds) {
    try {
        String expireAt = null;
        if (flag == 1 && (mode == null || mode.equals("TIME") || mode.equals("BOTH"))) {
            expireAt = computeExemptExpireAt(durationMinutes != null ? durationMinutes : -1);
        }
        int affected = mappingMapper.updateExemptFlagByUserId(
                aroUserId, flag, expireAt, mode, maxCount, roomIds);
        if (affected > 0) {
            TwinCardMapping m = userIdCache.get(aroUserId.trim());
            if (m != null) {
                applyExemptFieldsToMapping(m, flag, expireAt, getCurrentTime());
                m.setFreezeExemptMode(flag == 1 ? mode : null);
                m.setFreezeExemptMaxCount(flag == 1 ? maxCount : null);
                m.setFreezeExemptUsedCount(0);
                m.setFreezeExemptRoomIds(flag == 1 ? roomIds : null);
            }
            log.info("[映射底盘] 人员 {} 豁免={} mode={} maxCount={}", aroUserId, flag == 1 ? "开" : "关", mode, maxCount);
        }
    } catch (Exception e) {
        log.error("[映射底盘] 修改豁免权失败 aroUserId={}: {}", aroUserId, e.getMessage());
    }
}
```

- [ ] **Step 4: Controller 层 POST /exempt 扩展**

`TwinMappingController.java` — 修改 `updateExemptFlag` 方法中的解析逻辑:

```java
@PostMapping("/exempt")
@Operation(summary = "设置豁免标记")
public Result<?> updateExemptFlag(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @RequestBody Map<String, Object> payload) {
    User user = authContextService.resolveUserFromBearer(authorization);
    Result<?> denied = requireAdmin(user);
    if (denied != null) {
        return denied;
    }
    try {
        String cardNo = payload.get("cardNo").toString();
        Integer flag = Integer.parseInt(payload.get("flag").toString());
        Integer durationMinutes = null;
        if (payload.get("durationMinutes") != null) {
            durationMinutes = Integer.parseInt(payload.get("durationMinutes").toString());
        }
        String mode = payload.get("mode") != null ? payload.get("mode").toString() : "TIME";
        Integer maxCount = null;
        if (payload.get("maxCount") != null) {
            maxCount = Integer.parseInt(payload.get("maxCount").toString());
        }
        String roomIds = payload.get("roomIds") != null ? payload.get("roomIds").toString() : null;
        
        if (flag == 1) {
            if ((mode.equals("TIME") || mode.equals("BOTH")) && durationMinutes == null) {
                return Result.error("时长限制模式须选择时效（durationMinutes）");
            }
            if ((mode.equals("COUNT") || mode.equals("BOTH")) && maxCount == null) {
                return Result.error("次数限制模式须指定次数（maxCount）");
            }
        }
        Map<String, Object> updated = mappingService.updateExemptFlag(
                cardNo, flag, durationMinutes, mode, maxCount, roomIds);
        log.info("[twin] exempt cardNo={} flag={} mode={} maxCount={} by userId={}",
                cardNo, flag, mode, maxCount, user.getId());
        return Result.success(updated);
    } catch (IllegalArgumentException e) {
        return Result.error(e.getMessage());
    } catch (Exception e) {
        return Result.error("特权更新失败: " + e.getMessage());
    }
}
```

- [ ] **Step 5: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```

Expected: BUILD SUCCESS

---

### Task 3: 后端 — 删除 DahuaSwingRuleEngineService 中的豁免跳过

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dahua/service/DahuaSwingRuleEngineService.java`

- [ ] **Step 1: 删除豁免跳过逻辑**

`DahuaSwingRuleEngineService.java` — 删除 L156-158:

```java
// DELETE these three lines:
if (Integer.valueOf(1).equals(record.getFreezeExemptFlag())
        || twinCardMappingService.isLinkageRuleExempt(userId)) {
    return;
}
```

改动后，L152-160 区域应变为:

```java
String userId = str(record.getMappingUserId());
if (userId.isBlank()) {
    return;
}
String channelCode = str(record.getChannelCode());
```

- [ ] **Step 2: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```

Expected: BUILD SUCCESS

---

### Task 4: 后端 — 新增 isRoomExemptForScanEntry 方法

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/card/service/TwinCardMappingService.java`
- Modify: `src/main/java/com/example/demo/modules/twin/scan/service/TwinScanAppService.java`
- Modify: `src/main/java/com/example/demo/modules/twin/scan/controller/TwinScanController.java`

- [ ] **Step 1: 在 TwinCardMappingService 中新增 isRoomExemptForScanEntry**

`TwinCardMappingService.java` — 在 `isLinkageRuleExempt` 方法之后添加:

```java
/**
 * 检查免冻结用户是否对指定房间有扫码时段豁免。
 * 条件：freeze_exempt_flag=1 未过期 AND freeze_exempt_room_ids JSON 数组包含 roomId。
 */
public boolean isRoomExemptForScanEntry(String userId, String roomId) {
    if (userId == null || userId.isBlank() || roomId == null || roomId.isBlank()) {
        return false;
    }
    TwinCardMapping m = userIdCache.get(userId.trim());
    if (!isFreezeExempt(m)) {
        return false;
    }
    String roomIdsJson = m.getFreezeExemptRoomIds();
    if (roomIdsJson == null || roomIdsJson.isBlank()) {
        return false;
    }
    try {
        java.util.List<String> roomIds = com.alibaba.fastjson2.JSON.parseArray(roomIdsJson, String.class);
        return roomIds != null && roomIds.contains(roomId.trim());
    } catch (Exception e) {
        return false;
    }
}
```

- [ ] **Step 2: 修改 TwinScanAppService 中的豁免检查**

`TwinScanAppService.java` — 将 L216-219:

```java
// 风控豁免：非开放时段仍允许扫码进入（与联动豁免同源）
if (!entryAllowedNow && twinCardMappingService.isLinkageRuleExempt(realPhysicalId)) {
    entryAllowedNow = true;
}
```

替换为:

```java
// 风控豁免：免冻结用户在授权房间内仍允许扫码进入
if (!entryAllowedNow && twinCardMappingService.isRoomExemptForScanEntry(realPhysicalId, roomId)) {
    entryAllowedNow = true;
}
```

注：需要确认 `roomId` 变量在当前方法上下文中可访问。在 `analyzeScan()` 方法中，`roomId` 来自请求参数。

- [ ] **Step 3: 修改 TwinScanController 中的豁免检查**

`TwinScanController.java` — 将 L218-219:

```java
if (accessType == 1
        && !ScanPopupEntryWindowEvaluator.isEntryAllowedNow(swingCfg, winZone)
        && !twinCardMappingService.isLinkageRuleExempt(userId)) {
```

替换为:

```java
if (accessType == 1
        && !ScanPopupEntryWindowEvaluator.isEntryAllowedNow(swingCfg, winZone)
        && !twinCardMappingService.isRoomExemptForScanEntry(userId, roomId)) {
```

- [ ] **Step 4: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```

Expected: BUILD SUCCESS

---

### Task 5: 后端 — 新增 incrementExemptUsedCount 及扫码进入后调用

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/card/service/TwinCardMappingService.java`
- Modify: `src/main/java/com/example/demo/modules/twin/scan/controller/TwinScanController.java`

- [ ] **Step 1: 在 TwinCardMappingService 中新增 incrementExemptUsedCount**

`TwinCardMappingService.java` — 添加方法:

```java
/**
 * 用户扫码进入授权房间时调用。
 * 若免冻结模式为 COUNT/BOTH，则 usedCount+1。
 * 若 usedCount 达到 maxCount，自动收回免冻结。
 */
public void incrementExemptUsedCount(String userId, String roomId) {
    if (userId == null || userId.isBlank()) {
        return;
    }
    try {
        int affected = mappingMapper.incrementExemptUsedCount(userId.trim(), roomId);
        if (affected > 0) {
            // 同步缓存
            TwinCardMapping m = userIdCache.get(userId.trim());
            if (m != null && m.getFreezeExemptFlag() != null && m.getFreezeExemptFlag() == 1) {
                int newUsed = (m.getFreezeExemptUsedCount() != null ? m.getFreezeExemptUsedCount() : 0) + 1;
                m.setFreezeExemptUsedCount(newUsed);
                Integer max = m.getFreezeExemptMaxCount();
                if (max != null && max > 0 && newUsed >= max) {
                    // 次数耗尽，收回豁免
                    m.setFreezeExemptFlag(0);
                    m.setFreezeExemptGrantDate(null);
                    m.setFreezeExemptExpireAt(null);
                    m.setFreezeExemptMode(null);
                    m.setFreezeExemptMaxCount(null);
                    m.setFreezeExemptUsedCount(0);
                    m.setFreezeExemptRoomIds(null);
                    log.info("[豁免次数] 用户 {} 次数耗尽({}/{})，自动收回豁免", userId, newUsed, max);
                }
            }
        }
    } catch (Exception e) {
        log.warn("[豁免次数] incrementExemptUsedCount 失败 userId={} err={}", userId, e.getMessage());
    }
}
```

- [ ] **Step 2: 在扫码进入成功后调用**

`TwinScanController.java` — 在 `executeAccessAction` 成功后（`accessType == 1` 且 `aroSuccess == true`），添加调用。找到方法中 `accessType == 1` 成功返回的位置，在 `return Result.success(result)` 之前添加:

```java
// 扫码进入成功 → 递增免冻结使用次数
if (accessType == 1 && aroSuccess) {
    twinCardMappingService.incrementExemptUsedCount(userId, roomId);
}
```

注：需要在 `TwinScanController` 中注入 `TwinCardMappingService`（检查是否已有该依赖，若没有则添加）。

- [ ] **Step 3: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```

Expected: BUILD SUCCESS

---

### Task 6: 后端 — 扩展定时任务收回次数耗尽的豁免

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/card/service/TwinCardMappingService.java`

- [ ] **Step 1: 在 revokeExpiredTimedExemptions 中增加次数耗尽收回**

`TwinCardMappingService.java` — 找到 `revokeExpiredTimedExemptions()` 方法（`@Scheduled(fixedRate = 60000)`），在方法体中已有的 `revokeExpiredExemptionsByExpireAt()` 调用之后，添加:

```java
// 同时收回次数已耗尽的 COUNT/BOTH 豁免（兜底，主路径在 incrementExemptUsedCount 中已处理）
int countExhausted = mappingMapper.revokeExhaustedCountExemptions();
if (countExhausted > 0) {
    log.info("[豁免定时] 收回次数耗尽豁免 {} 条", countExhausted);
    syncCacheExpiredExemptFlags();
}
```

- [ ] **Step 2: 编译验证**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```

Expected: BUILD SUCCESS

---

### Task 7: 前端 — twinApi 类型和接口扩展

**Files:**
- Modify: `frontend/src/api/twinApi.ts`
- Modify: `frontend/src/constants/exemptDurationPresets.ts`

- [ ] **Step 1: 扩展 twinApi.ts 中的类型和函数**

`frontend/src/api/twinApi.ts` — 扩展 `CardMappingRow` 接口，添加新字段:

```ts
// 在 freezeExemptExpireAt 后添加:
freezeExemptRoomIds?: string | null;
freezeExemptMode?: string | null;  // 'TIME' | 'COUNT' | 'BOTH'
freezeExemptMaxCount?: number | null;
freezeExemptUsedCount?: number | null;
```

修改 `updateExemptFlag` 函数:

```ts
export const updateExemptFlag = async (
    cardNo: string,
    flag: number,
    durationMinutes?: number,
    mode?: string,
    maxCount?: number,
    roomIds?: string,
): Promise<{
    freezeExemptFlag?: number;
    freezeExemptExpireAt?: string | null;
    freezeExemptMode?: string | null;
    freezeExemptMaxCount?: number | null;
    freezeExemptRoomIds?: string | null;
    lastModifiedTime?: string;
}> => {
    const body: Record<string, unknown> = { cardNo, flag };
    if (flag === 1) {
        if (mode) body.mode = mode;
        if (durationMinutes != null) body.durationMinutes = durationMinutes;
        if (maxCount != null) body.maxCount = maxCount;
        if (roomIds) body.roomIds = roomIds;
    }
    const res = await authHttp.post(`/v1/twin/mappings/exempt`, body);
    return res.data?.data ?? res.data;
};
```

- [ ] **Step 2: 扩展 exemptDurationPresets.ts**

`frontend/src/constants/exemptDurationPresets.ts` — 在文件末尾添加:

```ts
export const EXEMPT_MODE_OPTIONS: { label: string; value: string }[] = [
    { label: '时长限制', value: 'TIME' },
    { label: '次数限制', value: 'COUNT' },
    { label: '时长+次数', value: 'BOTH' },
];

export function formatExemptStatus(row: {
    freezeExemptFlag?: number;
    freezeExemptMode?: string | null;
    freezeExemptExpireAt?: string | null;
    freezeExemptMaxCount?: number | null;
    freezeExemptUsedCount?: number | null;
}): string {
    if (!row.freezeExemptFlag || row.freezeExemptFlag !== 1) return '';
    const mode = row.freezeExemptMode || 'TIME';
    const parts: string[] = [];
    if (mode === 'TIME' || mode === 'BOTH') {
        const remain = formatExemptRemaining(row.freezeExemptExpireAt);
        if (remain) parts.push(remain);
    }
    if (mode === 'COUNT' || mode === 'BOTH') {
        const used = row.freezeExemptUsedCount ?? 0;
        const max = row.freezeExemptMaxCount ?? 0;
        parts.push(`剩余 ${max - used}/${max} 次`);
    }
    return parts.join(' · ');
}
```

- [ ] **Step 3: 前端编译验证**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors related to the changed files.

---

### Task 8: 前端 — DebugCardMappingPage 豁免弹窗改造

**Files:**
- Modify: `frontend/src/pages/DebugCardMappingPage.tsx`

- [ ] **Step 1: 更新导入**

在文件顶部 `EXEMPT_DURATION_PRESETS` 导入后，添加:

```tsx
import {
    EXEMPT_DURATION_PRESETS,
    formatExemptExpireAt,
    formatExemptRemaining,
    EXEMPT_MODE_OPTIONS,
    formatExemptStatus,
} from "@/constants/exemptDurationPresets";
```

- [ ] **Step 2: 更新 exemptModal 类型**

将 L119 的 state:

```tsx
const [exemptModal, setExemptModal] = useState<{ cardNo: string; userName?: string } | null>(null);
```

替换为:

```tsx
const [exemptModal, setExemptModal] = useState<{
    cardNo: string; userName?: string; aroUserId?: string;
} | null>(null);
```

新增 state 用于房间列表:

```tsx
const [exemptRoomOptions, setExemptRoomOptions] = useState<
    { roomId: string; roomName: string; selected: boolean }[]
>([]);
const [exemptMode, setExemptMode] = useState<string>("TIME");
const [exemptMaxCount, setExemptMaxCount] = useState<number>(5);
const [exemptRoomsLoading, setExemptRoomsLoading] = useState(false);
```

- [ ] **Step 3: 更新 toggleExemptMutation**

将 L614-636 的 `toggleExemptMutation` 中的调用更新:

```tsx
// 在 mutate 调用处更新参数:
toggleExemptMutation.mutate({
    cardNo: exemptModal.cardNo,
    flag: 1,
    durationMinutes: preset.durationMinutes,
    mode: exemptMode,
    maxCount: exemptMode !== 'TIME' ? exemptMaxCount : undefined,
    roomIds: JSON.stringify(
        exemptRoomOptions.filter(r => r.selected).map(r => r.roomId)
    ),
});
```

同时更新 mutation 定义中的 `onSuccess` 状态 patch:

```tsx
const patch: Record<string, unknown> = {
    freezeExemptFlag: updated.freezeExemptFlag,
    freezeExemptExpireAt: updated.freezeExemptExpireAt ?? null,
    freezeExemptMode: updated.freezeExemptMode ?? null,
    freezeExemptMaxCount: updated.freezeExemptMaxCount ?? null,
    freezeExemptUsedCount: 0,
    freezeExemptRoomIds: updated.freezeExemptRoomIds ?? null,
};
```

- [ ] **Step 4: 加载房间列表函数**

添加加载房间权限的函数:

```tsx
const loadExemptRoomOptions = async (aroUserId: string) => {
    setExemptRoomsLoading(true);
    try {
        const res = await authHttp.get(`/v1/twin/mappings/dahua-issue/access-prefill`, {
            params: { aroUserId },
        });
        const data = res.data?.data;
        const rooms = (data?.officialRooms || []).map((r: Record<string, unknown>) => ({
            roomId: String(r.id || r.roomId || ''),
            roomName: String(r.name || r.roomName || r.title || ''),
            selected: true,
        })).filter((r: { roomId: string }) => r.roomId);
        setExemptRoomOptions(rooms);
    } catch {
        setExemptRoomOptions([]);
    } finally {
        setExemptRoomsLoading(false);
    }
};
```

- [ ] **Step 5: 改造豁免弹窗 JSX**

将 L990-1035 的整个豁免弹窗 JSX 替换为带模式选择、次数输入、房间勾选的新版本。改造后结构:

```tsx
{exemptModal && <Portal><div
    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    onClick={() => setExemptModal(null)}
    role="presentation"
>
    <div
        className="bg-[var(--app-color-surface-container)] rounded-2xl shadow-xl border border-[var(--app-color-border-default)] w-full max-w-md p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true"
    >
        <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-black text-[var(--app-color-text-primary)]">设置豁免</h3>
            <button type="button" onClick={() => setExemptModal(null)} className="p-1 rounded-full hover:bg-[var(--app-color-surface-hover)]" aria-label="关闭">
                <X className="w-5 h-5 text-[var(--app-color-text-tertiary)]" />
            </button>
        </div>
        <p className="text-sm text-[var(--app-color-text-secondary)] mb-4">
            卡号 <span className="font-mono font-bold text-indigo-600">{exemptModal.cardNo}</span>
            {exemptModal.userName ? ` · ${exemptModal.userName}` : ""}
        </p>
        
        {/* 模式选择 */}
        <div className="mb-4">
            <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2 block">豁免模式</label>
            <div className="flex gap-2">
                {EXEMPT_MODE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                            exemptMode === opt.value
                                ? 'bg-amber-100 border-amber-400 text-amber-800'
                                : 'bg-[var(--app-color-surface-page)] border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'
                        }`}
                        onClick={() => setExemptMode(opt.value)}
                    >{opt.label}</button>
                ))}
            </div>
        </div>
        
        {/* 时长选择（TIME/BOTH） */}
        {(exemptMode === 'TIME' || exemptMode === 'BOTH') && (
            <div className="mb-4">
                <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2 block">豁免时长</label>
                <div className="flex flex-col gap-1.5">
                    {EXEMPT_DURATION_PRESETS.map(preset => (
                        <button key={preset.durationMinutes} type="button"
                            disabled={toggleExemptMutation.isPending}
                            className="w-full px-4 py-2 rounded-lg text-sm font-bold text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-page)] border border-[var(--app-color-border-default)] hover:bg-amber-50 hover:border-amber-300 disabled:opacity-50 transition-colors"
                            onClick={() => toggleExemptMutation.mutate({
                                cardNo: exemptModal.cardNo, flag: 1,
                                durationMinutes: preset.durationMinutes,
                                mode: exemptMode,
                                maxCount: exemptMode !== 'TIME' ? exemptMaxCount : undefined,
                                roomIds: JSON.stringify(exemptRoomOptions.filter(r => r.selected).map(r => r.roomId)),
                            })}
                        >{preset.label}</button>
                    ))}
                </div>
            </div>
        )}
        
        {/* 次数输入（COUNT/BOTH） */}
        {(exemptMode === 'COUNT' || exemptMode === 'BOTH') && (
            <div className="mb-4">
                <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2 block">可用次数</label>
                <input type="number" min={1} value={exemptMaxCount}
                    onChange={e => setExemptMaxCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-sm"
                />
            </div>
        )}
        
        {/* 房间权限勾选 */}
        <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-[var(--app-color-text-secondary)]">授权房间（免时段限制）</label>
                <button type="button"
                    className="text-xs text-indigo-600 hover:underline"
                    onClick={() => exemptModal.aroUserId && loadExemptRoomOptions(exemptModal.aroUserId)}
                >{exemptRoomsLoading ? '加载中...' : '刷新房间列表'}</button>
            </div>
            {exemptRoomOptions.length === 0 ? (
                <p className="text-xs text-[var(--app-color-text-tertiary)]">点击"刷新房间列表"获取人员房间权限</p>
            ) : (
                <div className="max-h-40 overflow-y-auto space-y-1">
                    {exemptRoomOptions.map(r => (
                        <label key={r.roomId} className="flex items-center gap-2 py-1 cursor-pointer">
                            <input type="checkbox" checked={r.selected}
                                onChange={() => setExemptRoomOptions(prev =>
                                    prev.map(x => x.roomId === r.roomId ? {...x, selected: !x.selected} : x)
                                )}
                                className="rounded"
                            />
                            <span className="text-xs text-[var(--app-color-text-secondary)]">{r.roomName}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
        
        {/* COUNT/BOTH 模式下的单独提交按钮 */}
        {(exemptMode === 'COUNT' || exemptMode === 'BOTH') && exemptMode !== 'TIME' && (
            <button type="button"
                disabled={toggleExemptMutation.isPending || exemptRoomOptions.filter(r => r.selected).length === 0}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                onClick={() => toggleExemptMutation.mutate({
                    cardNo: exemptModal.cardNo, flag: 1,
                    durationMinutes: exemptMode === 'BOTH' ? EXEMPT_DURATION_PRESETS[0].durationMinutes : undefined,
                    mode: exemptMode,
                    maxCount: exemptMaxCount,
                    roomIds: JSON.stringify(exemptRoomOptions.filter(r => r.selected).map(r => r.roomId)),
                })}
            >确认设置</button>
        )}
    </div>
</div></Portal>}
```

- [ ] **Step 6: 更新豁免按钮点击 — 传递 aroUserId**

在"受控"按钮的 `onClick` (L823) 中，将 `setExemptModal` 调用更新为传入 `aroUserId`:

```tsx
setExemptModal({ cardNo: row.cardNo, userName: row.userName, aroUserId: row.aroUserId });
// 同时加载房间列表
if (row.aroUserId) loadExemptRoomOptions(row.aroUserId);
```

- [ ] **Step 7: 更新豁免状态展示**

将 L840-847 的豁免剩余时间展示更新为使用 `formatExemptStatus`:

```tsx
{isExempt && exemptStatusText ? (
    <div className="mt-1 text-[10px] text-amber-600 font-mono">{exemptStatusText}</div>
) : null}
```

其中 `exemptStatusText` 通过 `formatExemptStatus(row)` 计算。

- [ ] **Step 8: 前端编译验证**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: No new errors.

---

### Task 9: 小程序 — 房间页新增 dahua-issue 入口

**Files:**
- Modify: `aroapp/miniprogram/pages/room/index.wxml`
- Modify: `aroapp/miniprogram/pages/room/index.js`

- [ ] **Step 1: 在 index.wxml 中添加按钮**

在 L33 `<view wx:if="{{ showAuditEntry }}" class="sidebar-footer" bindtap="onAuditTap">` 之前添加:

```xml
<view wx:if="{{ showAuditEntry }}" class="sidebar-footer sidebar-footer-issue" bindtap="onDahuaIssueTap">
  <text class="sidebar-footer-text">大华发卡</text>
</view>
```

- [ ] **Step 2: 在 index.js 中添加跳转方法**

在 `onAuditTap()` 方法附近添加:

```js
onDahuaIssueTap() {
  wx.navigateTo({ url: '/package-feature/pages/dahuaIssue/index' });
},
```

同时确保 `onAuditTap` 的导航路径正确（作为参考）:

```js
onAuditTap() {
  wx.navigateTo({ url: '/package-feature/pages/roomAudit/index' });
},
```

- [ ] **Step 3: 验证 — 检查 app.json 中 dahuaIssue 页面注册**

确认 `aroapp/miniprogram/app.json` L46 已有 `"pages/dahuaIssue/index"` 注册。

---

### Task 10: 小程序 — dahuaIssue 页面豁免功能同步

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/dahuaIssue/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/dahuaIssue/index.wxml`
- Modify: `aroapp/miniprogram/package-feature/utils/exemptDurationPresets.js`
- Modify: `aroapp/miniprogram/package-feature/utils/dahuaIssueApi.js`

- [ ] **Step 1: 扩展 exemptDurationPresets.js**

在 `exemptDurationPresets.js` 中添加:

```js
const EXEMPT_MODE_OPTIONS = [
  { label: '时长限制', value: 'TIME' },
  { label: '次数限制', value: 'COUNT' },
  { label: '时长+次数', value: 'BOTH' },
];

function formatExemptStatus(row) {
  if (!row || Number(row.freezeExemptFlag) !== 1) return '';
  const mode = row.freezeExemptMode || 'TIME';
  const parts = [];
  if (mode === 'TIME' || mode === 'BOTH') {
    const remain = formatExemptRemaining(row.freezeExemptExpireAt);
    if (remain) parts.push(remain);
  }
  if (mode === 'COUNT' || mode === 'BOTH') {
    const used = Number(row.freezeExemptUsedCount || 0);
    const max = Number(row.freezeExemptMaxCount || 0);
    parts.push(`剩余${max - used}/${max}次`);
  }
  return parts.join(' · ');
}

// 更新 exports
module.exports = {
  EXEMPT_DURATION_PRESETS,
  EXEMPT_MODE_OPTIONS,
  formatExemptRemaining,
  formatExemptStatus,
  isExemptActive,
  pickExemptDuration,
};
```

- [ ] **Step 2: 扩展 dahuaIssueApi.js updateExempt 方法**

在 `dahuaIssueApi.js` 中修改 `updateExempt`:

```js
async function updateExempt(cardNo, flag, durationMinutes, mode, maxCount, roomIds) {
  const body = { cardNo, flag };
  if (flag === 1) {
    if (mode) body.mode = mode;
    if (durationMinutes != null) body.durationMinutes = durationMinutes;
    if (maxCount != null) body.maxCount = maxCount;
    if (roomIds) body.roomIds = roomIds;
  }
  return await springAuth.springRequest({
    url: '/api/v1/twin/mappings/exempt',
    method: 'POST',
    data: body,
  }).then(unwrapData);
}
```

- [ ] **Step 3: 改造 dahuaIssue/index.js 中的 onToggleExempt**

将 L280-321 的 `onToggleExempt` 替换为带弹窗选择的新逻辑:

```js
async onToggleExempt(e) {
  if (!this.data.canGrantExempt) {
    wx.showToast({ title: '需要管理员权限', icon: 'none' });
    return;
  }
  const row = e.currentTarget.dataset.row;
  if (!row || !row.cardNo) return;
  const isActive = exemptUtil.isExemptActive(row);
  
  if (isActive) {
    // 取消豁免（不变）
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '取消豁免',
        content: `卡号 ${row.cardNo}`,
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!ok) return;
    try {
      const updated = await api.updateExempt(row.cardNo, 0);
      wx.showToast({ title: '已取消豁免', icon: 'none' });
      this.patchRowByCardNo(row.cardNo, {
        freezeExemptFlag: 0, freezeExemptExpireAt: null,
        freezeExemptMode: null, freezeExemptMaxCount: null,
        freezeExemptUsedCount: 0, freezeExemptRoomIds: null,
        ...(updated || {}),
      });
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
    }
    return;
  }
  
  // 新逻辑：选择模式
  const modeIdx = await new Promise((resolve) => {
    wx.showActionSheet({
      itemList: exemptUtil.EXEMPT_MODE_OPTIONS.map(p => p.label),
      success: (res) => resolve(res.tapIndex),
      fail: () => resolve(null),
    });
  });
  if (modeIdx == null) return;
  const mode = exemptUtil.EXEMPT_MODE_OPTIONS[modeIdx].value;
  
  let durationMinutes = null;
  let maxCount = null;
  
  if (mode === 'TIME' || mode === 'BOTH') {
    durationMinutes = await exemptUtil.pickExemptDuration();
    if (durationMinutes == null) return;
  }
  
  // 加载房间列表
  let roomIds = null;
  try {
    const prefill = await api.fetchIssueAccessPrefill(row.aroUserId);
    const rooms = (prefill && prefill.officialRooms) || [];
    if (rooms.length > 0) {
      roomIds = JSON.stringify(rooms.map(r => String(r.id || r.roomId || '')));
    }
  } catch (e) {
    // 忽略，房间列表可选
  }
  
  try {
    const updated = await api.updateExempt(row.cardNo, 1, durationMinutes, mode, maxCount, roomIds);
    wx.showToast({ title: '已设豁免', icon: 'none' });
    this.patchRowByCardNo(row.cardNo, {
      freezeExemptFlag: 1,
      freezeExemptExpireAt: updated && updated.freezeExemptExpireAt ? updated.freezeExemptExpireAt : null,
      freezeExemptMode: mode,
      freezeExemptMaxCount: maxCount,
      freezeExemptUsedCount: 0,
      freezeExemptRoomIds: roomIds,
      ...(updated || {}),
    });
  } catch (err) {
    wx.showToast({ title: err.message || '更新失败', icon: 'none' });
  }
},
```

- [ ] **Step 4: 更新 wxml 中的豁免状态显示**

在 `dahuaIssue/index.wxml` L41-45 区域，将豁免显示更新为使用 `formatExemptStatus`（需要在 js 的 `decorateMappingRow` 中预计算）。

在 `decorateMappingRow` 函数中添加:

```js
const exemptStatusText = exemptUtil.formatExemptStatus(row);
return {
  ...(row || {}),
  // ... 现有字段
  exemptStatusText,
};
```

wxml 中对应更新显示:

```xml
<text wx:if="{{ item.exemptStatusText }}" class="exempt-status-text">{{ item.exemptStatusText }}</text>
```

- [ ] **Step 5: 在 dahuaIssueApi.js 中添加 fetchIssueAccessPrefill 方法**

```js
async function fetchIssueAccessPrefill(aroUserId) {
  const res = await springAuth.springRequest({
    url: '/api/v1/twin/mappings/dahua-issue/access-prefill',
    method: 'GET',
    data: { aroUserId },
  });
  return unwrapData(res);
}
```

同时更新 module.exports 导出该方法。

---

### Task 11: 小程序 — roomAudit 页面豁免功能同步

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/roomAudit/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/roomAudit/index.wxml`

- [ ] **Step 1: 更新 roomAudit/index.js onToggleExempt**

参考 Task 10 Step 3 的逻辑，同样改造 `roomAudit/index.js` 中的 `onToggleExempt` 方法。保持与 dahuaIssue 一致的模式选择 + 房间加载流程。

- [ ] **Step 2: 更新 roomAudit/index.wxml 豁免状态显示**

在 L73 的卡状态行更新为同时显示模式和次数:

```xml
<text class="k">卡状态</text>
<text class="v">{{ item.cardStatus }} · 免冻结 {{ item.freezeExemptFlag === 1 ? '开' : '关' }}
  <text wx:if="{{ item.exemptStatusText }}" class="exempt-detail"> · {{ item.exemptStatusText }}</text>
</text>
```

---

### Task 12: 最终编译验证

- [ ] **Step 1: 后端完整编译**

```bash
cd d:/codex/verson.1.2/20260416 && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 2: 前端 TypeScript 检查**

```bash
cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: No new type errors.

- [ ] **Step 3: Git diff 检查**

```bash
cd d:/codex/verson.1.2/20260416 && git diff --stat
```

确认所有改动的文件都在预期范围内。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(freeze-exempt): 免冻结功能增强 — 取消规则跳过、房间级时段豁免、次数限制模式、小程序入口"
```

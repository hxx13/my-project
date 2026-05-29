# 学生活跃度统计报表 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在统计与审计报表目录新增学生活跃度统计，按课题组筛选成员，以进出流水成对数据展示活跃度排名与时段图表。

**Architecture:** 嵌入现有 analytics 框架（方案 A）。后端在 `AnalyticsReportRegistry` 注册 `student_activity`，新建 `StudentActivityController` + `StudentActivityService`，在 `TwinDashboardMapper.xml` 新增 SQL。前端新建 `StudentActivityReportPanel` 组件树，使用 recharts 绑定图表，在 `AdminAnalyticsPage` 挂载。进出配对逻辑在 Java Service 层完成。

**Tech Stack:** Spring Boot + MyBatis + React + TypeScript + React Query + recharts

---

### Task 1: 后端 — 报表注册

**Files:**
- Modify: `src/main/java/com/example/demo/modules/analytics/service/AnalyticsReportRegistry.java`

- [ ] **Step 1: 注册 student_activity 报表**

在 `listReports()` 方法中新增：

```java
public static final String REPORT_STUDENT_ACTIVITY = "student_activity";

public List<AnalyticsReportDescriptorDto> listReports() {
    return List.of(
            new AnalyticsReportDescriptorDto(
                    REPORT_ISOLATION_USAGE,
                    "隔离服使用统计",
                    "支持校区/分区/楼层筛选。",
                    "门禁与房间",
                    true
            ),
            new AnalyticsReportDescriptorDto(
                    REPORT_CAGE_OCCUPANCY,
                    "笼架占用统计",
                    "统计已预约且已放置笼盒的笼位数（实时 ARO 快照），筛选方式与隔离服统计一致。",
                    "笼架与预约",
                    true
            ),
            new AnalyticsReportDescriptorDto(
                    REPORT_STUDENT_ACTIVITY,
                    "学生活跃度统计",
                    "按课题组筛选成员，查看进出次数、在馆时长、时段热力等活跃度指标。",
                    "人员与活跃度",
                    true
            )
    );
}
```

- [ ] **Step 2: 编译验证**

Run: `cd d:/codex/verson.1.2/20260416 && ./mvnw compile -q -pl .`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/analytics/service/AnalyticsReportRegistry.java
git commit -m "feat: register student_activity report in analytics registry"
```

---

### Task 2: 后端 — Mapper 接口新增方法

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/common/mapper/TwinDashboardMapper.java`

- [ ] **Step 1: 新增 Mapper 方法声明**

在接口末尾添加：

```java
/** 按课题组模糊搜索人员 userId 列表（project_group_name 列拆分匹配由 Service 兜底过滤） */
List<String> listUserIdsByProjectGroup(
        @Param("groupName") String groupName,
        @Param("limit") int limit);

/** 按 userId 列表 + 时间范围拉取进出流水（供 Java 层配对） */
List<Map<String, Object>> listAccessLogsByUserIds(
        @Param("userIds") List<String> userIds,
        @Param("startTime") String startTime,
        @Param("endTime") String endTime);

/** 统计课题组总数（去重拆分后） */
int countDistinctProjectGroups(@Param("keyword") String keyword);
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/common/mapper/TwinDashboardMapper.java
git commit -m "feat: add mapper methods for student activity queries"
```

---

### Task 3: 后端 — Mapper XML 新增 SQL

**Files:**
- Modify: `src/main/resources/mapper/TwinDashboardMapper.xml`

- [ ] **Step 1: 新增 SQL 查询**

在 XML 末尾 `</mapper>` 之前添加：

```xml
<select id="listUserIdsByProjectGroup" resultType="string">
    SELECT user_id
    FROM aro_personnel
    WHERE project_group_name LIKE CONCAT('%', #{groupName}, '%')
       OR project_groups LIKE CONCAT('%', #{groupName}, '%')
    LIMIT #{limit}
</select>

<select id="listAccessLogsByUserIds" resultType="map">
    SELECT log.id,
           log.user_id,
           log.accessType,
           log.create_time,
           log.name,
           log.project_group_names,
           log.area_name,
           log.room_name
    FROM aro_access_log log
    WHERE log.user_id IN
    <foreach collection="userIds" item="uid" open="(" close=")" separator=",">
        #{uid}
    </foreach>
    <if test="startTime != null and startTime != ''">
        AND log.create_time &gt;= #{startTime}
    </if>
    <if test="endTime != null and endTime != ''">
        AND log.create_time &lt;= #{endTime}
    </if>
    ORDER BY log.user_id, log.create_time ASC
</select>

<select id="countDistinctProjectGroups" resultType="int">
    SELECT COUNT(DISTINCT TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(project_group_name, ',', n.n), ',', -1)))
    FROM aro_personnel
    JOIN (
        SELECT 1 AS n UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
        UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
    ) n ON CHAR_LENGTH(project_group_name) - CHAR_LENGTH(REPLACE(project_group_name, ',', '')) >= n.n - 1
    WHERE project_group_name IS NOT NULL AND TRIM(project_group_name) != ''
    <if test="keyword != null and keyword != ''">
        AND project_group_name LIKE CONCAT('%', #{keyword}, '%')
    </if>
</select>
```

- [ ] **Step 2: Commit**

```bash
git add src/main/resources/mapper/TwinDashboardMapper.xml
git commit -m "feat: add SQL queries for student activity data"
```

---

### Task 4: 后端 — StudentActivityService

**Files:**
- Create: `src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java`

- [ ] **Step 1: 创建 Service 类**

```java
package com.example.demo.modules.analytics.service;

import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class StudentActivityService {

    private static final Logger log = LoggerFactory.getLogger(StudentActivityService.class);
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_USER_IDS = 2000;
    private static final int MAX_GROUP_SUGGESTIONS = 20;

    private final TwinDashboardMapper dashboardMapper;

    public StudentActivityService(TwinDashboardMapper dashboardMapper) {
        this.dashboardMapper = dashboardMapper;
    }

    /** 课题组搜索建议 */
    public List<Map<String, Object>> listGroups(String keyword) {
        List<String> rawFields = dashboardMapper.searchPersonnelProjectGroupFields(
                keyword != null ? keyword.trim() : "", MAX_GROUP_SUGGESTIONS * 2);
        List<String> groups = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(
                rawFields, keyword, MAX_GROUP_SUGGESTIONS);
        return groups.stream().map(g -> {
            Map<String, Object> m = new HashMap<>();
            m.put("name", g);
            return m;
        }).collect(Collectors.toList());
    }

    /** 成员活跃度查询 */
    public Map<String, Object> queryMemberActivity(
            String groupName, String startTime, String endTime,
            String sortBy, String order, int page, int size) {

        // 1. 拉取该课题组所有 userId
        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("summary", summaryMap(0, 0, 0, 0, 0));
            empty.put("members", List.of());
            empty.put("total", 0);
            return empty;
        }

        // 2. 拉取这些人在时间范围内的全部进出流水（按 userId + 时间升序）
        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(
                userIds, startTime, endTime);

        // 3. 按 userId 分组
        Map<String, List<Map<String, Object>>> logsByUser = new LinkedHashMap<>();
        for (Map<String, Object> log : rawLogs) {
            String uid = String.valueOf(log.getOrDefault("user_id", ""));
            logsByUser.computeIfAbsent(uid, k -> new ArrayList<>()).add(log);
        }

        // 4. 每人配对 + 聚合指标
        List<MemberActivityRow> rows = new ArrayList<>();
        for (String uid : userIds) {
            List<Map<String, Object>> userLogs = logsByUser.getOrDefault(uid, List.of());
            MemberActivityRow row = computeMemberRow(uid, userLogs, rawLogs, userIds);
            if (row != null) rows.add(row);
        }

        // 5. 排序
        Comparator<MemberActivityRow> cmp = switch (sortBy != null ? sortBy : "entries") {
            case "duration" -> Comparator.comparingLong(MemberActivityRow::getTotalDurationMinutes);
            case "dailyAvg" -> Comparator.comparingDouble(MemberActivityRow::getDailyAvgFreq);
            case "lastActive" -> Comparator.comparing(r -> r.getLastActiveDate() != null ? r.getLastActiveDate() : "0000");
            default -> Comparator.comparingInt(MemberActivityRow::getEntryCount);
        };
        if ("asc".equals(order)) cmp = cmp.reversed();
        rows.sort(cmp.reversed()); // 默认降序

        // 6. 汇总
        int total = rows.size();
        int totalEntries = rows.stream().mapToInt(MemberActivityRow::getEntryCount).sum();
        long totalDuration = rows.stream().mapToLong(MemberActivityRow::getTotalDurationMinutes).sum();
        double avgDaily = rows.stream().mapToDouble(MemberActivityRow::getDailyAvgFreq).average().orElse(0);
        long recent7d = rows.stream().filter(r -> r.getDaysSinceLastActive() <= 7).count();
        int activeRate = total > 0 ? (int) Math.round(100.0 * recent7d / total) : 0;

        // 7. 分页
        int offset = (page - 1) * size;
        List<MemberActivityRow> paged = rows.stream().skip(offset).limit(size).toList();

        Map<String, Object> result = new HashMap<>();
        result.put("summary", summaryMap(total, totalEntries, totalDuration, avgDaily, activeRate));
        result.put("members", paged.stream().map(this::rowToMap).toList());
        result.put("total", total);
        return result;
    }

    /** 进出配对 + 指标计算 */
    private MemberActivityRow computeMemberRow(
            String userId, List<Map<String, Object>> userLogs,
            List<Map<String, Object>> allLogs, List<String> allUserIds) {

        // 分离 entry(1) 和 exit(2)
        List<LocalDateTime> entries = new ArrayList<>();
        List<LocalDateTime> exits = new ArrayList<>();
        String userName = userId;

        for (Map<String, Object> log : userLogs) {
            Object at = log.get("accessType");
            int accessType = at instanceof Number ? ((Number) at).intValue() : Integer.parseInt(String.valueOf(at));
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            if (accessType == 1) entries.add(dt);
            else if (accessType == 2) exits.add(dt);
            String n = String.valueOf(log.getOrDefault("name", ""));
            if (!n.isEmpty() && !"null".equals(n)) userName = n;
        }

        // 配对：每条 entry 找其后最近的 exit（24h内，中间无其他 exit）
        int pairCount = 0;
        long totalDurationMinutes = 0;
        Set<String> activeDates = new HashSet<>();
        LocalDateTime lastEntry = null;

        int exitIdx = 0;
        for (LocalDateTime entry : entries) {
            // 在 exits 中二分/线性找第一个 > entry 的 exit
            while (exitIdx < exits.size() && !exits.get(exitIdx).isAfter(entry)) {
                exitIdx++;
            }
            if (exitIdx < exits.size()) {
                LocalDateTime exit = exits.get(exitIdx);
                long diffMin = ChronoUnit.MINUTES.between(entry, exit);
                if (diffMin >= 0 && diffMin <= 24 * 60) {
                    pairCount++;
                    totalDurationMinutes += diffMin;
                    activeDates.add(entry.toLocalDate().toString());
                    lastEntry = entry;
                    exitIdx++; // 该 exit 已被消费
                }
            }
        }

        if (pairCount == 0 && activeDates.isEmpty()) return null;

        int activeDays = activeDates.size();
        double dailyAvgFreq = activeDays > 0 ? (double) pairCount / activeDays : 0;
        String lastActiveDate = lastEntry != null ? lastEntry.toLocalDate().toString() : null;
        long daysSinceLastActive = lastActiveDate != null
                ? ChronoUnit.DAYS.between(LocalDateTime.now().toLocalDate(), lastEntry.toLocalDate())
                : 999;

        MemberActivityRow row = new MemberActivityRow();
        row.setUserId(userId);
        row.setUserName(userName);
        row.setEntryCount(pairCount);
        row.setTotalDurationMinutes(totalDurationMinutes);
        row.setDailyAvgFreq(Math.round(dailyAvgFreq * 10.0) / 10.0);
        row.setLastActiveDate(lastActiveDate);
        row.setDaysSinceLastActive(daysSinceLastActive);
        return row;
    }

    /** 时段热力图 */
    public List<Map<String, Object>> heatmap(String groupName, String startTime, String endTime) {
        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) return List.of();

        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

        // dayOfWeek(1=Mon..7=Sun) × hour(0-23) → count
        Map<String, Integer> grid = new LinkedHashMap<>();
        for (Map<String, Object> log : rawLogs) {
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            String key = dt.getDayOfWeek().getValue() + ":" + dt.getHour();
            grid.merge(key, 1, Integer::sum);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (int dow = 1; dow <= 7; dow++) {
            for (int h = 0; h < 24; h++) {
                int count = grid.getOrDefault(dow + ":" + h, 0);
                if (count > 0) {
                    Map<String, Object> cell = new HashMap<>();
                    cell.put("dayOfWeek", dow);
                    cell.put("hour", h);
                    cell.put("count", count);
                    result.add(cell);
                }
            }
        }
        return result;
    }

    /** 日趋势 */
    public List<Map<String, Object>> dailyTrend(String groupName, String startTime, String endTime) {
        List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
        if (userIds.isEmpty()) return List.of();

        List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

        Map<String, int[]> daily = new LinkedHashMap<>();
        for (Map<String, Object> log : rawLogs) {
            String ts = String.valueOf(log.getOrDefault("create_time", ""));
            LocalDateTime dt = parseTime(ts);
            if (dt == null) continue;
            String date = dt.toLocalDate().toString();
            int[] counts = daily.computeIfAbsent(date, k -> new int[2]);
            Object at = log.get("accessType");
            int accessType = at instanceof Number ? ((Number) at).intValue() : Integer.parseInt(String.valueOf(at));
            if (accessType == 1) counts[0]++;
            else if (accessType == 2) counts[1]++;
        }

        return daily.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("date", e.getKey());
                    m.put("entryCount", e.getValue()[0]);
                    m.put("exitCount", e.getValue()[1]);
                    return m;
                }).collect(Collectors.toList());
    }

    private LocalDateTime parseTime(String ts) {
        if (ts == null || ts.isEmpty()) return null;
        try {
            ts = ts.replace("T", " ");
            if (ts.length() >= 19) ts = ts.substring(0, 19);
            return LocalDateTime.parse(ts, FMT);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Object> summaryMap(int total, int entries, long duration, double avgDaily, int activeRate) {
        Map<String, Object> m = new HashMap<>();
        m.put("memberCount", total);
        m.put("totalEntries", entries);
        m.put("totalDurationMinutes", duration);
        m.put("avgDailyFreq", Math.round(avgDaily * 10.0) / 10.0);
        m.put("activeRate", activeRate);
        return m;
    }

    private Map<String, Object> rowToMap(MemberActivityRow row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", row.getUserId());
        m.put("userName", row.getUserName());
        m.put("entryCount", row.getEntryCount());
        m.put("totalDurationMinutes", row.getTotalDurationMinutes());
        m.put("dailyAvgFreq", row.getDailyAvgFreq());
        m.put("lastActiveDate", row.getLastActiveDate());
        m.put("daysSinceLastActive", row.getDaysSinceLastActive());
        return m;
    }

    // ---- inner class ----

    @SuppressWarnings("unused")
    public static class MemberActivityRow {
        private String userId;
        private String userName;
        private int entryCount;
        private long totalDurationMinutes;
        private double dailyAvgFreq;
        private String lastActiveDate;
        private long daysSinceLastActive;

        public String getUserId() { return userId; }
        public void setUserId(String v) { this.userId = v; }
        public String getUserName() { return userName; }
        public void setUserName(String v) { this.userName = v; }
        public int getEntryCount() { return entryCount; }
        public void setEntryCount(int v) { this.entryCount = v; }
        public long getTotalDurationMinutes() { return totalDurationMinutes; }
        public void setTotalDurationMinutes(long v) { this.totalDurationMinutes = v; }
        public double getDailyAvgFreq() { return dailyAvgFreq; }
        public void setDailyAvgFreq(double v) { this.dailyAvgFreq = v; }
        public String getLastActiveDate() { return lastActiveDate; }
        public void setLastActiveDate(String v) { this.lastActiveDate = v; }
        public long getDaysSinceLastActive() { return daysSinceLastActive; }
        public void setDaysSinceLastActive(long v) { this.daysSinceLastActive = v; }
    }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd d:/codex/verson.1.2/20260416 && ./mvnw compile -q -pl .`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java
git commit -m "feat: add StudentActivityService with pairing logic"
```

---

### Task 5: 后端 — StudentActivityController

**Files:**
- Create: `src/main/java/com/example/demo/modules/analytics/controller/StudentActivityController.java`

- [ ] **Step 1: 创建 Controller**

```java
package com.example.demo.modules.analytics.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.analytics.service.StudentActivityService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/analytics/student-activity")
@Tag(name = "学生活跃度统计", description = "课题组维度成员活跃度报表")
public class StudentActivityController {

    private final AuthContextService authContextService;
    private final StudentActivityService studentActivityService;

    public StudentActivityController(AuthContextService authContextService,
                                     StudentActivityService studentActivityService) {
        this.authContextService = authContextService;
        this.studentActivityService = studentActivityService;
    }

    @GetMapping("/groups")
    @Operation(summary = "课题组搜索建议")
    public Result<Map<String, Object>> listGroups(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String keyword) {
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
        List<Map<String, Object>> groups = studentActivityService.listGroups(keyword);
        Map<String, Object> data = new HashMap<>();
        data.put("groups", groups);
        return Result.success(data);
    }

    @GetMapping("/members")
    @Operation(summary = "成员活跃度分页查询")
    public Result<Map<String, Object>> members(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime,
            @RequestParam(defaultValue = "entries") String sortBy,
            @RequestParam(defaultValue = "desc") String order,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
        Map<String, Object> data = studentActivityService.queryMemberActivity(
                groupName, startTime, endTime, sortBy, order, page, size);
        return Result.success(data);
    }

    @GetMapping("/heatmap")
    @Operation(summary = "时段热力图数据")
    public Result<List<Map<String, Object>>> heatmap(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
        return Result.success(studentActivityService.heatmap(groupName, startTime, endTime));
    }

    @GetMapping("/daily-trend")
    @Operation(summary = "日趋势数据")
    public Result<List<Map<String, Object>>> dailyTrend(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String groupName,
            @RequestParam String startTime,
            @RequestParam String endTime) {
        if (authContextService.resolveUserFromBearer(auth) == null) return Result.error("未登录");
        return Result.success(studentActivityService.dailyTrend(groupName, startTime, endTime));
    }
}
```

- [ ] **Step 2: 编译验证**

Run: `cd d:/codex/verson.1.2/20260416 && ./mvnw compile -q -pl .`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/analytics/controller/StudentActivityController.java
git commit -m "feat: add StudentActivityController with 4 endpoints"
```

---

### Task 6: 前端 — API 类型与函数

**Files:**
- Modify: `frontend/src/api/domains/analytics.api.ts`

- [ ] **Step 1: 新增类型定义**

在文件中 `export type AnalyticsViewShareImportResult = {` 行之前添加：

```typescript
// ---- 学生活跃度统计 ----

export type StudentActivityGroup = {
  name: string;
};

export type StudentActivitySummary = {
  memberCount: number;
  totalEntries: number;
  totalDurationMinutes: number;
  avgDailyFreq: number;
  activeRate: number;
};

export type StudentActivityMember = {
  userId: string;
  userName: string;
  entryCount: number;
  totalDurationMinutes: number;
  dailyAvgFreq: number;
  lastActiveDate: string | null;
  daysSinceLastActive: number;
};

export type StudentActivityResult = {
  summary: StudentActivitySummary;
  members: StudentActivityMember[];
  total: number;
};

export type HeatmapCell = {
  dayOfWeek: number;
  hour: number;
  count: number;
};

export type DailyTrendPoint = {
  date: string;
  entryCount: number;
  exitCount: number;
};
```

- [ ] **Step 2: 新增 API 函数**

在文件末尾 `export async function revokeAnalyticsViewShare` 之后添加：

```typescript
export async function fetchStudentActivityGroups(keyword?: string): Promise<StudentActivityGroup[]> {
  const data = await unwrap(
    authHttp.get<Result<{ groups: StudentActivityGroup[] }>>("/v1/analytics/student-activity/groups", {
      params: keyword ? { keyword } : {},
    })
  );
  return data.groups ?? [];
}

export async function fetchStudentActivityMembers(params: {
  groupName: string;
  startTime: string;
  endTime: string;
  sortBy?: string;
  order?: string;
  page?: number;
  size?: number;
}): Promise<StudentActivityResult> {
  return unwrap(
    authHttp.get<Result<StudentActivityResult>>("/v1/analytics/student-activity/members", { params })
  );
}

export async function fetchStudentActivityHeatmap(params: {
  groupName: string;
  startTime: string;
  endTime: string;
}): Promise<HeatmapCell[]> {
  return unwrap(
    authHttp.get<Result<HeatmapCell[]>>("/v1/analytics/student-activity/heatmap", { params })
  );
}

export async function fetchStudentActivityDailyTrend(params: {
  groupName: string;
  startTime: string;
  endTime: string;
}): Promise<DailyTrendPoint[]> {
  return unwrap(
    authHttp.get<Result<DailyTrendPoint[]>>("/v1/analytics/student-activity/daily-trend", { params })
  );
}
```

- [ ] **Step 3: TypeScript 编译验证**

Run: `cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors (may have pre-existing ones unrelated to our changes)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/domains/analytics.api.ts
git commit -m "feat: add student activity API types and functions"
```

---

### Task 7: 前端 — ActivityFilterBar 组件

**Files:**
- Create: `frontend/src/features/analytics/components/ActivityFilterBar.tsx`

- [ ] **Step 1: 创建筛选栏组件**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStudentActivityGroups, type StudentActivityGroup } from "@/api/domains/analytics.api";
import { cn } from "@/lib/utils";

type TimePreset = "today" | "week" | "month" | "custom";

function presetToRange(preset: TimePreset): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10) + " 23:59:59";
  let start = now.toISOString().slice(0, 10) + " 00:00:00";

  if (preset === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    start = d.toISOString().slice(0, 10) + " 00:00:00";
  } else if (preset === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    start = d.toISOString().slice(0, 10) + " 00:00:00";
  }
  return { start, end };
}

type Props = {
  groupName: string;
  onGroupChange: (name: string) => void;
  startTime: string;
  endTime: string;
  onTimeChange: (start: string, end: string) => void;
  disabled?: boolean;
};

const PRESETS: { key: TimePreset; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
];

export function ActivityFilterBar({ groupName, onGroupChange, startTime, endTime, onTimeChange, disabled }: Props) {
  const [keyword, setKeyword] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [preset, setPreset] = useState<TimePreset>("month");
  const [customStart, setCustomStart] = useState(startTime.slice(0, 10));
  const [customEnd, setCustomEnd] = useState(endTime.slice(0, 10));

  const { data: groups = [] } = useQuery({
    queryKey: ["studentActivityGroups", keyword],
    queryFn: () => fetchStudentActivityGroups(keyword || undefined),
    enabled: showDropdown,
    staleTime: 60_000,
  });

  const applyPreset = useCallback((p: TimePreset) => {
    setPreset(p);
    if (p !== "custom") {
      const { start, end } = presetToRange(p);
      onTimeChange(start, end);
    }
  }, [onTimeChange]);

  const applyCustom = useCallback(() => {
    if (customStart && customEnd) {
      onTimeChange(customStart + " 00:00:00", customEnd + " 23:59:59");
    }
  }, [customStart, customEnd, onTimeChange]);

  useEffect(() => {
    if (preset !== "custom") {
      const { start, end } = presetToRange(preset);
      if (start !== startTime || end !== endTime) {
        applyPreset(preset);
      }
    }
  }, []); // initial load only

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-violet-200/60 bg-gradient-to-r from-violet-50/40 to-white p-4">
      {/* 课题组搜索 */}
      <div className="relative min-w-[200px]">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">课题组</label>
        <input
          type="text"
          value={groupName || keyword}
          onChange={(e) => {
            const v = e.target.value;
            setKeyword(v);
            setShowDropdown(true);
            if (!v.trim()) onGroupChange("");
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="搜索课题组名称…"
          disabled={disabled}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
        />
        {showDropdown && groups.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
            {groups.map((g) => (
              <li key={g.name}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-violet-50",
                    groupName === g.name && "bg-violet-100 font-semibold text-violet-900"
                  )}
                  onMouseDown={() => {
                    onGroupChange(g.name);
                    setKeyword(g.name);
                    setShowDropdown(false);
                  }}
                >
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 时间预设 */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">时间范围</label>
        <div className="flex items-center gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(p.key)}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-medium transition",
                preset === p.key
                  ? "bg-violet-600 text-white shadow-sm"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:bg-violet-50"
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPreset("custom")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-medium transition",
              preset === "custom"
                ? "bg-violet-600 text-white shadow-sm"
                : "border border-neutral-200 bg-white text-neutral-600 hover:bg-violet-50"
            )}
          >
            自定义
          </button>
        </div>
      </div>

      {/* 自定义日期 */}
      {preset === "custom" ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-neutral-200 px-2 py-2 text-xs"
          />
          <span className="text-xs text-neutral-400">—</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-neutral-200 px-2 py-2 text-xs"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={disabled}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            确定
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/analytics/components/ActivityFilterBar.tsx
git commit -m "feat: add ActivityFilterBar with group search and time presets"
```

---

### Task 8: 前端 — ActivityMemberTable 组件

**Files:**
- Create: `frontend/src/features/analytics/components/ActivityMemberTable.tsx`

- [ ] **Step 1: 创建排名表组件**

```tsx
import { cn } from "@/lib/utils";
import type { StudentActivityMember } from "@/api/domains/analytics.api";

const DURATION_LABELS: Record<string, string> = {
  entries: "进出次数",
  totalDurationMinutes: "总时长",
  dailyAvgFreq: "日均频次",
  lastActiveDate: "最近活跃",
};

type SortKey = "entries" | "totalDurationMinutes" | "dailyAvgFreq" | "lastActiveDate";

type Props = {
  members: StudentActivityMember[];
  sortBy: SortKey;
  order: "desc" | "asc";
  onSort: (key: SortKey) => void;
  loading?: boolean;
  page: number;
  total: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

function formatLastActive(dateStr: string | null, daysSince: number): { text: string; color: string } {
  if (!dateStr) return { text: "无记录", color: "text-neutral-400" };
  if (daysSince === 0) return { text: "今天", color: "text-emerald-600" };
  if (daysSince === 1) return { text: "昨天", color: "text-emerald-600" };
  if (daysSince <= 3) return { text: `${daysSince}天前`, color: "text-amber-600" };
  if (daysSince <= 7) return { text: `${daysSince}天前`, color: "text-orange-600" };
  return { text: `${daysSince}天前`, color: "text-red-500" };
}

export function ActivityMemberTable({
  members, sortBy, order, onSort, loading, page, total, size, onPageChange, onSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / size));

  const SortArrow = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <span className="ml-1 text-neutral-300">↕</span>;
    return <span className="ml-1 text-violet-600">{order === "desc" ? "↓" : "↑"}</span>;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-neutral-50 text-[11px] font-semibold text-neutral-600">
            <tr>
              <th className="px-3 py-3 text-left">#</th>
              <th className="px-3 py-3 text-left">姓名</th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("entries")}>
                进出次数 <SortArrow col="entries" />
              </th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("totalDurationMinutes")}>
                总时长 <SortArrow col="totalDurationMinutes" />
              </th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("dailyAvgFreq")}>
                日均频次 <SortArrow col="dailyAvgFreq" />
              </th>
              <th className="px-3 py-3 text-left cursor-pointer select-none hover:text-violet-700" onClick={() => onSort("lastActiveDate")}>
                最近活跃 <SortArrow col="lastActiveDate" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-400">加载中…</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-400">暂未选择课题组或无数据</td></tr>
            ) : (
              members.map((m, i) => {
                const lastActive = formatLastActive(m.lastActiveDate, m.daysSinceLastActive);
                return (
                  <tr key={m.userId} className={cn("hover:bg-violet-50/50 transition", i % 2 === 0 && "bg-white", i % 2 === 1 && "bg-neutral-50/30")}>
                    <td className="px-3 py-2.5 font-mono text-neutral-400">{(page - 1) * size + i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-neutral-900">{m.userName}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-violet-700">{m.entryCount}</td>
                    <td className="px-3 py-2.5 font-mono text-neutral-700">{formatDuration(m.totalDurationMinutes)}</td>
                    <td className="px-3 py-2.5 font-mono text-neutral-700">{m.dailyAvgFreq}</td>
                    <td className={cn("px-3 py-2.5 font-medium", lastActive.color)}>{lastActive.text}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/50 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          共 {total} 人
          <select
            value={size}
            onChange={(e) => { onSizeChange(Number(e.target.value)); onPageChange(1); }}
            className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs"
          >
            {[10, 20, 30, 50].map((s) => <option key={s} value={s}>{s}/页</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 disabled:opacity-30 hover:bg-neutral-100"
          >
            上一页
          </button>
          <span className="font-medium text-neutral-600">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 disabled:opacity-30 hover:bg-neutral-100"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/analytics/components/ActivityMemberTable.tsx
git commit -m "feat: add ActivityMemberTable with sortable columns and pagination"
```

---

### Task 9: 前端 — ActivityHeatmapChart + ActivityTrendChart

**Files:**
- Create: `frontend/src/features/analytics/components/ActivityHeatmapChart.tsx`
- Create: `frontend/src/features/analytics/components/ActivityTrendChart.tsx`

- [ ] **Step 1: 创建热力图组件**

```tsx
import { useMemo } from "react";
import { Tooltip } from "recharts";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";
import type { HeatmapCell } from "@/api/domains/analytics.api";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type Props = { data: HeatmapCell[]; loading?: boolean };

export function ActivityHeatmapChart({ data, loading }: Props) {
  const maxCount = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);

  if (loading) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">加载中…</div>;
  if (data.length === 0) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">暂无热力数据</div>;

  return (
    <div className="h-[240px] w-full overflow-auto" style={{ scrollbarWidth: "thin" }}>
      <table className="border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-1 py-0.5 text-neutral-400">时\日</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="px-1 py-0.5 font-normal text-neutral-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
            <tr key={dow}>
              <td className="sticky left-0 bg-white px-1 py-0.5 font-medium text-neutral-500">{DAY_LABELS[dow]}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const cell = data.find((c) => c.dayOfWeek === dow && c.hour === h);
                const intensity = cell ? cell.count / maxCount : 0;
                return (
                  <td
                    key={h}
                    className="px-1 py-0.5 text-center"
                    style={{
                      backgroundColor: intensity > 0
                        ? `rgba(124, 58, 237, ${Math.max(0.08, intensity)})`
                        : "transparent",
                    }}
                    title={cell ? `${DAY_LABELS[dow]} ${h}:00 — ${cell.count} 次` : undefined}
                  >
                    {cell ? cell.count : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 创建趋势图组件**

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { MeasuredChartBox } from "@/features/analytics/components/MeasuredChartBox";
import type { DailyTrendPoint } from "@/api/domains/analytics.api";

type Props = { data: DailyTrendPoint[]; loading?: boolean };

export function ActivityTrendChart({ data, loading }: Props) {
  if (loading) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">加载中…</div>;
  if (data.length === 0) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">暂无趋势数据</div>;

  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    entry: d.entryCount,
    exit: d.exitCount,
  }));

  return (
    <MeasuredChartBox height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(chartData.length / 10) - 1)} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
        />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        <Bar dataKey="entry" name="进入" fill="#7c3aed" radius={[2, 2, 0, 0]} />
        <Bar dataKey="exit" name="离开" fill="#f59e0b" radius={[2, 2, 0, 0]} />
      </BarChart>
    </MeasuredChartBox>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/analytics/components/ActivityHeatmapChart.tsx frontend/src/features/analytics/components/ActivityTrendChart.tsx
git commit -m "feat: add heatmap and trend chart components for student activity"
```

---

### Task 10: 前端 — StudentActivityReportPanel 主面板

**Files:**
- Create: `frontend/src/features/analytics/components/StudentActivityReportPanel.tsx`

- [ ] **Step 1: 创建主面板组件**

```tsx
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Users } from "lucide-react";
import {
  fetchStudentActivityMembers,
  fetchStudentActivityHeatmap,
  fetchStudentActivityDailyTrend,
  type StudentActivityMember,
} from "@/api/domains/analytics.api";
import { ActivityFilterBar } from "./ActivityFilterBar";
import { ActivityMemberTable } from "./ActivityMemberTable";
import { ActivityHeatmapChart } from "./ActivityHeatmapChart";
import { ActivityTrendChart } from "./ActivityTrendChart";
import { AdminFormCard } from "@/components/admin/AdminPageShell";

type SortKey = "entries" | "totalDurationMinutes" | "dailyAvgFreq" | "lastActiveDate";

function defaultLastMonth(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10) + " 23:59:59";
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    .toISOString().slice(0, 10) + " 00:00:00";
  return { start, end };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

export function StudentActivityReportPanel() {
  const initialRange = defaultLastMonth();
  const [groupName, setGroupName] = useState("");
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [sortBy, setSortBy] = useState<SortKey>("entries");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);

  const handleSort = useCallback((key: SortKey) => {
    if (sortBy === key) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(key);
      setOrder("desc");
    }
    setPage(1);
  }, [sortBy]);

  const membersQuery = useQuery({
    queryKey: ["studentActivityMembers", groupName, startTime, endTime, sortBy, order, page, size],
    queryFn: () => fetchStudentActivityMembers({ groupName, startTime, endTime, sortBy, order, page, size }),
    enabled: groupName.length > 0,
  });

  const heatmapQuery = useQuery({
    queryKey: ["studentActivityHeatmap", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityHeatmap({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  const trendQuery = useQuery({
    queryKey: ["studentActivityDailyTrend", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityDailyTrend({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  const summary = membersQuery.data?.summary;
  const members = membersQuery.data?.members ?? [];
  const total = membersQuery.data?.total ?? 0;

  const exportCSV = useCallback(() => {
    if (members.length === 0) return;
    const header = "userId,userName,entryCount,totalDurationMinutes,dailyAvgFreq,lastActiveDate";
    const rows = members.map((m) =>
      [m.userId, m.userName, m.entryCount, m.totalDurationMinutes, m.dailyAvgFreq, m.lastActiveDate ?? ""].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `学生活跃度_${groupName}_${startTime.slice(0, 10)}_${endTime.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [members, groupName, startTime, endTime]);

  return (
    <div className="space-y-4">
      <ActivityFilterBar
        groupName={groupName}
        onGroupChange={(name) => { setGroupName(name); setPage(1); }}
        startTime={startTime}
        endTime={endTime}
        onTimeChange={(start, end) => { setStartTime(start); setEndTime(end); setPage(1); }}
      />

      {groupName ? (
        <>
          {/* KPI 卡片 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminFormCard title="课题组人数">
              <p className="text-2xl font-extrabold text-violet-600">{summary?.memberCount ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title="总进出次数">
              <p className="text-2xl font-extrabold text-emerald-600">{summary?.totalEntries ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title="人均日频次">
              <p className="text-2xl font-extrabold text-blue-600">{summary?.avgDailyFreq ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title="近期活跃率">
              <p className="text-2xl font-extrabold text-amber-600">{summary?.activeRate != null ? `${summary.activeRate}%` : "-"}</p>
            </AdminFormCard>
          </div>

          {/* 导出按钮 */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={exportCSV}
              disabled={members.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              导出 CSV
            </button>
          </div>

          {/* 成员排名表 */}
          <ActivityMemberTable
            members={members}
            sortBy={sortBy}
            order={order}
            onSort={handleSort}
            loading={membersQuery.isLoading}
            page={page}
            total={total}
            size={size}
            onPageChange={setPage}
            onSizeChange={setSize}
          />

          {/* 双图表 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AdminFormCard title="进出时段热力图">
              <ActivityHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
            </AdminFormCard>
            <AdminFormCard title="每日进出趋势">
              <ActivityTrendChart data={trendQuery.data ?? []} loading={trendQuery.isLoading} />
            </AdminFormCard>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
          <Users className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">请在上方搜索并选择一个课题组以查看活跃度数据</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/analytics/components/StudentActivityReportPanel.tsx
git commit -m "feat: add StudentActivityReportPanel main component"
```

---

### Task 11: 前端 — AdminAnalyticsPage 挂载

**Files:**
- Modify: `frontend/src/pages/AdminAnalyticsPage.tsx`

- [ ] **Step 1: 导入并挂载新 Panel**

在文件顶部新增 import：
```tsx
import { StudentActivityReportPanel } from "@/features/analytics/components/StudentActivityReportPanel";
```

在 `ANALYTICS_REPORT_KEYS` 数组后新增常量：
```tsx
const STUDENT_ACTIVITY_KEY = "student_activity";
```

在渲染区域 `{activeKey === CAGE_REPORT_KEY ? ...}` 之后添加：
```tsx
{activeKey === STUDENT_ACTIVITY_KEY ? <StudentActivityReportPanel /> : null}
```

- [ ] **Step 2: TypeScript 编译验证**

Run: `cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminAnalyticsPage.tsx
git commit -m "feat: mount StudentActivityReportPanel in admin analytics page"
```

---

### Task 12: Bug 修复 — 搜索后翻页失效

**Files:**
- Modify: `frontend/src/pages/AdminPersonnelPage.tsx`

- [ ] **Step 1: 修复搜索提交时页码重置**

在 `onKeyDown` 处理函数中添加 `setPage(1)`：

找到第318-322行：
```tsx
onKeyDown={(e) => {
  if (e.key === "Enter") {
    activeTab === "personnel" ? refetchPersonnel() : refetchSystem();
  }
}}
```

改为：
```tsx
onKeyDown={(e) => {
  if (e.key === "Enter") {
    setPage(1);
    activeTab === "personnel" ? refetchPersonnel() : refetchSystem();
  }
}}
```

在"查询"按钮的 onClick 处理中也添加 `setPage(1)`：

找到第326-330行：
```tsx
<button
  type="button"
  className={toolBtnPrimary}
  onClick={() => { activeTab === "personnel" ? refetchPersonnel() : refetchSystem(); }}
>
  查询
</button>
```

改为：
```tsx
<button
  type="button"
  className={toolBtnPrimary}
  onClick={() => { setPage(1); activeTab === "personnel" ? refetchPersonnel() : refetchSystem(); }}
>
  查询
</button>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AdminPersonnelPage.tsx
git commit -m "fix: reset page to 1 on search submit"
```

---

### Task 13: 验证 — 启动应用检查

- [ ] **Step 1: 启动后端**

Run: `cd d:/codex/verson.1.2/20260416 && ./mvnw spring-boot:run -q -pl .`
Expected: Application starts without errors on port 8080 (or configured port)

- [ ] **Step 2: 启动前端**

Run: `cd d:/codex/verson.1.2/20260416/frontend && npm run dev`
Expected: Vite dev server starts

- [ ] **Step 3: 手动测试**

1. 登录后台 → 点击"统计与审计" → 报表目录中应出现「学生活跃度统计」
2. 点击进入 → 搜索课题组 → 选择课题组
3. KPI 卡片显示数据，排名表可排序可翻页
4. 热力图和趋势图正确渲染
5. 切换时间预设（今日/本周/本月），数据更新
6. 测试导出 CSV
7. 验证翻页Bug修复：人员授权页搜索后翻页正常

- [ ] **Step 4: Final commit (if any fixes)**

Only if adjustments needed during verification.

---

### Task 14: Bug 修复 — 学生端「我的房间」未拿到真实房间数据

**问题定位**：`StudentRoomService.getFilteredRooms()` 查询 `RoomMappingRoomMapper.selectPage()`（room_mapping 表），与小程序房间概览接口 `/wechat-overview` 使用的 `RoomConfigService.getAllActiveRooms()`（room_config 表）不一致。导致房间列表与实际可用房间不匹配，且 occupancy 的 roomName 键与 access_log 对不上。

**Files:**
- Modify: `src/main/java/com/example/demo/modules/student/service/StudentRoomService.java`

- [ ] **Step 1: 重构 Service 使用 room_config 数据源**

将 `RoomMappingRoomMapper` 替换为 `RoomConfigService`：

```java
package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.student.mapper.StudentRoomPinMapper;
import com.example.demo.modules.twin.common.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.service.RoomConfigService;
import com.example.demo.modules.twin.dashboard.service.TwinDashboardAggregationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class StudentRoomService {

    private static final Logger log = LoggerFactory.getLogger(StudentRoomService.class);

    private static final int DEFAULT_CAPACITY = 20;

    private final RoomConfigService roomConfigService;
    private final TwinDashboardAggregationService aggregationService;
    private final StudentRoomPinMapper pinMapper;
    private final TwinDashboardMapper dashboardMapper;

    public StudentRoomService(RoomConfigService roomConfigService,
                               TwinDashboardAggregationService aggregationService,
                               StudentRoomPinMapper pinMapper,
                               TwinDashboardMapper dashboardMapper) {
        this.roomConfigService = roomConfigService;
        this.aggregationService = aggregationService;
        this.pinMapper = pinMapper;
        this.dashboardMapper = dashboardMapper;
    }

    public Map<String, Object> getRooms(User user, String pinned, String floor,
                                         String status, String search,
                                         int page, int size) {
        boolean pinnedOnly = "1".equals(pinned);

        if (pinnedOnly) {
            return getPinnedRooms(user);
        }

        return getFilteredRooms(user, floor, search, page, size);
    }

    /** 我的房间：复用小程序 wechat-overview 数据管道，获取用户当前在馆房间 */
    private Map<String, Object> getPinnedRooms(User user) {
        List<String> pinnedRoomIds = pinMapper.selectPinnedRoomIds(user.getId());
        List<RoomDashboardRenderDTO> allRooms = roomConfigService.getAllActiveRooms();

        // 获取各校区实时在馆数据
        Map<String, RoomDashboardRenderDTO> roomIndex = new LinkedHashMap<>();
        for (RoomDashboardRenderDTO room : allRooms) {
            roomIndex.put(room.getRoomId(), room);
        }

        List<Map<String, Object>> data = new ArrayList<>();
        for (String roomId : pinnedRoomIds) {
            RoomDashboardRenderDTO room = roomIndex.get(roomId);
            if (room == null) {
                continue;
            }
            data.add(buildRoomItemFromDashboard(room, true));
        }
        return Map.of("data", data, "total", data.size(), "page", 1, "size", data.size());
    }

    /** 全部房间：基于 room_config 分页，含 occupancy */
    private Map<String, Object> getFilteredRooms(User user, String floor, String search,
                                                   int page, int size) {
        List<RoomDashboardRenderDTO> allRooms = roomConfigService.getAllActiveRooms();

        // 楼层 / 搜索过滤
        List<RoomDashboardRenderDTO> filtered = allRooms.stream()
                .filter(r -> {
                    if (floor != null && !floor.isEmpty()) {
                        String roomName = r.getRoomName() != null ? r.getRoomName() : "";
                        if (!roomName.startsWith(floor)) return false;
                    }
                    if (search != null && !search.isEmpty()) {
                        String kw = search.toLowerCase();
                        String roomName = r.getRoomName() != null ? r.getRoomName().toLowerCase() : "";
                        String campus = r.getCampus() != null ? r.getCampus().toLowerCase() : "";
                        if (!roomName.contains(kw) && !campus.contains(kw)) return false;
                    }
                    return true;
                })
                .collect(Collectors.toList());

        long total = filtered.size();
        int offset = (page - 1) * size;
        List<RoomDashboardRenderDTO> paged = filtered.stream().skip(offset).limit(size).toList();

        Set<String> pinnedIds = new HashSet<>(pinMapper.selectPinnedRoomIds(user.getId()));

        List<Map<String, Object>> data = paged.stream()
                .map(r -> buildRoomItemFromDashboard(r, pinnedIds.contains(r.getRoomId())))
                .collect(Collectors.toList());

        return Map.of("data", data, "total", (int) total, "page", page, "size", size);
    }

    public void togglePin(User user, String roomId) {
        if (pinMapper.exists(user.getId(), roomId) > 0) {
            pinMapper.delete(user.getId(), roomId);
        } else {
            pinMapper.insert(user.getId(), roomId);
        }
    }

    private Map<String, Object> buildRoomItemFromDashboard(RoomDashboardRenderDTO room, boolean isPinned) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("roomId", room.getRoomId());
        item.put("roomName", room.getRoomName() != null ? room.getRoomName() : "");
        item.put("floor", deriveFloor(room.getRoomName()));
        item.put("zone", room.getCampus() != null ? room.getCampus() : "");

        int occupants = room.getOccupants() != null ? room.getOccupants().size() : 0;
        int capacity = room.getTotalCapacity() > 0 ? room.getTotalCapacity() : getRoomCapacity(room.getRoomId());
        double rate = capacity > 0 ? (occupants * 100.0 / capacity) : 0;

        item.put("occupantCount", occupants);
        item.put("capacity", capacity);
        item.put("occupancyRate", (int) Math.round(rate));

        String status;
        if (rate > 90) status = "full";
        else if (rate >= 50) status = "busy";
        else status = "idle";
        item.put("status", status);
        item.put("isPinned", isPinned);

        return item;
    }

    private String deriveFloor(String roomName) {
        if (roomName == null) return "";
        // 从房间名提取楼层：如 "A-301" → "3F"
        for (int i = 0; i < roomName.length(); i++) {
            char c = roomName.charAt(i);
            if (c >= '1' && c <= '9') {
                return c + "F";
            }
        }
        return "";
    }

    private Integer getRoomCapacity(String roomId) {
        try {
            Integer cap = dashboardMapper.getRoomCapacityByRoomId(roomId);
            return cap != null && cap > 0 ? cap : DEFAULT_CAPACITY;
        } catch (Exception e) {
            log.warn("Failed to get capacity for room {}", roomId, e);
            return DEFAULT_CAPACITY;
        }
    }
}
```

关键变更：
- 移除 `RoomMappingRoomMapper` 依赖，改用 `RoomConfigService.getAllActiveRooms()`（与小程序同源）
- 移除 `getRoomOccupancyMap()` 的静态方法，改用 `RoomDashboardRenderDTO.getOccupants()` 实时在馆数据
- `buildRoomItemFromDashboard()` 直接读取 DTO 的 occupants 列表（实时刷卡数据）

- [ ] **Step 2: 编译验证**

Run: `cd d:/codex/verson.1.2/20260416 && ./mvnw compile -q -pl .`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/student/service/StudentRoomService.java
git commit -m "fix: use room_config data pipeline for student rooms page"
```

---

### Task 15: Bug 修复 — 学生端笼架下拉列表未接入真实数据

**问题定位**：`StudentCageShelfService.getFilterOptions()` 的 cascade 下拉树仅查询 `snapshotMapper.selectDistinctShelves()`（只返回已刷新过的笼架），不包含未刷新但已导入的笼架。与管理员后台 `/api/v1/cage-shelves/filter-options`（查询 `cageShelfMapper.listIndexes()`）不一致，导致学生端下拉列表缺少大量已导入笼架。

**Files:**
- Modify: `src/main/java/com/example/demo/modules/student/service/StudentCageShelfService.java`

- [ ] **Step 1: 修复 getFilterOptions 使用 indexes 表构建下拉**

替换 `getFilterOptions()` 方法，从 `cageShelfMapper.listIndexes()` 构建 cascade 树：

找到第51-99行的 `getFilterOptions` 方法，替换为：

```java
public Map<String, Object> getFilterOptions(User user) {
    // 从 indexes 表拉取全部已导入笼架（与管理员后台同源），不依赖快照
    List<Map<String, Object>> allShelves = cageShelfMapper.listIndexes(null, null, null, null, 100000, 0);

    List<Map<String, Object>> campuses = new ArrayList<>();
    List<Map<String, Object>> areas = new ArrayList<>();
    List<Map<String, Object>> floors = new ArrayList<>();
    List<Map<String, Object>> rooms = new ArrayList<>();
    List<Map<String, Object>> shelfList = new ArrayList<>();

    java.util.Set<String> seenCampuses = new java.util.LinkedHashSet<>();
    java.util.Set<String> seenAreas = new java.util.LinkedHashSet<>();
    java.util.Set<String> seenFloors = new java.util.LinkedHashSet<>();
    java.util.Set<String> seenRooms = new java.util.LinkedHashSet<>();
    java.util.Set<String> seenShelves = new java.util.LinkedHashSet<>();

    for (Map<String, Object> s : allShelves) {
        String campusName = String.valueOf(s.getOrDefault("campusName", ""));
        String areaName = String.valueOf(s.getOrDefault("areaName", ""));
        String floorName = String.valueOf(s.getOrDefault("floorName", ""));
        String roomName = String.valueOf(s.getOrDefault("roomName", ""));
        String shelveId = String.valueOf(s.getOrDefault("shelveId", ""));
        String shelveName = String.valueOf(s.getOrDefault("shelveName", ""));

        if (!campusName.isEmpty() && seenCampuses.add(campusName)) {
            campuses.add(Map.of("id", campusName, "name", campusName));
        }
        if (!areaName.isEmpty() && seenAreas.add(areaName)) {
            areas.add(Map.of("id", areaName, "name", areaName));
        }
        if (!floorName.isEmpty() && seenFloors.add(floorName)) {
            floors.add(Map.of("id", floorName, "name", floorName));
        }
        if (!roomName.isEmpty() && seenRooms.add(roomName)) {
            rooms.add(Map.of("id", roomName, "name", roomName));
        }
        if (!shelveId.isEmpty() && seenShelves.add(shelveId)) {
            shelfList.add(Map.of("id", shelveId, "name", shelveName));
        }
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("campuses", campuses);
    out.put("areas", areas);
    out.put("floors", floors);
    out.put("rooms", rooms);
    out.put("shelves", shelfList);
    return out;
}
```

同时删除不再使用的 `resolveUserGroupNames` 调用（该方法仍在 `getShelfDetail` 中使用，保留不动）。

- [ ] **Step 2: 编译验证**

Run: `cd d:/codex/verson.1.2/20260416 && ./mvnw compile -q -pl .`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/student/service/StudentCageShelfService.java
git commit -m "fix: use cage shelf indexes table for student filter options"
```

---

## Summary

| # | Task | Files |
|---|------|-------|
| 1 | 报表注册 | `AnalyticsReportRegistry.java` |
| 2 | Mapper 接口 | `TwinDashboardMapper.java` |
| 3 | Mapper XML | `TwinDashboardMapper.xml` |
| 4 | Service | `StudentActivityService.java` (new) |
| 5 | Controller | `StudentActivityController.java` (new) |
| 6 | API 类型与函数 | `analytics.api.ts` |
| 7 | FilterBar | `ActivityFilterBar.tsx` (new) |
| 8 | MemberTable | `ActivityMemberTable.tsx` (new) |
| 9 | Charts | `ActivityHeatmapChart.tsx` + `ActivityTrendChart.tsx` (new) |
| 10 | ReportPanel | `StudentActivityReportPanel.tsx` (new) |
| 11 | Page 挂载 | `AdminAnalyticsPage.tsx` |
| 12 | Bug 修复 — 翻页 | `AdminPersonnelPage.tsx` |
| 13 | 验证 | 启动应用 + 手动测试 |
| 14 | Bug 修复 — 房间 | `StudentRoomService.java` |
| 15 | Bug 修复 — 笼架 | `StudentCageShelfService.java` |

# 学生活跃度统计 全面改造 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造学生活跃度统计模块：修复搜索/分页 bug，替换指标计算逻辑（人均周频次 + 同校区活跃度占比），新增房间偏好图表，将人员数据库搜索增加分页。

**Architecture:** 在现有 StudentActivityController + StudentActivityService 基础上扩展，前端拆出 GroupPaginator 和 ActivityRoomChart 两个新组件。人员数据库分页修复在 TwinApiController.searchPersonnel 追加 page/size。

**Tech Stack:** Java (Spring Boot + MyBatis) 后端, React + TypeScript + Recharts + TanStack Query 前端

---

## 文件结构

| 层级 | 文件 | 操作 |
|---|---|---|
| 后端 Controller | `src/main/java/.../analytics/controller/StudentActivityController.java` | 修改 |
| 后端 Service | `src/main/java/.../analytics/service/StudentActivityService.java` | 修改 |
| 后端 Mapper | `src/main/java/.../twin/common/mapper/TwinDashboardMapper.java` | 新加 1 个方法声明 |
| 后端 Mapper XML | `src/main/resources/mapper/TwinDashboardMapper.xml` | 新加 1 个 SQL |
| 后端 Controller | `src/main/java/.../twin/dashboard/controller/TwinApiController.java` | 修改 searchPersonnel |
| 后端 Mapper XML | `src/main/resources/mapper/TwinDashboardMapper.xml` | 修改 searchPersonnel SQL + 新增 countPersonnel |
| 前端 API | `frontend/src/api/domains/analytics.api.ts` | 修改类型 + 新增函数 |
| 前端 API | `frontend/src/api/twinApi.ts` | 修改 searchPersonnel 签名 |
| 前端组件 | `frontend/src/features/analytics/components/ActivityFilterBar.tsx` | 大幅修改 |
| 前端组件 | `frontend/src/features/analytics/components/StudentActivityReportPanel.tsx` | 修改 |
| 前端组件 | `frontend/src/features/analytics/components/ActivityMemberTable.tsx` | 修改 |
| 前端组件 | `frontend/src/features/analytics/components/GroupPaginator.tsx` | **新建** |
| 前端组件 | `frontend/src/features/analytics/components/ActivityRoomChart.tsx` | **新建** |
| 前端页面 | `frontend/src/pages/DebugPersonnelPage.tsx` | 修改 |

---

### Task 1: 后端 — StudentActivityService 重构 groups 查询（支持分页 + 活跃度排序 + 校区）

**Files:**
- Modify: `src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java`
- Modify: `src/main/java/com/example/demo/modules/analytics/controller/StudentActivityController.java`

- [ ] **Step 1: 改造 Service.listGroups 为分页 + 活跃度排序**

在 `StudentActivityService.java` 中，将 `listGroups(String keyword)` 替换为：

```java
/** 课题组分页列表：按同校区人均周频次占比降序 */
public Map<String, Object> listGroupsPaged(String keyword, String startTime, String endTime, int page, int size) {
    if (page < 1) page = 1;
    if (size < 1) size = 1; // 默认一页一个课题组

    // 1. 拉取所有课题组名（含 keyword 过滤）
    List<String> allGroups = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(
            dashboardMapper.searchPersonnelProjectGroupFields(
                    keyword != null ? keyword.trim() : "", 500),
            keyword, 500);

    // 2. 计算每个组的指标
    List<GroupActivityRow> rows = new ArrayList<>();
    for (String groupName : allGroups) {
        GroupActivityRow row = computeGroupRow(groupName, startTime, endTime);
        if (row != null) rows.add(row);
    }

    // 3. 按 activeSharePct 降序
    rows.sort(Comparator.comparingDouble(GroupActivityRow::getActiveSharePct).reversed());

    // 4. 分页
    int total = rows.size();
    int offset = (page - 1) * size;
    List<GroupActivityRow> paged = rows.stream().skip(offset).limit(size).toList();

    Map<String, Object> result = new HashMap<>();
    result.put("groups", paged.stream().map(this::groupRowToMap).toList());
    result.put("total", total);
    result.put("page", page);
    result.put("size", size);
    return result;
}

private GroupActivityRow computeGroupRow(String groupName, String startTime, String endTime) {
    List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
    if (userIds.isEmpty()) return null;

    List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

    // 按 userId 聚合 entry/exit 配对次数
    int totalEntries = 0;
    Map<String, String> userCampus = new LinkedHashMap<>();
    for (String uid : userIds) {
        List<Map<String, Object>> userLogs = rawLogs.stream()
                .filter(l -> uid.equals(String.valueOf(l.getOrDefault("user_id", ""))))
                .toList();
        int userPairs = countPairedEntries(userLogs);
        totalEntries += userPairs;
        // 从该用户的 access logs 推断校区
        if (!userCampus.containsKey(uid)) {
            String campus = resolveCampusForUser(uid, userLogs);
            userCampus.put(uid, campus != null ? campus : "未知校区");
        }
    }

    int memberCount = userIds.size();
    // 时间范围周数（向上取整，最小 1）
    long days = Math.max(1, ChronoUnit.DAYS.between(
            LocalDateTime.parse(startTime.replace(" ", "T"), DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate(),
            LocalDateTime.parse(endTime.replace(" ", "T"), DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate()) + 1);
    double weeks = Math.max(1.0, Math.ceil(days / 7.0));
    double perCapitaWeeklyFreq = memberCount > 0 ? (double) totalEntries / memberCount / weeks : 0;

    // 校区：取该组多数人的校区
    String majorityCampus = userCampus.values().stream()
            .collect(Collectors.groupingBy(c -> c, Collectors.counting()))
            .entrySet().stream().max(Map.Entry.comparingByValue())
            .map(Map.Entry::getKey).orElse("未知校区");

    GroupActivityRow row = new GroupActivityRow();
    row.setName(groupName);
    row.setCampus(majorityCampus);
    row.setMemberCount(memberCount);
    row.setTotalEntries(totalEntries);
    row.setPerCapitaWeeklyFreq(Math.round(perCapitaWeeklyFreq * 10.0) / 10.0);
    // activeSharePct 将在第二步同校区聚合后填入
    row.setActiveSharePct(0);
    return row;
}

/** 计算同校区活跃度占比 */
private void fillActiveSharePct(List<GroupActivityRow> allRows) {
    Map<String, Double> campusSums = new HashMap<>();
    for (GroupActivityRow r : allRows) {
        campusSums.merge(r.getCampus(), r.getPerCapitaWeeklyFreq(), Double::sum);
    }
    for (GroupActivityRow r : allRows) {
        double campusSum = campusSums.getOrDefault(r.getCampus(), 1.0);
        if (campusSum > 0) {
            r.setActiveSharePct(Math.round(r.getPerCapitaWeeklyFreq() / campusSum * 1000.0) / 10.0);
        }
    }
}

/** 从 aro_access_log 的 area_name 字段推断用户所属校区（浦东/浦西） */
private String resolveCampusForUser(String userId, List<Map<String, Object>> userLogs) {
    long pudong = userLogs.stream()
            .filter(l -> {
                String a = String.valueOf(l.getOrDefault("area_name", ""));
                return a.contains("浦东");
            }).count();
    long puxi = userLogs.stream()
            .filter(l -> {
                String a = String.valueOf(l.getOrDefault("area_name", ""));
                return a.contains("浦西");
            }).count();
    if (pudong > puxi) return "浦东";
    if (puxi > pudong) return "浦西";
    return "未知校区";
}
// 注意：listAccessLogsByUserIds SQL 需返回 area_name 列（已返回，见 TwinDashboardMapper.xml:955）

/** 统计用户日志中 entry-exit 配对次数 */
private int countPairedEntries(List<Map<String, Object>> userLogs) {
    List<LocalDateTime> entries = new ArrayList<>();
    List<LocalDateTime> exits = new ArrayList<>();
    for (Map<String, Object> log : userLogs) {
        int accessType = parseAccessType(log);
        String ts = String.valueOf(log.getOrDefault("create_time", ""));
        LocalDateTime dt = parseTime(ts);
        if (dt == null) continue;
        if (accessType == 1) entries.add(dt);
        else if (accessType == 2) exits.add(dt);
    }
    int pairCount = 0;
    int exitIdx = 0;
    for (LocalDateTime entry : entries) {
        while (exitIdx < exits.size() && !exits.get(exitIdx).isAfter(entry)) exitIdx++;
        if (exitIdx < exits.size()) {
            long diffMin = ChronoUnit.MINUTES.between(entry, exits.get(exitIdx));
            if (diffMin <= 24 * 60) { pairCount++; exitIdx++; }
        }
    }
    return pairCount;
}

// ---- 内部类 ----

public static class GroupActivityRow {
    private String name;
    private String campus;
    private int memberCount;
    private int totalEntries;
    private double perCapitaWeeklyFreq;
    private double activeSharePct;
    // getters & setters ...
    public String getName() { return name; }
    public void setName(String v) { this.name = v; }
    public String getCampus() { return campus; }
    public void setCampus(String v) { this.campus = v; }
    public int getMemberCount() { return memberCount; }
    public void setMemberCount(int v) { this.memberCount = v; }
    public int getTotalEntries() { return totalEntries; }
    public void setTotalEntries(int v) { this.totalEntries = v; }
    public double getPerCapitaWeeklyFreq() { return perCapitaWeeklyFreq; }
    public void setPerCapitaWeeklyFreq(double v) { this.perCapitaWeeklyFreq = v; }
    public double getActiveSharePct() { return activeSharePct; }
    public void setActiveSharePct(double v) { this.activeSharePct = v; }
}

private Map<String, Object> groupRowToMap(GroupActivityRow row) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("name", row.getName());
    m.put("campus", row.getCampus());
    m.put("memberCount", row.getMemberCount());
    m.put("totalEntries", row.getTotalEntries());
    m.put("perCapitaWeeklyFreq", row.getPerCapitaWeeklyFreq());
    m.put("activeSharePct", row.getActiveSharePct());
    return m;
}
```

需要新增 import：
```java
import java.util.stream.Collectors;
```
（AroPersonnelMapper 依赖将在 Task 2 中引入，用于经验等级查询）

- [ ] **Step 2: 修改 Controller.listGroups 输出新结构**

在 `StudentActivityController.java` 中修改 `/groups` 端点：

```java
@GetMapping("/groups")
@Operation(summary = "课题组分页列表（按活跃度占比降序）")
public Result<Map<String, Object>> listGroups(
        @RequestHeader(value = "Authorization", required = false) String auth,
        @RequestParam(required = false) String keyword,
        @RequestParam String startTime,
        @RequestParam String endTime,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "1") int size) {
    Result<?> denied = requireStaff(auth);
    if (denied != null) return Result.error(denied.getMessage());
    return Result.success(studentActivityService.listGroupsPaged(keyword, startTime, endTime, page, size));
}
```

- [ ] **Step 3: 编译后端验证**

Run: `cd d:\codex\verson.1.2\20260416 && mvn compile -pl . -q 2>&1 | tail -20`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java \
        src/main/java/com/example/demo/modules/analytics/controller/StudentActivityController.java
git commit -m "feat: revamp groups API — pagination, perCapitaWeeklyFreq, activeSharePct by campus"
```

---

### Task 2: 后端 — StudentActivityService 成员查询改造（周频次 + 经验等级）

**Files:**
- Modify: `src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java`

- [ ] **Step 1: 修改 computeMemberRow 输出周均频次 + 经验等级**

在 `StudentActivityService.java` 中，修改 `computeMemberRow` 和 `MemberActivityRow`：

```java
private MemberActivityRow computeMemberRow(String userId, List<Map<String, Object>> userLogs, 
                                            String startTime, String endTime) {
    // ... 现有配对逻辑保持不变，计算出 pairCount 和 activeDates ...
    
    // 改：计算周数而非天数
    long days = Math.max(1, ChronoUnit.DAYS.between(
            LocalDateTime.parse(startTime.replace(" ", "T"), FMT).toLocalDate(),
            LocalDateTime.parse(endTime.replace(" ", "T"), FMT).toLocalDate()) + 1);
    double weeks = Math.max(1.0, Math.ceil(days / 7.0));
    double weeklyAvgFreq = weeks > 0 ? (double) pairCount / weeks : 0;

    // 查经验等级
    String experienceLevel = resolveExperienceLevel(userId);

    MemberActivityRow row = new MemberActivityRow();
    // ... 原有字段赋值 ...
    row.setWeeklyAvgFreq(Math.round(weeklyAvgFreq * 10.0) / 10.0);
    row.setExperienceLevel(experienceLevel != null ? experienceLevel : "-");
    return row;
}

private String resolveExperienceLevel(String userId) {
    try {
        AroPersonnel p = aroPersonnelMapper.findByUserId(userId);
        if (p != null && p.getTotalExp() != null) {
            int level = (int) Math.floor(Math.sqrt(p.getTotalExp() / 50.0)) + 1;
            return "Lv." + level;
        }
    } catch (Exception e) { /* ignore */ }
    return "-";
}
```

修改 `MemberActivityRow` 类，新增字段：
```java
public static class MemberActivityRow {
    // ... 保留现有字段 dailyAvgFreq (先保留兼容) ...
    private double weeklyAvgFreq;      // 新增
    private String experienceLevel;    // 新增
    
    public double getWeeklyAvgFreq() { return weeklyAvgFreq; }
    public void setWeeklyAvgFreq(double v) { this.weeklyAvgFreq = v; }
    public String getExperienceLevel() { return experienceLevel; }
    public void setExperienceLevel(String v) { this.experienceLevel = v; }
}
```

修改 `rowToMap` 方法：
```java
private Map<String, Object> rowToMap(MemberActivityRow row) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("userId", row.getUserId());
    m.put("userName", row.getUserName());
    m.put("experienceLevel", row.getExperienceLevel());   // 新增
    m.put("entryCount", row.getEntryCount());
    m.put("totalDurationMinutes", row.getTotalDurationMinutes());
    m.put("weeklyAvgFreq", row.getWeeklyAvgFreq());        // 新增
    m.put("dailyAvgFreq", row.getDailyAvgFreq());          // 保留兼容
    m.put("lastActiveDate", row.getLastActiveDate());
    m.put("daysSinceLastActive", row.getDaysSinceLastActive());
    return m;
}
```

修改 `summaryMap` — 增加 perCapitaWeeklyFreq 和 activeSharePct：
```java
private Map<String, Object> summaryMap(int total, int entries, long duration, 
                                        double avgWeekly, double activeSharePct, 
                                        String campus, String timeLabel) {
    Map<String, Object> m = new HashMap<>();
    m.put("memberCount", total);
    m.put("totalEntries", entries);
    m.put("totalDurationMinutes", duration);
    m.put("perCapitaWeeklyFreq", Math.round(avgWeekly * 10.0) / 10.0);  // 替代 avgDailyFreq
    m.put("activeSharePct", activeSharePct);                            // 替代 activeRate
    m.put("campus", campus);
    m.put("timeLabel", timeLabel);
    return m;
}
```

修改 `queryMemberActivity` 方法中的汇总和调用：
```java
// 在 queryMemberActivity 中：
// 修改 computeMemberRow 调用传入 startTime/endTime
MemberActivityRow row = computeMemberRow(uid, userLogs, startTime, endTime);

// 修改 summary 计算
double avgWeekly = rows.stream().mapToDouble(MemberActivityRow::getWeeklyAvgFreq).average().orElse(0);

// 计算该组的 activeSharePct（同校区占比）
double activeSharePct = 0;
// 取该组的校区（多数成员的校区）
ActiveGroupRow groupRow = computeGroupRow(groupName, startTime, endTime);
if (groupRow != null) {
    activeSharePct = groupRow.getActiveSharePct();
    campus = groupRow.getCampus();
}

// 生成 timeLabel
String timeLabel = deriveTimeLabel(startTime, endTime);

result.put("summary", summaryMap(total, totalEntries, totalDuration, avgWeekly, activeSharePct, campus, timeLabel));
```

新增 `deriveTimeLabel` 方法：
```java
private String deriveTimeLabel(String start, String end) {
    LocalDate s = LocalDate.parse(start.substring(0, 10));
    LocalDate e = LocalDate.parse(end.substring(0, 10));
    LocalDate today = LocalDate.now();
    if (s.equals(today) && e.equals(today)) return "今日";
    if (s.equals(today.minusDays(6)) && e.equals(today)) return "本周";
    if (s.equals(today.minusMonths(1)) && e.equals(today)) return "本月";
    return s.toString().substring(5) + "-" + e.toString().substring(5);
}
```

- [ ] **Step 2: 编译验证**

```bash
mvn compile -pl . -q 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java
git commit -m "feat: weeklyAvgFreq + experienceLevel in member query, new summary fields"
```

---

### Task 3: 后端 — 新增 room-usage 和 summary 端点

**Files:**
- Modify: `src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java`
- Modify: `src/main/java/com/example/demo/modules/analytics/controller/StudentActivityController.java`

- [ ] **Step 1: Service 新增 roomUsage 方法**

```java
/** 课题组房间进出频次排行 */
public List<Map<String, Object>> roomUsage(String groupName, String startTime, String endTime) {
    if (groupName == null || groupName.isBlank()) return List.of();

    List<String> userIds = dashboardMapper.listUserIdsByProjectGroup(groupName.trim(), MAX_USER_IDS);
    if (userIds.isEmpty()) return List.of();

    List<Map<String, Object>> rawLogs = dashboardMapper.listAccessLogsByUserIds(userIds, startTime, endTime);

    // 按 room_name 聚合次数
    Map<String, Integer> roomCounts = new LinkedHashMap<>();
    for (Map<String, Object> log : rawLogs) {
        String room = String.valueOf(log.getOrDefault("room_name", ""));
        if (room.isEmpty() || "null".equals(room)) continue;
        roomCounts.merge(room, 1, Integer::sum);
    }

    return roomCounts.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
            .map(e -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("roomName", e.getKey());
                m.put("entryCount", e.getValue());
                return m;
            })
            .collect(Collectors.toList());
}

/** 单个课题组的汇总 KPI（供 KPI 卡片直接使用） */
public Map<String, Object> summary(String groupName, String startTime, String endTime) {
    GroupActivityRow row = computeGroupRow(groupName, startTime, endTime);
    if (row == null) {
        Map<String, Object> empty = new HashMap<>();
        empty.put("memberCount", 0);
        empty.put("totalEntries", 0);
        empty.put("perCapitaWeeklyFreq", 0);
        empty.put("activeSharePct", 0);
        empty.put("campus", "-");
        empty.put("timeLabel", deriveTimeLabel(startTime, endTime));
        return empty;
    }
    // 确保 activeSharePct 已计算（需要同校区其他组数据）
    List<String> allGroups = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(
            dashboardMapper.searchPersonnelProjectGroupFields("", 500), "", 500);
    List<GroupActivityRow> allRows = new ArrayList<>();
    allRows.add(row);
    for (String g : allGroups) {
        if (g.equals(groupName)) continue;
        GroupActivityRow gr = computeGroupRow(g, startTime, endTime);
        if (gr != null) allRows.add(gr);
    }
    fillActiveSharePct(allRows);
    GroupActivityRow updated = allRows.stream().filter(r -> r.getName().equals(groupName)).findFirst().orElse(row);

    Map<String, Object> m = new HashMap<>();
    m.put("memberCount", updated.getMemberCount());
    m.put("totalEntries", updated.getTotalEntries());
    m.put("perCapitaWeeklyFreq", updated.getPerCapitaWeeklyFreq());
    m.put("activeSharePct", updated.getActiveSharePct());
    m.put("campus", updated.getCampus());
    m.put("timeLabel", deriveTimeLabel(startTime, endTime));
    return m;
}
```

- [ ] **Step 2: Controller 新增 /room-usage 和 /summary 端点**

```java
@GetMapping("/room-usage")
@Operation(summary = "课题组房间进出频次排行")
public Result<List<Map<String, Object>>> roomUsage(
        @RequestHeader(value = "Authorization", required = false) String auth,
        @RequestParam String groupName,
        @RequestParam String startTime,
        @RequestParam String endTime) {
    Result<?> denied = requireStaff(auth);
    if (denied != null) return Result.error(denied.getMessage());
    return Result.success(studentActivityService.roomUsage(groupName, startTime, endTime));
}

@GetMapping("/summary")
@Operation(summary = "课题组活跃度 KPI 汇总")
public Result<Map<String, Object>> summary(
        @RequestHeader(value = "Authorization", required = false) String auth,
        @RequestParam String groupName,
        @RequestParam String startTime,
        @RequestParam String endTime) {
    Result<?> denied = requireStaff(auth);
    if (denied != null) return Result.error(denied.getMessage());
    return Result.success(studentActivityService.summary(groupName, startTime, endTime));
}
```

- [ ] **Step 3: 编译验证**

```bash
mvn compile -pl . -q 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/analytics/service/StudentActivityService.java \
        src/main/java/com/example/demo/modules/analytics/controller/StudentActivityController.java
git commit -m "feat: add /room-usage and /summary endpoints for student activity"
```

---

### Task 4: 后端 — TwinApiController.searchPersonnel 增加分页

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/controller/TwinApiController.java`
- Modify: `src/main/java/com/example/demo/modules/twin/common/mapper/TwinDashboardMapper.java`
- Modify: `src/main/resources/mapper/TwinDashboardMapper.xml`

- [ ] **Step 1: Mapper 新增 countPersonnel 和 searchPersonnel 签名更新**

在 `TwinDashboardMapper.java` 中添加：

```java
List<Map<String, Object>> searchPersonnelPaged(@Param("keyword") String keyword, @Param("limit") int limit, @Param("offset") int offset);
int countPersonnel(@Param("keyword") String keyword);
```

- [ ] **Step 2: Mapper XML 新增 SQL**

在 `TwinDashboardMapper.xml` 中添加（或修改现有 `searchPersonnel`）：

```xml
<select id="searchPersonnelPaged" resultType="map">
    <bind name="pattern" value="'%' + keyword + '%'" />
    SELECT *
    FROM aro_personnel
    WHERE name LIKE #{pattern}
       OR user_id LIKE #{pattern}
       OR project_group_name LIKE #{pattern}
       OR department_name LIKE #{pattern}
    ORDER BY has_official_room_permission DESC,
             total_exp DESC,
             name ASC
    LIMIT #{limit} OFFSET #{offset}
</select>

<select id="countPersonnel" resultType="int">
    <bind name="pattern" value="'%' + keyword + '%'" />
    SELECT COUNT(*)
    FROM aro_personnel
    WHERE name LIKE #{pattern}
       OR user_id LIKE #{pattern}
       OR project_group_name LIKE #{pattern}
       OR department_name LIKE #{pattern}
</select>
```

- [ ] **Step 3: Controller 修改 searchPersonnel 端点**

修改 `TwinApiController.java` 的 `searchPersonnel` 方法：

```java
@GetMapping("/personnel/search")
public Result<ListMapDataResponseDTO> searchPersonnel(
        @RequestParam String keyword,
        @RequestParam(defaultValue = "20") int limit,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size) {
    try {
        int offset = (page - 1) * size;
        List<Map<String, Object>> local = dashboardMapper.searchPersonnelPaged(keyword, size, offset);
        int total = dashboardMapper.countPersonnel(keyword);
        ListMapDataResponseDTO dto = new ListMapDataResponseDTO(local);
        dto.setTotal(total);
        dto.setPage(page);
        dto.setSize(size);
        return Result.success(dto);
    } catch (Exception e) {
        return Result.error("人员搜索失败: " + e.getMessage());
    }
}
```

注意：需检查 `ListMapDataResponseDTO` 是否有 total/page/size 字段；若无则新建一个带分页的 DTO 或直接返回 Map。

- [ ] **Step 4: 编译验证**

```bash
mvn compile -pl . -q 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/controller/TwinApiController.java \
        src/main/java/com/example/demo/modules/twin/common/mapper/TwinDashboardMapper.java \
        src/main/resources/mapper/TwinDashboardMapper.xml
git commit -m "fix: add pagination to personnel search endpoint"
```

---

### Task 5: 前端 — API 类型和函数更新

**Files:**
- Modify: `frontend/src/api/domains/analytics.api.ts`
- Modify: `frontend/src/api/twinApi.ts`

- [ ] **Step 1: 更新 analytics.api.ts 类型**

```typescript
// 替换 StudentActivityGroup
export type StudentActivityGroup = {
  name: string;
  campus: string;
  memberCount: number;
  totalEntries: number;
  perCapitaWeeklyFreq: number;
  activeSharePct: number;
};

// 替换 StudentActivitySummary
export type StudentActivitySummary = {
  memberCount: number;
  totalEntries: number;
  perCapitaWeeklyFreq: number;  // 曾用 avgDailyFreq
  activeSharePct: number;       // 曾用 activeRate
  campus: string;
  timeLabel: string;
};

// 修改 StudentActivityMember
export type StudentActivityMember = {
  userId: string;
  userName: string;
  experienceLevel: string;      // 新增
  entryCount: number;
  totalDurationMinutes: number;
  weeklyAvgFreq: number;        // 新增，替代 dailyAvgFreq
  dailyAvgFreq: number;         // 保留兼容
  lastActiveDate: string | null;
  daysSinceLastActive: number;
};

// 新增 RoomUsageItem
export type RoomUsageItem = {
  roomName: string;
  entryCount: number;
};

// 修改 fetchStudentActivityGroups 签名
export async function fetchStudentActivityGroups(params: {
  keyword?: string;
  startTime: string;
  endTime: string;
  page?: number;
  size?: number;
}): Promise<{ groups: StudentActivityGroup[]; total: number; page: number; size: number }> {
  return unwrap(
    authHttp.get<Result<{ groups: StudentActivityGroup[]; total: number; page: number; size: number }>>(
      "/v1/analytics/student-activity/groups", { params }
    )
  );
}

// fetchStudentActivityMembers — sortBy 参数更新 "dailyAvgFreq" -> "weeklyAvgFreq"

// 新增
export async function fetchStudentActivityRoomUsage(params: {
  groupName: string;
  startTime: string;
  endTime: string;
}): Promise<RoomUsageItem[]> {
  return unwrap(
    authHttp.get<Result<RoomUsageItem[]>>("/v1/analytics/student-activity/room-usage", { params })
  );
}

export async function fetchStudentActivitySummary(params: {
  groupName: string;
  startTime: string;
  endTime: string;
}): Promise<StudentActivitySummary> {
  return unwrap(
    authHttp.get<Result<StudentActivitySummary>>("/v1/analytics/student-activity/summary", { params })
  );
}

// 移除: DailyTrendPoint, fetchStudentActivityDailyTrend
```

- [ ] **Step 2: 更新 twinApi.ts searchPersonnel**

```typescript
export const searchPersonnel = async (keyword: string, page: number = 1, size: number = 20) => {
    const response = await authHttp.get(
      `/v1/twin/dashboard/personnel/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${size}`
    );
    return {
      data: asArrayData(response.data?.data),
      total: response.data?.data?.total ?? 0,
    };
};
```

`PersonnelPageResponse` 类型保持不变（已有 `data`, `total`）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/domains/analytics.api.ts frontend/src/api/twinApi.ts
git commit -m "feat: update API types for new student activity schema + personnel pagination"
```

---

### Task 6: 前端 — ActivityFilterBar 搜索修复 + 组翻页器

**Files:**
- Modify: `frontend/src/features/analytics/components/ActivityFilterBar.tsx`
- Create: `frontend/src/features/analytics/components/GroupPaginator.tsx`

- [ ] **Step 1: 创建 GroupPaginator 组件**

```tsx
// frontend/src/features/analytics/components/GroupPaginator.tsx
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  groupName: string;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function GroupPaginator({ groupName, page, total, onPageChange }: Props) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-violet-50 disabled:opacity-30"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        上一个
      </button>
      <span className="text-sm font-semibold text-violet-700">{groupName}</span>
      <span className="text-xs text-neutral-400">
        第 {page} / {total} 个课题组
      </span>
      <button
        type="button"
        disabled={page >= total}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-violet-50 disabled:opacity-30"
      >
        下一个
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 修改 ActivityFilterBar — 修复搜索 bug + 整合导出按钮**

核心修复：分离搜索关键词和选中组名。

```tsx
// ActivityFilterBar.tsx 关键修改

type Props = {
  groupName: string;
  groupPage: number;           // 新增
  groupTotal: number;          // 新增
  onGroupChange: (name: string) => void;
  onGroupPageChange: (page: number) => void;  // 新增
  startTime: string;
  endTime: string;
  onTimeChange: (start: string, end: string) => void;
  onExportCSV: () => void;     // 新增
  disabled?: boolean;
};

// 输入框改为只绑定 keyword，不再混用 groupName
const [keyword, setKeyword] = useState("");

// 搜索下拉仅做过滤，选中后设置 groupName 并清空 keyword
// value 绑定到 keyword（而非 groupName || keyword）
<input
  type="text"
  value={keyword}                          // 修复：只用 keyword
  onChange={(e) => {
    const v = e.target.value;
    setKeyword(v);
    setShowDropdown(true);
  }}
  onFocus={() => setShowDropdown(true)}
  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
  placeholder="搜索课题组名称…"
  // ...
/>

// 导出按钮整合到筛选栏右侧
<div style={{ flex: 1 }} />
<button
  type="button"
  onClick={onExportCSV}
  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
>
  <Download className="h-3.5 w-3.5" />
  导出 CSV
</button>
```

返回 JSX 中在筛选栏下方插入 GroupPaginator：
```tsx
<GroupPaginator
  groupName={groupName}
  page={groupPage}
  total={groupTotal}
  onPageChange={onGroupPageChange}
/>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/analytics/components/GroupPaginator.tsx \
        frontend/src/features/analytics/components/ActivityFilterBar.tsx
git commit -m "fix: separate search keyword from group name, add GroupPaginator, move export button"
```

---

### Task 7: 前端 — StudentActivityReportPanel 改造

**Files:**
- Modify: `frontend/src/features/analytics/components/StudentActivityReportPanel.tsx`

- [ ] **Step 1: 重写 StudentActivityReportPanel**

```tsx
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  fetchStudentActivityGroups,
  fetchStudentActivityMembers,
  fetchStudentActivityHeatmap,
  fetchStudentActivityRoomUsage,
  fetchStudentActivitySummary,
} from "@/api/domains/analytics.api";
import { ActivityFilterBar } from "./ActivityFilterBar";
import { ActivityMemberTable } from "./ActivityMemberTable";
import type { SortKey } from "./ActivityMemberTable";
import { ActivityHeatmapChart } from "./ActivityHeatmapChart";
import { ActivityRoomChart } from "./ActivityRoomChart";
import { AdminFormCard } from "@/components/admin/AdminPageShell";

function defaultLastMonth() { /* 保留 */ }

export function StudentActivityReportPanel() {
  const initialRange = defaultLastMonth();
  const [groupName, setGroupName] = useState("");
  const [groupPage, setGroupPage] = useState(1);
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [sortBy, setSortBy] = useState<SortKey>("entries");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [memberPage, setMemberPage] = useState(1);
  const [memberSize, setMemberSize] = useState(20);

  // 课题组列表（分页，每页 1 个）
  const groupsQuery = useQuery({
    queryKey: ["studentActivityGroups", groupPage, startTime, endTime],
    queryFn: () => fetchStudentActivityGroups({ startTime, endTime, page: groupPage, size: 1 }),
  });
  const groupList = groupsQuery.data?.groups ?? [];
  const groupTotal = groupsQuery.data?.total ?? 0;
  
  // 自动选第一个组
  useEffect(() => {
    if (!groupName && groupList.length > 0) {
      setGroupName(groupList[0].name);
    }
  }, [groupList, groupName]);

  // 汇总
  const summaryQuery = useQuery({
    queryKey: ["studentActivitySummary", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivitySummary({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });
  const summary = summaryQuery.data;
  const timeLabel = summary?.timeLabel ?? "";

  // 成员
  const membersQuery = useQuery({
    queryKey: ["studentActivityMembers", groupName, startTime, endTime, sortBy, order, memberPage, memberSize],
    queryFn: () => fetchStudentActivityMembers({ groupName, startTime, endTime, sortBy, order, page: memberPage, size: memberSize }),
    enabled: groupName.length > 0,
  });
  const members = membersQuery.data?.members ?? [];
  const memberTotal = membersQuery.data?.total ?? 0;

  // 热力图
  const heatmapQuery = useQuery({
    queryKey: ["studentActivityHeatmap", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityHeatmap({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  // 房间使用
  const roomQuery = useQuery({
    queryKey: ["studentActivityRoomUsage", groupName, startTime, endTime],
    queryFn: () => fetchStudentActivityRoomUsage({ groupName, startTime, endTime }),
    enabled: groupName.length > 0,
  });

  const exportCSV = useCallback(() => { /* 保留现有逻辑 */ }, [members, groupName, startTime, endTime]);

  const handleGroupChange = (name: string) => {
    setGroupName(name);
    // 不清空 page——由搜索触发时才切换 page
  };

  return (
    <div className="space-y-4">
      <ActivityFilterBar
        groupName={groupName}
        groupPage={groupPage}
        groupTotal={groupTotal}
        onGroupChange={handleGroupChange}
        onGroupPageChange={(p) => { setGroupPage(p); setGroupName(""); }}
        startTime={startTime}
        endTime={endTime}
        onTimeChange={(s, e) => { setStartTime(s); setEndTime(e); setGroupPage(1); setMemberPage(1); }}
        onExportCSV={exportCSV}
      />

      {groupName ? (
        <>
          {/* KPI Cards — 标题带时间范围 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AdminFormCard title={`课题组人数（${timeLabel}）`}>
              <p className="text-2xl font-extrabold text-violet-600">{summary?.memberCount ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`总进出次数（${timeLabel}）`}>
              <p className="text-2xl font-extrabold text-emerald-600">{summary?.totalEntries ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`人均周频次（${timeLabel}）`}>
              <p className="text-2xl font-extrabold text-blue-600">{summary?.perCapitaWeeklyFreq ?? "-"}</p>
            </AdminFormCard>
            <AdminFormCard title={`近期活跃度占比（${timeLabel}）`}>
              <p className="text-2xl font-extrabold text-amber-600">{summary?.activeSharePct != null ? `${summary.activeSharePct}%` : "-"}</p>
            </AdminFormCard>
          </div>

          {/* 成员表 */}
          <ActivityMemberTable
            members={members}
            sortBy={sortBy}
            order={order}
            onSort={handleSort}
            loading={membersQuery.isLoading}
            page={memberPage}
            total={memberTotal}
            size={memberSize}
            onPageChange={setMemberPage}
            onSizeChange={setMemberSize}
          />

          {/* 双图表 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AdminFormCard title="进出时段热力图">
              <ActivityHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
            </AdminFormCard>
            <AdminFormCard title="该课题组喜好进出房间">
              <ActivityRoomChart data={roomQuery.data ?? []} loading={roomQuery.isLoading} />
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
git commit -m "feat: parameterized KPI titles, room chart, group pagination integration"
```

---

### Task 8: 前端 — ActivityMemberTable 新增列 + ActivityRoomChart 新组件

**Files:**
- Modify: `frontend/src/features/analytics/components/ActivityMemberTable.tsx`
- Create: `frontend/src/features/analytics/components/ActivityRoomChart.tsx`

- [ ] **Step 1: 修改 SortKey 类型 + 新增经验等级列**

```tsx
// ActivityMemberTable.tsx

export type SortKey = "entries" | "totalDurationMinutes" | "weeklyAvgFreq" | "lastActiveDate";

// 表头新增列
<th className="px-3 py-3 text-left">姓名</th>
<th className="px-3 py-3 text-left">经验等级</th>  {/* 新增 */}
<th className="px-3 py-3 text-left cursor-pointer ..." onClick={() => onSort("entries")}>
  进出次数 <SortArrow col="entries" />
</th>
<th className="px-3 py-3 text-left cursor-pointer ..." onClick={() => onSort("totalDurationMinutes")}>
  总时长 <SortArrow col="totalDurationMinutes" />
</th>
<th className="px-3 py-3 text-left cursor-pointer ..." onClick={() => onSort("weeklyAvgFreq")}>
  周均频次 <SortArrow col="weeklyAvgFreq" />  {/* 曾：日均频次 */}
</th>
<th className="px-3 py-3 text-left cursor-pointer ..." onClick={() => onSort("lastActiveDate")}>
  最近活跃 <SortArrow col="lastActiveDate" />
</th>

// 行数据渲染
<td className="px-3 py-2.5 font-medium text-neutral-900">{m.userName}</td>
<td className="px-3 py-2.5 font-mono text-violet-600">{m.experienceLevel}</td>
<td className="px-3 py-2.5 font-mono font-semibold text-violet-700">{m.entryCount}</td>
<td className="px-3 py-2.5 font-mono text-neutral-700">{formatDuration(m.totalDurationMinutes)}</td>
<td className="px-3 py-2.5 font-mono text-neutral-700">{m.weeklyAvgFreq}</td>
{/* ... */}
```

- [ ] **Step 2: 创建 ActivityRoomChart 组件**

```tsx
// frontend/src/features/analytics/components/ActivityRoomChart.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { RoomUsageItem } from "@/api/domains/analytics.api";

const ROOM_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899",
  "#f97316", "#14b8a6", "#ef4444", "#3b82f6", "#a855f7", "#22c55e",
];

type Props = { data: RoomUsageItem[]; loading?: boolean };

export function ActivityRoomChart({ data, loading }: Props) {
  if (loading) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">加载中…</div>;
  if (data.length === 0) return <div className="flex h-[240px] items-center justify-center text-sm text-neutral-400">暂无房间数据</div>;

  const chartData = data.slice(0, 20); // 最多显示前 20 房间

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="roomName" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
          <Bar dataKey="entryCount" name="进出次数" maxBarSize={32} radius={[4, 4, 0, 0]}>
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={ROOM_COLORS[idx % ROOM_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/analytics/components/ActivityMemberTable.tsx \
        frontend/src/features/analytics/components/ActivityRoomChart.tsx
git commit -m "feat: experience level column + weekly freq, new ActivityRoomChart component"
```

---

### Task 9: 前端 — DebugPersonnelPage 搜索分页修复

**Files:**
- Modify: `frontend/src/pages/DebugPersonnelPage.tsx`

- [ ] **Step 1: 修复搜索模式下的分页逻辑**

```tsx
// DebugPersonnelPage.tsx 关键修改

const [searchPage, setSearchPage] = useState(1);
const [searchTotal, setSearchTotal] = useState(0);
const SEARCH_PAGE_SIZE = 24;

const handleSearch = async (keyword: string) => {
  if (!keyword.trim()) {
    setIsSearching(false);
    setSearchResults([]);
    setSearchTotal(0);
    setSearchPage(1);
    return;
  }
  setIsSearching(true);
  setSearchPage(1);
  try {
    const res = await searchPersonnel(keyword.trim(), 1, SEARCH_PAGE_SIZE);
    setSearchResults(
      (res.data || []).map((row: any) => toPersonRow(row as Record<string, unknown>)),
    );
    setSearchTotal(res.total ?? 0);
  } catch (error) {
    console.error("人员搜索失败", error);
  }
};

// 搜索翻页
const handleSearchPageChange = async (newPage: number) => {
  if (!searchDraft.trim()) return;
  setSearchPage(newPage);
  try {
    const res = await searchPersonnel(searchDraft.trim(), newPage, SEARCH_PAGE_SIZE);
    setSearchResults(
      (res.data || []).map((row: any) => toPersonRow(row as Record<string, unknown>)),
    );
    setSearchTotal(res.total ?? 0);
  } catch (error) {
    console.error("搜索翻页失败", error);
  }
};

// 搜索模式下的 displayData
const displayData: Record<string, unknown>[] = isSearching
  ? searchResults
  : (data?.data ?? []).map(toPersonRow);

// 搜索模式下的总页数
const searchTotalPages = searchTotal > 0 ? Math.ceil(searchTotal / SEARCH_PAGE_SIZE) : 0;

// 翻页控件 — 搜索模式下启用
{isSearching ? (
  <>
    <button disabled={searchPage <= 1} onClick={() => handleSearchPageChange(searchPage - 1)}>◀</button>
    <span>{`第 ${searchPage} / ${searchTotalPages || 1} 页`}</span>
    <button disabled={searchPage >= searchTotalPages || searchTotalPages === 0}
            onClick={() => handleSearchPageChange(searchPage + 1)}>▶</button>
  </>
) : (
  <> {/* 原有翻页控件 */} </>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/DebugPersonnelPage.tsx
git commit -m "fix: personnel search pagination — search results now pageable"
```

---

### Task 10: 端到端验证

- [ ] **Step 1: 启动后端并验证新接口**

```bash
# 启动 Spring Boot 后端
# 测试 groups 接口：
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/v1/analytics/student-activity/groups?startTime=2026-05-01+00:00:00&endTime=2026-06-02+23:59:59&page=1&size=1"
# 预期返回: { code:0, data: { groups:[{name, campus, memberCount, totalEntries, perCapitaWeeklyFreq, activeSharePct}], total:N, page:1, size:1 } }

# 测试 summary 接口
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/v1/analytics/student-activity/summary?groupName=神经科学组&startTime=...&endTime=..."
# 预期返回: { code:0, data: { memberCount, totalEntries, perCapitaWeeklyFreq, activeSharePct, campus, timeLabel } }

# 测试 room-usage 接口
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/api/v1/analytics/student-activity/room-usage?groupName=神经科学组&startTime=...&endTime=..."
# 预期返回: { code:0, data: [{roomName, entryCount}, ...] }
```

- [ ] **Step 2: 前端编译无 TS 错误**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
# 预期: 无新增 TS 错误（可能有预存 warnings）
```

- [ ] **Step 3: 功能回归检查**

手动验证：
1. 打开统计与审计 → 学生活跃度
2. 课题组翻页器可用，默认显示活跃度最高的组
3. 搜索框输入后可正常删除文字
4. KPI 卡片标题带时间范围后缀
5. 成员表显示经验等级列 + 周均频次
6. 右侧图表为房间柱状图（非每日趋势）
7. 导出按钮在搜索栏右侧
8. 人员数据库搜索后能正常翻页

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: student activity redesign — campus-aware ranking, room chart, personnel pagination fix"
```

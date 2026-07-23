package com.example.demo.modules.twin.scan.service;

import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.llm.service.LlmConfigService;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.scan.dto.ScanAssistantContextPackage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 刷卡助手上下文数据包构建服务。
 * 聚合 analyze 快照 + aro_access_log 统计 + 大屏汇总，输出结构化 {@link ScanAssistantContextPackage}。
 */
@Service
public class ScanAssistantContextService {

    private static final Logger log = LoggerFactory.getLogger(ScanAssistantContextService.class);
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final JdbcTemplate jdbcTemplate;
    private final BusinessTimeWindow businessTimeWindow;
    private final TwinDashboardMapper dashboardMapper;
    private final LlmConfigService llmConfigService;
    private final ObjectMapper objectMapper;

    public ScanAssistantContextService(
            JdbcTemplate jdbcTemplate,
            BusinessTimeWindow businessTimeWindow,
            TwinDashboardMapper dashboardMapper,
            LlmConfigService llmConfigService,
            ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.businessTimeWindow = businessTimeWindow;
        this.dashboardMapper = dashboardMapper;
        this.llmConfigService = llmConfigService;
        this.objectMapper = objectMapper;
    }

    /**
     * 根据刷卡场景与 analyze 快照构建完整数据包。
     *
     * @param scenario welcome | alert | info
     * @param snapshot 前端 compact context（name、userId、rooms、违规等）
     */
    public ScanAssistantContextPackage build(String scenario, Map<String, Object> snapshot) {
        Map<String, Object> ctx = snapshot != null ? snapshot : Map.of();
        String normalizedScenario = normalizeScenario(scenario);
        String todayStart = businessTimeWindow.todayWindow().startInclusive();
        LocalDateTime now = LocalDateTime.now(businessTimeWindow.getZoneId());

        ScanAssistantContextPackage pkg = new ScanAssistantContextPackage();
        pkg.setScenario(normalizedScenario);
        pkg.setGeneratedAt(now.format(DATETIME_FMT));
        pkg.setPerson(buildPerson(ctx));
        pkg.setAccess(buildAccess(ctx, todayStart));
        pkg.setRooms(buildRooms(ctx));
        pkg.setNotices(buildNotices(ctx));
        pkg.setFacility(buildFacility(todayStart));
        pkg.setTemporal(buildTemporal(now, todayStart));
        pkg.setPromptHints(buildPromptHints(normalizedScenario));
        return pkg;
    }

    /** 空闲主动播报：仅 facility + temporal + promptHints */
    public ScanAssistantContextPackage buildProactive() {
        String todayStart = businessTimeWindow.todayWindow().startInclusive();
        LocalDateTime now = LocalDateTime.now(businessTimeWindow.getZoneId());

        ScanAssistantContextPackage pkg = new ScanAssistantContextPackage();
        pkg.setScenario("info");
        pkg.setGeneratedAt(now.format(DATETIME_FMT));
        pkg.setFacility(buildFacility(todayStart));
        pkg.setTemporal(buildTemporal(now, todayStart));
        pkg.setPromptHints(buildPromptHints("info"));
        return pkg;
    }

    /** 转为 LLM user prompt 注入用的扁平 map（保留结构化包 JSON 语义） */
    public Map<String, Object> toPromptMap(ScanAssistantContextPackage pkg) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (pkg == null) {
            return out;
        }
        out.put("scenario", pkg.getScenario());
        out.put("generatedAt", pkg.getGeneratedAt());
        if (pkg.getPerson() != null) {
            out.put("person", pkg.getPerson());
        }
        if (pkg.getAccess() != null) {
            out.put("access", pkg.getAccess());
        }
        if (pkg.getRooms() != null) {
            out.put("rooms", pkg.getRooms());
        }
        if (pkg.getNotices() != null) {
            out.put("notices", pkg.getNotices());
        }
        if (pkg.getFacility() != null) {
            out.put("facility", pkg.getFacility());
        }
        if (pkg.getTemporal() != null) {
            out.put("temporal", pkg.getTemporal());
        }
        if (pkg.getPromptHints() != null) {
            out.put("promptHints", pkg.getPromptHints());
        }
        return out;
    }

    // ---- section builders ----

    private ScanAssistantContextPackage.PersonSection buildPerson(Map<String, Object> ctx) {
        ScanAssistantContextPackage.PersonSection person = new ScanAssistantContextPackage.PersonSection();
        person.setUserId(stringVal(ctx.get("userId")));
        person.setName(stringVal(ctx.get("name")));
        person.setRole(firstNonBlank(stringVal(ctx.get("role")), stringVal(ctx.get("userTypeNames"))));
        person.setDepartment(stringVal(ctx.get("department")));
        person.setProjectGroup(firstNonBlank(
                stringVal(ctx.get("projectGroup")),
                stringVal(ctx.get("project_group_name"))));
        person.setGroup(stringVal(ctx.get("group")));
        Object rpgLevel = ctx.get("rpgLevel");
        if (rpgLevel instanceof Number n) {
            person.setRpgLevel(n.intValue());
        }
        if (!hasAnyText(person.getUserId(), person.getName(), person.getGroup())) {
            return person;
        }
        return person;
    }

    private ScanAssistantContextPackage.AccessSection buildAccess(Map<String, Object> ctx, String todayStart) {
        ScanAssistantContextPackage.AccessSection access = new ScanAssistantContextPackage.AccessSection();
        String userId = stringVal(ctx.get("userId"));
        String currentState = stringVal(ctx.get("currentState"));
        boolean enterLocked = Boolean.TRUE.equals(ctx.get("enterLocked"));
        Boolean entryAllowed = ctx.get("scanPopupEntryAllowedNow") instanceof Boolean b ? b : null;

        access.setCurrentState(currentState);
        access.setAction(inferAction(currentState, enterLocked, entryAllowed));
        access.setGlobalUserState(intVal(ctx.get("globalUserState")));
        access.setHasPhysicalCardMapping(boolVal(ctx.get("hasPhysicalCardMapping")));
        access.setScanPopupEntryAllowedNow(entryAllowed);

        if (StringUtils.hasText(userId)) {
            int personEntries = countPersonEntriesToday(userId, todayStart);
            int personScans = countPersonScansToday(userId, todayStart);
            access.setTodayEntryCount(personEntries);
            access.setTodayScanCount(personScans);
            access.setIsFirstEntryToday(personEntries == 0);
            access.setTodayEntryRank(computeTodayEntryRank(userId, todayStart, personEntries));

            String gap = computeLastVisitGap(userId, todayStart);
            if (StringUtils.hasText(gap)) {
                access.setLastVisitGap(gap);
            }
            int minutes = estimatePersonTodayMinutes(personScans);
            if (minutes > 0) {
                access.setPersonTodayMinutes(minutes);
            }
        }
        return access;
    }

    private ScanAssistantContextPackage.RoomsSection buildRooms(Map<String, Object> ctx) {
        ScanAssistantContextPackage.RoomsSection rooms = new ScanAssistantContextPackage.RoomsSection();
        rooms.setPrimaryRoom(stringVal(ctx.get("primaryRoom")));

        List<String> allowed = splitRoomNames(ctx.get("allowedRoomNames"), ctx.get("roomNames"));
        List<String> pending = splitRoomNames(ctx.get("pendingRoomNames"), null);
        if (allowed.isEmpty() && StringUtils.hasText(stringVal(ctx.get("roomNames")))) {
            allowed = splitRoomNames(null, ctx.get("roomNames"));
        }
        rooms.setAllowedRoomNames(allowed.isEmpty() ? null : allowed);
        rooms.setPendingRoomNames(pending.isEmpty() ? null : pending);
        rooms.setAllowedCount(allowed.isEmpty() ? null : allowed.size());
        rooms.setPendingCount(pending.isEmpty() ? null : pending.size());

        String state = stringVal(ctx.get("currentState"));
        rooms.setCurrentInside("INSIDE".equalsIgnoreCase(state));
        return rooms;
    }

    private ScanAssistantContextPackage.NoticesSection buildNotices(Map<String, Object> ctx) {
        ScanAssistantContextPackage.NoticesSection notices = new ScanAssistantContextPackage.NoticesSection();
        notices.setViolationTitle(stringVal(ctx.get("violationTitle")));
        notices.setViolationEnterLocked(boolVal(ctx.get("violationEnterLocked")));
        notices.setViolationRemainingAllowance(intVal(ctx.get("violationRemainingAllowance")));
        notices.setViolationRuleName(stringVal(ctx.get("violationRuleName")));
        notices.setUnboundNotice(stringVal(ctx.get("unboundNotice")));
        notices.setUnboundEnterLocked(boolVal(ctx.get("unboundEnterLocked")));

        Boolean entryAllowed = ctx.get("scanPopupEntryAllowedNow") instanceof Boolean b ? b : null;
        if (entryAllowed != null && !entryAllowed) {
            notices.setEntryWindowBlocked(true);
        } else if (Boolean.TRUE.equals(ctx.get("entryWindowBlocked"))) {
            notices.setEntryWindowBlocked(true);
        }
        return notices;
    }

    private ScanAssistantContextPackage.FacilitySection buildFacility(String todayStart) {
        ScanAssistantContextPackage.FacilitySection facility = new ScanAssistantContextPackage.FacilitySection();
        int totalEntries = countTodayEntries(todayStart);
        int totalScans = countTodayScans(todayStart);
        int online = estimateOnlineCount(todayStart);

        if (totalEntries > 0) {
            facility.setTodayTotalEntries(totalEntries);
        }
        if (totalScans > 0) {
            facility.setTodayTotalScans(totalScans);
        }
        if (online > 0) {
            facility.setActiveInsideCount(online);
        }
        try {
            Integer pd = dashboardMapper.getDailyTotalCountByArea(todayStart, "浦东");
            Integer px = dashboardMapper.getDailyTotalCountByArea(todayStart, "浦西");
            if (pd != null && pd > 0) {
                facility.setPudongEntries(pd);
            }
            if (px != null && px > 0) {
                facility.setPuxiEntries(px);
            }
        } catch (Exception e) {
            log.debug("[scan-assistant] area entry counts failed: {}", e.getMessage());
        }
        return facility;
    }

    private ScanAssistantContextPackage.TemporalSection buildTemporal(LocalDateTime now, String todayStart) {
        ScanAssistantContextPackage.TemporalSection temporal = new ScanAssistantContextPackage.TemporalSection();
        temporal.setTimeOfDay(timeOfDay(now.getHour()));
        temporal.setDayOfWeek(dayOfWeekZh(now.getDayOfWeek()));
        temporal.setBusinessDayStart(todayStart);
        return temporal;
    }

    private ScanAssistantContextPackage.PromptHintsSection buildPromptHints(String scenario) {
        ScanAssistantContextPackage.PromptHintsSection hints = new ScanAssistantContextPackage.PromptHintsSection();
        hints.setTone(scenarioTone(scenario));
        hints.setMaxSentences(2);
        return hints;
    }

    // ---- DB stats ----

    private int countTodayEntries(String todayStart) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM aro_access_log WHERE create_time >= ? AND accessType = 1",
                    Integer.class,
                    todayStart);
            return cnt != null ? cnt : 0;
        } catch (Exception e) {
            log.debug("[scan-assistant] countTodayEntries failed: {}", e.getMessage());
            return 0;
        }
    }

    private int countTodayScans(String todayStart) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM aro_access_log WHERE create_time >= ?",
                    Integer.class,
                    todayStart);
            return cnt != null ? cnt : 0;
        } catch (Exception e) {
            log.debug("[scan-assistant] countTodayScans failed: {}", e.getMessage());
            return 0;
        }
    }

    private int countPersonEntriesToday(String userId, String todayStart) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM aro_access_log WHERE user_id = ? AND create_time >= ? AND accessType = 1",
                    Integer.class,
                    userId,
                    todayStart);
            return cnt != null ? cnt : 0;
        } catch (Exception e) {
            log.debug("[scan-assistant] countPersonEntriesToday failed: {}", e.getMessage());
            return 0;
        }
    }

    private int countPersonScansToday(String userId, String todayStart) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM aro_access_log WHERE user_id = ? AND create_time >= ?",
                    Integer.class,
                    userId,
                    todayStart);
            return cnt != null ? cnt : 0;
        } catch (Exception e) {
            log.debug("[scan-assistant] countPersonScansToday failed: {}", e.getMessage());
            return 0;
        }
    }

    /**
     * 今日入场排名：按每人首次进入时间排序；尚未入场者为 distinct 入场人数 + 1。
     */
    private Integer computeTodayEntryRank(String userId, String todayStart, int personEntriesToday) {
        try {
            if (personEntriesToday == 0) {
                Integer distinct = jdbcTemplate.queryForObject(
                        """
                                SELECT COUNT(DISTINCT user_id) FROM aro_access_log
                                WHERE create_time >= ? AND accessType = 1
                                  AND user_id IS NOT NULL AND user_id != ''
                                """,
                        Integer.class,
                        todayStart);
                return (distinct != null ? distinct : 0) + 1;
            }
            Integer rank = jdbcTemplate.queryForObject(
                    """
                            SELECT rn FROM (
                                SELECT user_id, ROW_NUMBER() OVER (ORDER BY MIN(id)) AS rn
                                FROM aro_access_log
                                WHERE create_time >= ? AND accessType = 1
                                  AND user_id IS NOT NULL AND user_id != ''
                                GROUP BY user_id
                            ) ranked WHERE user_id = ?
                            """,
                    Integer.class,
                    todayStart,
                    userId);
            return rank;
        } catch (Exception e) {
            log.debug("[scan-assistant] computeTodayEntryRank failed: {}", e.getMessage());
            return null;
        }
    }

    private int estimateOnlineCount(String todayStart) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(1) FROM (
                                SELECT al.user_id, al.accessType
                                FROM aro_access_log al
                                INNER JOIN (
                                    SELECT user_id, MAX(id) AS max_id
                                    FROM aro_access_log
                                    WHERE create_time >= ?
                                    GROUP BY user_id
                                ) latest ON al.id = latest.max_id
                                WHERE al.accessType != 2
                            ) t
                            """,
                    Integer.class,
                    todayStart);
            return cnt != null ? cnt : 0;
        } catch (Exception e) {
            log.debug("[scan-assistant] estimateOnlineCount failed: {}", e.getMessage());
            return 0;
        }
    }

    private String computeLastVisitGap(String userId, String todayStart) {
        try {
            String lastTime = jdbcTemplate.query(
                    """
                            SELECT create_time FROM aro_access_log
                            WHERE user_id = ? AND create_time < ?
                            ORDER BY id DESC LIMIT 1
                            """,
                    rs -> rs.next() ? rs.getString(1) : null,
                    userId,
                    todayStart);
            if (!StringUtils.hasText(lastTime)) {
                return "";
            }
            return "上次记录: " + lastTime;
        } catch (Exception e) {
            log.debug("[scan-assistant] computeLastVisitGap failed: {}", e.getMessage());
            return "";
        }
    }

    private static int estimatePersonTodayMinutes(int scanCount) {
        return scanCount > 0 ? scanCount * 5 : 0;
    }

    // ---- helpers ----

    private static String inferAction(String currentState, boolean enterLocked, Boolean entryAllowed) {
        if (enterLocked || Boolean.FALSE.equals(entryAllowed)) {
            return "blocked";
        }
        if ("INSIDE".equalsIgnoreCase(currentState)) {
            return "stay";
        }
        if ("OUTSIDE".equalsIgnoreCase(currentState)) {
            return "enter";
        }
        return "enter";
    }

    private static String normalizeScenario(String scenario) {
        if (!StringUtils.hasText(scenario)) {
            return "welcome";
        }
        return switch (scenario.trim().toLowerCase(Locale.ROOT)) {
            case "alert", "info" -> scenario.trim().toLowerCase(Locale.ROOT);
            default -> "welcome";
        };
    }

    private static String timeOfDay(int hour) {
        if (hour >= 5 && hour < 12) {
            return "morning";
        }
        if (hour >= 12 && hour < 18) {
            return "afternoon";
        }
        if (hour >= 18 && hour < 22) {
            return "evening";
        }
        return "night";
    }

    private static String dayOfWeekZh(DayOfWeek dow) {
        return switch (dow) {
            case MONDAY -> "周一";
            case TUESDAY -> "周二";
            case WEDNESDAY -> "周三";
            case THURSDAY -> "周四";
            case FRIDAY -> "周五";
            case SATURDAY -> "周六";
            case SUNDAY -> "周日";
        };
    }

    private static String scenarioTone(String scenario) {
        return switch (scenario) {
            case "alert" -> "firm";
            case "info" -> "neutral";
            default -> "warm";
        };
    }

    @SuppressWarnings("unchecked")
    private static List<String> splitRoomNames(Object listVal, Object joinedVal) {
        List<String> out = new ArrayList<>();
        if (listVal instanceof List<?> list) {
            for (Object item : list) {
                String s = stringVal(item);
                if (StringUtils.hasText(s)) {
                    out.add(s);
                }
            }
        }
        if (out.isEmpty() && joinedVal != null) {
            String raw = stringVal(joinedVal);
            if (StringUtils.hasText(raw)) {
                Arrays.stream(raw.split("[、,，;；|]"))
                        .map(String::trim)
                        .filter(StringUtils::hasText)
                        .forEach(out::add);
            }
        }
        return out;
    }

    private static String stringVal(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static Integer intVal(Object value) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        if (value != null && StringUtils.hasText(String.valueOf(value))) {
            try {
                return Integer.parseInt(String.valueOf(value).trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static Boolean boolVal(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value == null) {
            return null;
        }
        return "true".equalsIgnoreCase(String.valueOf(value).trim());
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String v : values) {
            if (StringUtils.hasText(v)) {
                return v.trim();
            }
        }
        return "";
    }

    private static boolean hasAnyText(String... values) {
        for (String v : values) {
            if (StringUtils.hasText(v)) {
                return true;
            }
        }
        return false;
    }

    /** 场景 user prompt 模板（llm.assistant.prompt.*） */
    public String resolveScenarioUserPrompt(String scenario, ScanAssistantContextPackage pkg) {
        String normalized = normalizeScenario(scenario);
        String template = switch (normalized) {
            case "alert" -> llmConfigService.getAssistantPromptAlert();
            case "info" -> llmConfigService.getAssistantPromptInfo();
            default -> llmConfigService.getAssistantPromptWelcome();
        };
        if (!StringUtils.hasText(template)) {
            template = defaultScenarioTemplate(normalized);
        }
        return template
                + "\n\n上下文数据包 JSON：\n"
                + safeJson(toPromptMap(pkg));
    }

    private String defaultScenarioTemplate(String scenario) {
        return switch (scenario) {
            case "alert" ->
                    """
                    你是实验室门禁智能助手。根据下方实时数据包生成 1 句简短警示播报（≤35 字），直接对刷卡人说话。
                    ⚠️ 用户的持久画像（课题组、经验等级、行为模式）已在系统提示中提供，请勿重复提及。
                    规则（按优先级）：
                    1. 若 notices.violationTitle 非空，直接点明违规类型，语气严肃
                    2. 若 notices.violationEnterLocked 为 true，说「暂不可进入」并告知剩余次数（notices.violationRemainingAllowance）
                    3. 若 notices.unboundNotice 非空，提醒未绑卡
                    4. 若 notices.entryWindowBlocked 为 true，说明当前不在准入时段
                    只输出播报正文，不要引号、前缀或解释。""";
            case "info" ->
                    """
                    你是实验室门禁智能助手。根据下方实时数据包生成 1 句平实告知播报（≤35 字），直接对刷卡人说话。
                    ⚠️ 用户的持久画像已在系统提示中提供，这里只使用实时变化的数据。
                    实时可用字段：access.currentState（当前在场状态）、rooms（房间权限）、facility.activeInsideCount（当前馆内人数）。
                    信息量控制在 1 个要点，语气平实。只输出播报正文。""";
            default ->
                    """
                    你是实验室门禁智能助手。系统提示中的「持久画像」已经提供了 {name} 的完整人物侧写（课题组、经验等级、行为习惯、同伴等），你的任务是把这份侧写自然地讲出来。

                    下方是此刻的实时快照数据（时段、今日入场排名、馆内人数等），你可以把它们作为点缀融入对话，比如「这个时间点过来」「今天馆里人不多」之类的随口一提，但不要喧宾夺主。

                    核心输出规则：
                    - 以系统提示中的持久画像为主体，像实验室同学碰面寒暄一样自然地说出来
                    - 行为习惯（常去房间、驻留时长）比身份标签（课题组、部门）更有辨识度，优先展开
                    - 实时数据只做点缀，不超过整段对话的 1/4
                    - 口语中文，3～5 句，自然温暖，不模板化
                    - 禁止「您好用户」「尊敬的」、列表、markdown
                    只输出播报正文。""";
        };
    }

    private String safeJson(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            return String.valueOf(map);
        }
    }
}

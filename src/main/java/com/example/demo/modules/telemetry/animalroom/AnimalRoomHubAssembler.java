package com.example.demo.modules.telemetry.animalroom;

import com.example.demo.modules.telemetry.animalroom.dto.*;
import com.example.demo.modules.telemetry.animalroom.layout.FacilityLayoutRulebook;
import com.example.demo.modules.telemetry.service.TelemetryFacilityLayoutRulesService;
import com.example.demo.modules.telemetry.dto.TelemetrySnapshotDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import com.example.demo.modules.telemetry.dto.TelemetryWinccDockPollConfigDto;
import com.example.demo.modules.telemetry.util.WinccLimitVariableNaming;
import com.example.demo.modules.twin.dto.RoomDashboardRenderDTO;
import com.example.demo.modules.twin.service.TwinDashboardAggregationService;
import org.springframework.stereotype.Service;

import java.text.Collator;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 动物房 Hub：WinCC 快照 + 结构化温湿度视图 + 运行状态房间列表；
 * Web 与微信小程序同源，与 frontend/src/telemetry-view 语义对齐（服务端为权威）。
 */
@Service
public class AnimalRoomHubAssembler {

    private final TwinDashboardAggregationService twinDashboardAggregationService;
    private final TelemetryFacilityLayoutRulesService facilityLayoutRules;
    private final ThreadLocal<FacilityLayoutRulebook> rulebook = new ThreadLocal<>();

    public AnimalRoomHubAssembler(TwinDashboardAggregationService twinDashboardAggregationService,
                                    TelemetryFacilityLayoutRulesService facilityLayoutRules) {
        this.twinDashboardAggregationService = twinDashboardAggregationService;
        this.facilityLayoutRules = facilityLayoutRules;
    }

    private FacilityLayoutRulebook rb() {
        FacilityLayoutRulebook b = rulebook.get();
        if (b == null) {
            return facilityLayoutRules.getRulebook();
        }
        return b;
    }

    private static final int SOLO_GRID_GAP_PX = 8;
    /** 与 Web {@code SOLO_BALANCED_GRID_MAX_COLS} */
    private static final int SOLO_BALANCED_GRID_MAX_COLS = 6;
    /** 与 Web {@code ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW}：宽屏单间区固定三列分行 */
    private static final int ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW = 3;
    /** 单间仅 1 个测点：label 为空，前端/小程序不展示分区标题 */
    private static final String SOLO_PARTITION_LABEL_SINGLE_METRIC = "";
    private static final List<String> SOLO_PARTITION_LABEL_ORDER = List.of(
            "单间 · 三项参数", "单间 · 两项参数", SOLO_PARTITION_LABEL_SINGLE_METRIC, "单间 · 其他项数");
    private static final Pattern SUITE_SUFFIX = Pattern.compile("(\\d+)([A-Za-z]+)$");
    /** 与 Web standardSuiteRoomSegment：仅用于跳过开头的楼层 token；标准层套间分组在 {@link #isSuiteConceptFloor} 为真时才用本段后的房间码 */
    private static final Pattern LEADING_FLOOR_TOKEN = Pattern.compile("^(?:\\d+F|B\\d*F|M\\d+F)$", Pattern.CASE_INSENSITIVE);
    /** 地上标准层分页签（纯数字+F），与 Web {@code /^\d+F$/} 一致 */
    private static final Pattern NUMERIC_STANDARD_FLOOR_TAB_KEY = Pattern.compile("^\\d+F$");
    private static final String DEFAULT_PLANE_ZONE_KEY = "__default__";
    /**
     * 地下室 E 区硬编码：仅在 {@link #basementHardZoneFromRoomCanonical} 中按房间编号分段匹配，
     * 顺序须先长后短（E11A 先于 E10），避免歧义。
     */
    private static final List<String> BASEMENT_HARD_ZONE_CODES = List.of("E11A", "E11B", "E11C", "E10");
    /** B1F 平面区带展示顺序：E10 → E11A → E11B → E11C；区内再按单间三项/两项参数分桶 */
    private static final List<String> BASEMENT_E_PLANE_ZONE_ORDER = List.of("E10", "E11A", "E11B", "E11C");

    private static final Collator CN_COLLATOR = Collator.getInstance(Locale.CHINA);

    /** 房间卡片展示：去掉规范编号前「套间· / 套间 ·」前缀，与 Web stripLeadingSuitePrefixFromRoomDisplay 一致 */
    private static final Pattern LEADING_SUITE_DISPLAY_PREFIX =
            Pattern.compile("^套间\\s*[\\u00B7•]\\s*");

    /** 套间块标题：去掉行首「套间」+ 可选分隔符，与 Web stripSuiteTitlePrefixForDisplay 一致 */
    private static final Pattern SUITE_TITLE_DISPLAY_PREFIX =
            Pattern.compile("^套间\\s*(?:[\\u00B7•]\\s*)?");

    private static String stripLeadingSuitePrefixFromRoomDisplay(String roomCanonical) {
        if (roomCanonical == null) return "";
        String s = roomCanonical.trim();
        if (s.isEmpty()) return s;
        String stripped = LEADING_SUITE_DISPLAY_PREFIX.matcher(s).replaceFirst("").trim();
        return stripped.isEmpty() ? s : stripped;
    }

    private int compareMetricsInFacilityRoom(MpMetricSlotDto a, MpMetricSlotDto b) {
        return rb().compareMetricsInFacilityRoom(a, b);
    }

    private static boolean isStatusMetricKind(TelemetryTagItemDto it) {
        String mk = it.getMetricKindCode();
        if (mk != null && "STATUS".equalsIgnoreCase(mk.trim())) return true;
        String ml = it.getMetricKindLabel();
        return ml != null && "状态".equals(ml.trim());
    }

    /** 展示映射去掉尾部「·状态 / -状态 / 状态」等；与 Web stripTrailingStatusFromDisplayLabel 语义对齐 */
    private static String stripTrailingStatusFromDisplayLabel(String displayLabel) {
        if (displayLabel == null) return "";
        String s = displayLabel.trim();
        if (s.isEmpty()) return s;
        String[] suffixes = new String[] {
                "\u00b7\u72b6\u6001", "\u2022\u72b6\u6001", "-\u72b6\u6001", "_\u72b6\u6001",
                "/\u72b6\u6001", "\\\u72b6\u6001", "\u72b6\u6001",
        };
        for (String suf : suffixes) {
            if (s.endsWith(suf)) {
                s = s.substring(0, s.length() - suf.length()).trim();
                break;
            }
        }
        if (s.toUpperCase(Locale.ROOT).endsWith(" STATUS")) {
            s = s.substring(0, s.length() - " STATUS".length()).trim();
        }
        return s;
    }

    /**
     * 状态类测点卡片行展示名：映射房间名（与卡片 displayTitle 同源），替代「状态」；
     * 与 frontend statusMetricSlotDisplayLabel、小程序 statusMetricSlotDisplayLabelFromItemMp 对齐。
     */
    private static String statusMetricSlotDisplayLabel(TelemetryTagItemDto it) {
        String fromRc = stripLeadingSuitePrefixFromRoomDisplay(it.getRoomCanonical());
        if (fromRc != null && !fromRc.isBlank()) return fromRc;
        String fromDl = stripTrailingStatusFromDisplayLabel(it.getDisplayLabel());
        if (fromDl != null && !fromDl.isBlank()) return fromDl;
        if (it.getMetricKindLabel() != null && !it.getMetricKindLabel().isBlank()) return it.getMetricKindLabel().trim();
        String mk = it.getMetricKindCode();
        return (mk != null && !mk.isBlank()) ? mk.trim() : "状态";
    }

    private static String stripSuiteTitlePrefixForDisplay(String title) {
        if (title == null) return "";
        String s = title.trim();
        if (s.isEmpty()) return s;
        String stripped = SUITE_TITLE_DISPLAY_PREFIX.matcher(s).replaceFirst("").trim();
        return stripped.isEmpty() ? s : stripped;
    }

    /** 与 shared structuredTabs.normalizeFloorTabKey 一致：同层多 CSV 合并为一页 */
    private static String normalizeFloorTabKey(String floor) {
        if (floor == null) return "";
        String s = floor.trim();
        if (s.isEmpty()) return s;
        java.util.regex.Pattern pDigitsOnly = java.util.regex.Pattern.compile("^(\\d+)$");
        java.util.regex.Matcher mDig = pDigitsOnly.matcher(s);
        if (mDig.matches()) {
            return mDig.group(1) + "F";
        }
        java.util.regex.Pattern pCnLou = java.util.regex.Pattern.compile("^(\\d+)\\s*[层楼]\\s*$");
        java.util.regex.Matcher mCn = pCnLou.matcher(s);
        if (mCn.matches()) {
            return mCn.group(1) + "F";
        }
        String lower = s.toLowerCase(Locale.ROOT);
        java.util.regex.Pattern pNum = java.util.regex.Pattern.compile("^(\\d+)\\s*f\\s*$");
        java.util.regex.Matcher mNum = pNum.matcher(lower);
        if (mNum.matches()) return mNum.group(1) + "F";
        java.util.regex.Pattern pB = java.util.regex.Pattern.compile("^b(\\d*)\\s*f\\s*$");
        java.util.regex.Matcher mB = pB.matcher(lower);
        if (mB.matches()) return "B" + mB.group(1) + "F";
        java.util.regex.Pattern pM = java.util.regex.Pattern.compile("^m(\\d+)\\s*f\\s*$");
        java.util.regex.Matcher mM = pM.matcher(lower);
        if (mM.matches()) return "M" + mM.group(1) + "F";
        return s.toUpperCase(Locale.ROOT);
    }

    /** 地上标准层分页签 {@code \\d+F}（如 1F、12F）：末尾数字+字母合并套间（与 Web {@code isSuiteConceptFloor} 一致）；不含 B/M 前缀层 */
    private static boolean isSuiteConceptFloor(String tabKey) {
        if (tabKey == null) return false;
        String k = tabKey.trim().toUpperCase(Locale.ROOT);
        return NUMERIC_STANDARD_FLOOR_TAB_KEY.matcher(k).matches();
    }

    /** B1F/B2F 等地下室楼层键（纯楼层，不含区后缀） */
    private static boolean isBasementFloorTabKey(String tabKey) {
        if (tabKey == null) return false;
        return Pattern.compile("^B\\d*F$", Pattern.CASE_INSENSITIVE).matcher(tabKey.trim()).matches();
    }

    /** 地下室分页：{@code B1F} 或 {@code B1F-E10}，供 E 区解析与排序 */
    private static boolean isBasementFloorScopeTabKey(String tabKey) {
        if (tabKey == null) return false;
        String k = tabKey.trim();
        if (isBasementFloorTabKey(k)) return true;
        return Pattern.compile("^B\\d*F-[A-Za-z0-9]+$", Pattern.CASE_INSENSITIVE).matcher(k).matches();
    }

    /** 标签已为 {@code B1F-E10} 等单区页时不重复「区域 · E10」横条 */
    private static boolean tabImpliesSingleBasementZone(String tabKey, String zoneKey) {
        if (tabKey == null || zoneKey == null || DEFAULT_PLANE_ZONE_KEY.equals(zoneKey)) {
            return false;
        }
        String z = zoneKey.trim().toUpperCase(Locale.ROOT);
        String u = tabKey.trim().toUpperCase(Locale.ROOT);
        return u.endsWith("-" + z);
    }

    /**
     * 按房间规范编号 {@code roomCanonical} 硬分区：在按 {@code -}、{@code _} 切分的每一段上，
     * 若某段以 E10 / E11A / E11B / E11C 开头（且 E10 后不接数字，避免 E101 误判），则归入对应区。
     * 例如 {@code B1F-E10-120}、{@code E11A-B105}。
     */
    private static String basementHardZoneFromRoomCanonical(String roomCanonical) {
        if (roomCanonical == null || roomCanonical.isBlank()) {
            return null;
        }
        String u = roomCanonical.trim().toUpperCase(Locale.ROOT);
        for (String segment : u.split("[-_]")) {
            if (segment.isEmpty()) {
                continue;
            }
            for (String zone : BASEMENT_HARD_ZONE_CODES) {
                if (segmentMatchesBasementHardZone(segment, zone)) {
                    return zone;
                }
            }
        }
        return null;
    }

    /** true：段等于该区码，或以区码开头且后续不为「紧跟数字」（避免 E101 命中 E10） */
    private static boolean segmentMatchesBasementHardZone(String segmentUpper, String zone) {
        if (!segmentUpper.startsWith(zone)) {
            return false;
        }
        if (segmentUpper.length() == zone.length()) {
            return true;
        }
        char next = segmentUpper.charAt(zone.length());
        if (next == '-' || next == '_') {
            return true;
        }
        return !Character.isDigit(next);
    }

    private static int indexInBasementZoneOrder(String z) {
        if (z == null) return -1;
        String u = z.toUpperCase(Locale.ROOT);
        for (int i = 0; i < BASEMENT_E_PLANE_ZONE_ORDER.size(); i++) {
            if (BASEMENT_E_PLANE_ZONE_ORDER.get(i).equalsIgnoreCase(u)) {
                return i;
            }
        }
        return -1;
    }

    private static int compareZoneKeys(String a, String b) {
        int ra = DEFAULT_PLANE_ZONE_KEY.equals(a) ? -1 : ("其他".equals(a) ? 1 : 0);
        int rb = DEFAULT_PLANE_ZONE_KEY.equals(b) ? -1 : ("其他".equals(b) ? 1 : 0);
        if (ra != rb) return Integer.compare(ra, rb);
        int ia = indexInBasementZoneOrder(a);
        int ib = indexInBasementZoneOrder(b);
        boolean ca = ia >= 0;
        boolean cb = ib >= 0;
        if (ca && cb) return Integer.compare(ia, ib);
        if (ca) return -1;
        if (cb) return 1;
        return CN_COLLATOR.compare(a, b);
    }

    private static String zoneSortKeyForSuite(MpSuiteGroupDto suite) {
        if (suite.getRooms() == null || suite.getRooms().isEmpty()) return DEFAULT_PLANE_ZONE_KEY;
        if (!isBasementFloorScopeTabKey(suite.getTabKey())) return DEFAULT_PLANE_ZONE_KEY;
        MpRoomCardDto r0 = suite.getRooms().get(0);
        String rc = trimOr(r0.getRoomCanonical(), "");
        String z = basementHardZoneFromRoomCanonical(rc);
        return z != null ? z.toUpperCase(Locale.ROOT) : DEFAULT_PLANE_ZONE_KEY;
    }

    private static List<String> sortZoneKeyList(List<String> keys) {
        List<String> copy = new ArrayList<>(keys);
        copy.sort(AnimalRoomHubAssembler::compareZoneKeys);
        return copy;
    }

    public AnimalRoomHubDto assemble(TelemetrySnapshotDto snapshot,
                                     TelemetryWinccDockPollConfigDto dockPollConfig,
                                     int soloWidthPx,
                                     String campus,
                                     String hubClient) {
        rulebook.set(facilityLayoutRules.getRulebook());
        try {
            List<TelemetryTagItemDto> items = snapshot.getItems() == null ? List.of() : snapshot.getItems();
            List<FloorTab> tabs = buildStructuredFloorTabs(items);
            List<MpStructuredTabDto> out = new ArrayList<>();
            int w = Math.max(48, soloWidthPx);
            boolean webSwitchLayout = hubClient != null && "web".equalsIgnoreCase(hubClient.trim());
            for (FloorTab tab : tabs) {
                int roomCount = tab.suiteGroups.stream().mapToInt(s -> s.getRooms().size()).sum();
                out.add(MpStructuredTabDto.builder()
                        .tabKey(tab.tabKey)
                        .title(tab.title)
                        .roomCount(roomCount)
                        .suiteCount(tab.suiteGroups.size())
                        .viewChunks(buildViewChunks(tab, w, webSwitchLayout))
                        .build());
            }
            boolean serverAllowsRead = dockPollConfig == null || dockPollConfig.isScheduleEnabled();
            boolean gateAllowed = computeDockPollGateAllowed(dockPollConfig);
            boolean hasStruct = !out.isEmpty();
            boolean on = serverAllowsRead && gateAllowed && snapshot.isWinccEnabled()
                    && (hasStruct || !items.isEmpty());
            int sec = dockPollConfig != null ? dockPollConfig.getPollIntervalSeconds() : 60;
            Integer clientPoll = on ? Math.max(5000, sec * 1000) : null;
            List<RoomDashboardRenderDTO> running =
                    new ArrayList<>(twinDashboardAggregationService.getWechatMiniProgramData(campus));
            return AnimalRoomHubDto.builder()
                    .snapshot(snapshot)
                    .dockPollConfig(dockPollConfig)
                    .structuredTabs(out)
                    .clientPollIntervalMs(clientPoll)
                    .runningStatusRooms(running)
                    .build();
        } finally {
            rulebook.remove();
        }
    }

    private static int parseHmToMinutes(String s, String fallback) {
        String t = (s != null && s.length() >= 4 ? s : fallback).trim();
        if (t.length() > 5) t = t.substring(0, 5);
        String[] parts = t.split(":");
        int h = Integer.parseInt(parts[0].trim());
        int m = parts.length > 1 ? Integer.parseInt(parts[1].trim()) : 0;
        return h * 60 + m;
    }

    /** 与 Web computeDockPollGate 一致 */
    private static boolean computeDockPollGateAllowed(TelemetryWinccDockPollConfigDto cfg) {
        if (cfg == null) {
            return true;
        }
        java.time.LocalTime now = java.time.LocalTime.now();
        int nowMin = now.getHour() * 60 + now.getMinute();
        int start;
        int end;
        try {
            start = parseHmToMinutes(cfg.getScheduleStartTime(), "07:00");
        } catch (Exception e) {
            start = 7 * 60;
        }
        try {
            end = parseHmToMinutes(cfg.getScheduleEndTime(), "22:00");
        } catch (Exception e) {
            end = 22 * 60;
        }
        boolean inTimeWindow;
        if (end == start) {
            inTimeWindow = true;
        } else if (end > start) {
            inTimeWindow = nowMin >= start && nowMin <= end;
        } else {
            inTimeWindow = nowMin >= start || nowMin <= end;
        }
        String type = cfg.getScheduleType() == null ? "DAILY" : cfg.getScheduleType().toUpperCase(Locale.ROOT);
        boolean inWeekday = true;
        if ("WEEKLY".equals(type) && cfg.getWeekDays() != null && !cfg.getWeekDays().trim().isEmpty()) {
            Set<Integer> set = new HashSet<>();
            for (String x : cfg.getWeekDays().split(",")) {
                try {
                    int n = Integer.parseInt(x.trim());
                    if (n >= 1 && n <= 7) set.add(n);
                } catch (NumberFormatException ignored) {
                }
            }
            if (!set.isEmpty()) {
                int d = java.time.LocalDate.now().getDayOfWeek().getValue();
                int iso = d == 7 ? 7 : d;
                inWeekday = set.contains(iso);
            }
        }
        return inTimeWindow && inWeekday;
    }

    // --- 与 frontend/src/telemetry-view/roomGrouping 一致 ---
    static String normalizeRoomForGrouping(String room) {
        if (room == null) return "";
        String s = room.trim();
        if (s.isEmpty()) return s;
        return SUITE_SUFFIX.matcher(s).replaceFirst("$1");
    }

    /** 最后一个 {@code -} 后片段；无 {@code -} 则整段为房间号（与 Web localPartRoomCanonical 一致） */
    static String localPartRoom(String roomCanonical) {
        String r = roomCanonical == null ? "" : roomCanonical.trim();
        int dash = r.lastIndexOf('-');
        if (dash >= 0) {
            return r.substring(dash + 1).trim();
        }
        return r;
    }

    /**
     * 标准层套间：可选楼层前缀后的第一段房间码（与 Web {@code standardSuiteRoomSegment} 一致）。
     * B1F 等地下室套间归并键见 {@link #basementSuiteRoomSegment}。
     */
    static String standardSuiteRoomSegment(String roomCanonical) {
        String r = roomCanonical == null ? "" : roomCanonical.trim();
        if (r.isEmpty()) {
            return r;
        }
        List<String> parts = new ArrayList<>();
        for (String x : r.split("-")) {
            String t = x.trim();
            if (!t.isEmpty()) {
                parts.add(t);
            }
        }
        if (parts.isEmpty()) {
            return r;
        }
        int i = 0;
        if (LEADING_FLOOR_TOKEN.matcher(parts.get(0)).matches()) {
            i = 1;
        }
        if (i >= parts.size()) {
            return r;
        }
        return parts.get(i);
    }

    /** 单段是否为地下室硬编码区码（E10/E11A/…），用于跳过套间归并键前的区段 */
    private static boolean basementSegmentIsHardZoneOnly(String segmentTrimmed) {
        if (segmentTrimmed == null || segmentTrimmed.isBlank()) {
            return false;
        }
        String u = segmentTrimmed.trim().toUpperCase(Locale.ROOT);
        for (String zone : BASEMENT_HARD_ZONE_CODES) {
            if (segmentMatchesBasementHardZone(u, zone)) {
                return true;
            }
        }
        return false;
    }

    /**
     * B1F 等：跳过可选楼层 token（{@code B1F}）、再跳过连续区段（E10/E11A…），取下一房间码段后与标准层相同做 {@link #normalizeRoomForGrouping}。
     * 与 Web {@code basementSuiteRoomSegment} 一致。
     */
    static String basementSuiteRoomSegment(String roomCanonical) {
        String r = roomCanonical == null ? "" : roomCanonical.trim();
        if (r.isEmpty()) {
            return r;
        }
        List<String> parts = new ArrayList<>();
        for (String x : r.split("-")) {
            String t = x.trim();
            if (!t.isEmpty()) {
                parts.add(t);
            }
        }
        if (parts.isEmpty()) {
            return r;
        }
        int i = 0;
        if (LEADING_FLOOR_TOKEN.matcher(parts.get(0)).matches()) {
            i = 1;
        }
        while (i < parts.size() && basementSegmentIsHardZoneOnly(parts.get(i))) {
            i++;
        }
        if (i >= parts.size()) {
            return r;
        }
        return parts.get(i);
    }

    /** 基间（前室）：标准层用 {@link #standardSuiteRoomSegment}；B1F 范围页用 {@link #basementSuiteRoomSegment}；其余用末尾片段 */
    static boolean isBaseRoomCanonical(String roomCanonical, String tabKey) {
        String r = roomCanonical == null ? "" : roomCanonical.trim();
        if (r.isEmpty()) {
            return false;
        }
        String seg;
        if (isSuiteConceptFloor(tabKey)) {
            seg = standardSuiteRoomSegment(roomCanonical);
        } else if (isBasementFloorScopeTabKey(tabKey)) {
            seg = basementSuiteRoomSegment(roomCanonical);
        } else {
            seg = localPartRoom(roomCanonical);
        }
        return !seg.isEmpty() && seg.equals(normalizeRoomForGrouping(seg));
    }

    /** LIMIT_MIN / LIMIT_MAX 不入动物房结构化卡（限值并入主测量 DTO）。 */
    private static boolean isStructuredLimitRole(String kindRole) {
        if (kindRole == null || kindRole.isBlank()) {
            return false;
        }
        String u = kindRole.trim().toUpperCase(Locale.ROOT);
        return "LIMIT_MIN".equals(u) || "LIMIT_MAX".equals(u);
    }

    /** 具备楼层+房间+类别且非限值后缀（含 SWITCH，与其它指标一同进入套间分组）。 */
    private static boolean hasStructuredFields(TelemetryTagItemDto it) {
        if (WinccLimitVariableNaming.isLimitSuffixVariable(it.getVariableName())) {
            return false;
        }
        if (isStructuredLimitRole(it.getKindRole())) {
            return false;
        }
        return nz(it.getFloorCode()) && nz(it.getRoomCanonical()) && nz(it.getMetricKindCode());
    }

    /**
     * 小程序分块加载：与 {@link #buildStructuredFloorTabs} 分页签规则一致；不参与结构化卡片的测点返回 {@code null}。
     */
    public static String structuredTelemetryTabKeyForItem(TelemetryTagItemDto it) {
        if (!hasStructuredFields(it)) {
            return null;
        }
        String floorRaw = it.getFloorCode().trim();
        String baseTabKey = normalizeFloorTabKey(floorRaw);
        String rcRaw = it.getRoomCanonical().trim();
        String tabKey = baseTabKey;
        if (isBasementFloorTabKey(baseTabKey)) {
            String zone = basementHardZoneFromRoomCanonical(rcRaw);
            if (zone != null) {
                tabKey = baseTabKey + "-" + zone.toUpperCase(Locale.ROOT);
            }
        }
        return tabKey;
    }

    /** 供 GET /animal-room?telemetryTabKey= 过滤 tagItems，规则与 structuredTelemetryTabKeyForItem 一致。 */
    public static boolean itemMatchesStructuredTelemetryTab(TelemetryTagItemDto it, String requestedTabKey) {
        if (requestedTabKey == null || requestedTabKey.isBlank()) {
            return false;
        }
        String k = structuredTelemetryTabKeyForItem(it);
        if (k == null) {
            return false;
        }
        return k.trim().equalsIgnoreCase(requestedTabKey.trim());
    }

    private static boolean nz(String s) {
        return s != null && !s.trim().isEmpty();
    }

    private static String trimOr(String s, String d) {
        if (s == null || s.trim().isEmpty()) return d;
        return s.trim();
    }

    private static final class FloorTab {
        String tabKey;
        String title;
        String floorCode;
        String bundleCode;
        String bundleTitle;
        List<MpSuiteGroupDto> suiteGroups = new ArrayList<>();
    }

    private List<FloorTab> buildStructuredFloorTabs(List<TelemetryTagItemDto> items) {
        List<TelemetryTagItemDto> list = items.stream().filter(AnimalRoomHubAssembler::hasStructuredFields).toList();
        if (list.isEmpty()) return List.of();

        record TabAcc(String floorCode, String bundleCode, String bundleTitle,
                        Map<String, Map<String, MpRoomCardDto>> suites) {
        }

        Map<String, TabAcc> tabs = new LinkedHashMap<>();
        for (TelemetryTagItemDto it : list) {
            String floorRaw = it.getFloorCode().trim();
            String baseTabKey = normalizeFloorTabKey(floorRaw);
            String rcRaw = it.getRoomCanonical().trim();
            String tabKey = baseTabKey;
            if (isBasementFloorTabKey(baseTabKey)) {
                String zone = basementHardZoneFromRoomCanonical(rcRaw);
                if (zone != null) {
                    tabKey = baseTabKey + "-" + zone.toUpperCase(Locale.ROOT);
                }
            }
            final String floorTabKey = tabKey;
            String bc = trimOr(it.getBundleCode(), "_csv");
            String bt = trimOr(it.getBundleDisplayName(), bc);
            tabs.putIfAbsent(floorTabKey, new TabAcc(floorTabKey, "_merged", "", new LinkedHashMap<>()));
            TabAcc acc = tabs.get(floorTabKey);
            String suiteNorm;
            if (isSuiteConceptFloor(baseTabKey)) {
                suiteNorm = normalizeRoomForGrouping(standardSuiteRoomSegment(rcRaw));
            } else if (isBasementFloorTabKey(baseTabKey)) {
                suiteNorm = normalizeRoomForGrouping(basementSuiteRoomSegment(rcRaw));
            } else {
                suiteNorm = rcRaw.trim();
            }
            acc.suites.computeIfAbsent(suiteNorm, k -> new LinkedHashMap<>());
            Map<String, MpRoomCardDto> roomMap = acc.suites.get(suiteNorm);
            String cardRoomKey = rb().facilityRoomCardIdentity(rcRaw);
            MpRoomCardDto card = roomMap.computeIfAbsent(cardRoomKey, k -> MpRoomCardDto.builder()
                    .tabKey(floorTabKey)
                    .floorCode(acc.floorCode)
                    .bundleCode(bc)
                    .bundleTitle(bt)
                    .roomCanonical(cardRoomKey)
                    .sortKey(cardRoomKey)
                    .displayTitle(stripLeadingSuitePrefixFromRoomDisplay(cardRoomKey))
                    .metrics(new ArrayList<>())
                    .build());
            String mkc = it.getMetricKindCode().trim();
            String mkl = isStatusMetricKind(it)
                    ? statusMetricSlotDisplayLabel(it)
                    : (it.getMetricKindLabel() != null ? it.getMetricKindLabel() : it.getMetricKindCode());
            card.getMetrics().add(MpMetricSlotDto.builder()
                    .metricKindCode(mkc)
                    .metricKindLabel(mkl)
                    .item(it)
                    .build());
        }

        for (TabAcc acc : tabs.values()) {
            for (Map<String, MpRoomCardDto> roomMap : acc.suites().values()) {
                for (MpRoomCardDto card : roomMap.values()) {
                    List<MpMetricSlotDto> m = card.getMetrics();
                    if (m != null && m.size() > 1) {
                        m.sort(this::compareMetricsInFacilityRoom);
                    }
                }
            }
        }

        List<FloorTab> out = new ArrayList<>();
        for (Map.Entry<String, TabAcc> e : tabs.entrySet()) {
            String tabKey = e.getKey();
            TabAcc acc = e.getValue();
            List<MpSuiteGroupDto> suiteGroups = new ArrayList<>();
            for (Map.Entry<String, Map<String, MpRoomCardDto>> se : acc.suites.entrySet()) {
                String suiteNorm = se.getKey();
                List<MpRoomCardDto> rooms = new ArrayList<>(se.getValue().values());
                rooms.removeIf(r -> r.getMetrics() == null || r.getMetrics().isEmpty());
                if (rooms.isEmpty()) {
                    continue;
                }
                rooms.forEach(r -> r.setDisplayTitle(stripLeadingSuitePrefixFromRoomDisplay(r.getRoomCanonical())));
                rooms.sort(this::compareRoomsInSuiteForDisplay);
                String suiteTitle = stripSuiteTitlePrefixForDisplay(
                        rooms.size() > 1 ? suiteNorm
                                : (rooms.isEmpty() ? suiteNorm : rooms.get(0).getDisplayTitle()));
                suiteGroups.add(MpSuiteGroupDto.builder()
                        .tabKey(tabKey)
                        .floorCode(acc.floorCode)
                        .bundleCode(acc.bundleCode)
                        .bundleTitle(acc.bundleTitle)
                        .suiteNorm(suiteNorm)
                        .suiteTitle(suiteTitle)
                        .sortKey(suiteNorm)
                        .rooms(rooms)
                        .build());
            }
            suiteGroups.sort((a, b) -> {
                int dz = compareZoneKeys(zoneSortKeyForSuite(a), zoneSortKeyForSuite(b));
                if (dz != 0) return dz;
                return compareSuiteGroupsForDisplay(a, b);
            });
            FloorTab tab = new FloorTab();
            tab.tabKey = tabKey;
            tab.title = acc.floorCode;
            tab.floorCode = acc.floorCode;
            tab.bundleCode = acc.bundleCode;
            tab.bundleTitle = acc.bundleTitle;
            tab.suiteGroups = suiteGroups;
            out.add(tab);
        }
        out.sort(Comparator.comparing(t -> t.floorCode, CN_COLLATOR));
        return out;
    }

    private int totalMetricSlots(List<MpRoomCardDto> rooms) {
        int n = 0;
        for (MpRoomCardDto r : rooms) n += r.getMetrics().size();
        return n;
    }

    private int compareRoomsInSuiteForDisplay(MpRoomCardDto a, MpRoomCardDto b) {
        int d = Integer.compare(b.getMetrics().size(), a.getMetrics().size());
        if (d != 0) return d;
        return CN_COLLATOR.compare(a.getRoomCanonical(), b.getRoomCanonical());
    }

    private int compareSuiteGroupsForDisplay(MpSuiteGroupDto a, MpSuiteGroupDto b) {
        int dr = Integer.compare(b.getRooms().size(), a.getRooms().size());
        if (dr != 0) return dr;
        int dt = Integer.compare(totalMetricSlots(b.getRooms()), totalMetricSlots(a.getRooms()));
        if (dt != 0) return dt;
        return CN_COLLATOR.compare(a.getSuiteNorm(), b.getSuiteNorm());
    }

    private static boolean isPureThreeDigitLocal(String roomCanonical, String tabKey) {
        String tok;
        if (isSuiteConceptFloor(tabKey)) {
            tok = standardSuiteRoomSegment(roomCanonical);
        } else if (isBasementFloorScopeTabKey(tabKey)) {
            tok = basementSuiteRoomSegment(roomCanonical);
        } else {
            tok = localPartRoom(roomCanonical);
        }
        return tok.matches("^\\d{3}$");
    }

    private static boolean suiteRawHasPureDigitSingleNonBase(MpSuiteGroupDto suite) {
        String tabKey = suite.getTabKey();
        for (MpRoomCardDto room : suite.getRooms()) {
            if (isPureThreeDigitLocal(room.getRoomCanonical(), tabKey)
                    && room.getMetrics().size() == 1
                    && !isBaseRoomCanonical(room.getRoomCanonical(), tabKey)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 基间单测点默认升入套间标题槽；「状态」为测量值（METRIC），须在房间内形成卡片，不跟在套间名称后。
     */
    private static boolean metricSlotPreferTitleRowOverCard(MpMetricSlotDto slot) {
        if (slot == null) {
            return true;
        }
        String code = slot.getMetricKindCode() == null ? "" : slot.getMetricKindCode().trim().toUpperCase(Locale.ROOT);
        if ("STATUS".equals(code)) {
            return false;
        }
        String label = slot.getMetricKindLabel() == null ? "" : slot.getMetricKindLabel().trim();
        return !"状态".equals(label);
    }

    private MpPreparedSuiteDto prepareSuiteDisplay(MpSuiteGroupDto suite) {
        FacilityLayoutRulebook book = rb();
        List<MpMetricSlotDto> leadingSupplyTitleSlots = new ArrayList<>();
        List<MpMetricSlotDto> leadingPowerStationTitleSlots = new ArrayList<>();
        List<MpMetricSlotDto> leadingBoilerRoomTitleSlots = new ArrayList<>();
        List<MpMetricSlotDto> titleSlots = new ArrayList<>();
        List<MpRoomCardDto> visibleRooms = new ArrayList<>();
        boolean powerStationSuite = book.suiteIsPowerStationSuite(suite);
        boolean boilerRoomSuite = book.suiteIsBoilerRoomSuite(suite);

        for (MpRoomCardDto room : nonNullSlotsRoomCards(suite.getRooms())) {
            MpRoomCardDto work = room;
            List<MpMetricSlotDto> metrics = room.getMetrics() == null ? List.of() : room.getMetrics();

            if (book.roomCanonicalHasGongShuiSupplySegment(room.getRoomCanonical())) {
                List<MpMetricSlotDto> promote = new ArrayList<>();
                List<MpMetricSlotDto> keep = new ArrayList<>();
                for (MpMetricSlotDto m : metrics) {
                    if (book.metricSlotIsTitleTempPressureMetric(m)) {
                        promote.add(m);
                    } else {
                        keep.add(m);
                    }
                }
                if (!promote.isEmpty()) {
                    leadingSupplyTitleSlots.addAll(promote);
                    if (keep.isEmpty()) {
                        continue;
                    }
                    work = MpRoomCardDto.builder()
                            .tabKey(room.getTabKey())
                            .floorCode(room.getFloorCode())
                            .bundleCode(room.getBundleCode())
                            .bundleTitle(room.getBundleTitle())
                            .roomCanonical(room.getRoomCanonical())
                            .sortKey(room.getSortKey())
                            .displayTitle(room.getDisplayTitle())
                            .metrics(new ArrayList<>(keep))
                            .build();
                }
            }

            if (powerStationSuite) {
                List<MpMetricSlotDto> wm = work.getMetrics() == null ? List.of() : work.getMetrics();
                List<MpMetricSlotDto> promotePs = new ArrayList<>();
                List<MpMetricSlotDto> keepPs = new ArrayList<>();
                for (MpMetricSlotDto m : wm) {
                    if (book.metricSlotIsTitleTempPressureMetric(m)) {
                        promotePs.add(m);
                    } else {
                        keepPs.add(m);
                    }
                }
                if (!promotePs.isEmpty()) {
                    leadingPowerStationTitleSlots.addAll(promotePs);
                    if (keepPs.isEmpty()) {
                        continue;
                    }
                    work = MpRoomCardDto.builder()
                            .tabKey(work.getTabKey())
                            .floorCode(work.getFloorCode())
                            .bundleCode(work.getBundleCode())
                            .bundleTitle(work.getBundleTitle())
                            .roomCanonical(work.getRoomCanonical())
                            .sortKey(work.getSortKey())
                            .displayTitle(work.getDisplayTitle())
                            .metrics(new ArrayList<>(keepPs))
                            .build();
                }
            }

            if (boilerRoomSuite) {
                List<MpMetricSlotDto> wm = work.getMetrics() == null ? List.of() : work.getMetrics();
                List<MpMetricSlotDto> promoteBr = new ArrayList<>();
                List<MpMetricSlotDto> keepBr = new ArrayList<>();
                for (MpMetricSlotDto m : wm) {
                    if (book.metricSlotIsTitleTempPressureMetric(m)) {
                        promoteBr.add(m);
                    } else {
                        keepBr.add(m);
                    }
                }
                if (!promoteBr.isEmpty()) {
                    leadingBoilerRoomTitleSlots.addAll(promoteBr);
                    if (keepBr.isEmpty()) {
                        continue;
                    }
                    work = MpRoomCardDto.builder()
                            .tabKey(work.getTabKey())
                            .floorCode(work.getFloorCode())
                            .bundleCode(work.getBundleCode())
                            .bundleTitle(work.getBundleTitle())
                            .roomCanonical(work.getRoomCanonical())
                            .sortKey(work.getSortKey())
                            .displayTitle(work.getDisplayTitle())
                            .metrics(new ArrayList<>(keepBr))
                            .build();
                }
            }

            if (isBaseRoomCanonical(work.getRoomCanonical(), suite.getTabKey()) && work.getMetrics().size() == 1) {
                MpMetricSlotDto only = work.getMetrics().get(0);
                if (metricSlotPreferTitleRowOverCard(only)) {
                    titleSlots.add(only);
                } else {
                    visibleRooms.add(work);
                }
            } else {
                visibleRooms.add(work);
            }
        }
        List<MpMetricSlotDto> allTitles = new ArrayList<>(
                leadingSupplyTitleSlots.size()
                        + leadingPowerStationTitleSlots.size()
                        + leadingBoilerRoomTitleSlots.size()
                        + titleSlots.size());
        allTitles.addAll(leadingSupplyTitleSlots);
        allTitles.addAll(leadingPowerStationTitleSlots);
        allTitles.addAll(leadingBoilerRoomTitleSlots);
        allTitles.addAll(titleSlots);
        allTitles = orderTitleSlotsSwitchesFirst(allTitles);
        for (MpRoomCardDto room : visibleRooms) {
            if (room.getMetrics() == null || room.getMetrics().size() <= 1) {
                continue;
            }
            room.getMetrics().sort(book::compareMetricsInFacilityRoom);
        }
        return MpPreparedSuiteDto.builder()
                .suite(suite)
                .titleSlots(allTitles)
                .visibleRooms(visibleRooms)
                .build();
    }

    /** 套间标题行：开关类测点整体排在名称后最前，彼此之间按变量名稳定排序（与 Web prepareSuiteDisplay 一致）。 */
    private List<MpMetricSlotDto> orderTitleSlotsSwitchesFirst(List<MpMetricSlotDto> slots) {
        List<MpMetricSlotDto> sw = new ArrayList<>();
        List<MpMetricSlotDto> rest = new ArrayList<>();
        for (MpMetricSlotDto m : slots) {
            if (metricSlotIsSwitch(m)) {
                sw.add(m);
            } else {
                rest.add(m);
            }
        }
        sw.sort(Comparator.comparing(m -> {
            if (m.getItem() != null && m.getItem().getVariableName() != null) {
                return m.getItem().getVariableName();
            }
            return "";
        }, CN_COLLATOR));
        List<MpMetricSlotDto> out = new ArrayList<>(slots.size());
        out.addAll(sw);
        out.addAll(rest);
        return out;
    }

    private Long suiteLatestMsPrepared(MpPreparedSuiteDto ps) {
        List<TelemetryTagItemDto> acc = new ArrayList<>();
        for (MpRoomCardDto r : ps.getVisibleRooms()) {
            for (MpMetricSlotDto m : r.getMetrics()) acc.add(m.getItem());
        }
        for (MpMetricSlotDto m : ps.getTitleSlots()) acc.add(m.getItem());
        return maxTelemetryItemTimestampsMs(acc);
    }

    private static Long maxTelemetryItemTimestampsMs(List<TelemetryTagItemDto> items) {
        Long max = null;
        for (TelemetryTagItemDto it : items) {
            if (it.getTimestamp() == null || it.getTimestamp().isBlank()) continue;
            try {
                long t = Instant.parse(it.getTimestamp()).toEpochMilli();
                max = max == null ? t : Math.max(max, t);
            } catch (Exception ignored) {
            }
        }
        return max;
    }

    private static final DateTimeFormatter LOCAL_TS = DateTimeFormatter.ofPattern("yyyy/M/d HH:mm:ss").withZone(ZoneId.systemDefault());

    private String formatTsIsoMs(long epochMs) {
        return LOCAL_TS.format(Instant.ofEpochMilli(epochMs));
    }

    private String suiteLatestText(MpPreparedSuiteDto ps) {
        Long ms = suiteLatestMsPrepared(ps);
        if (ms == null) return "—";
        try {
            return formatTsIsoMs(ms);
        } catch (Exception e) {
            return "—";
        }
    }

    private static List<MpMetricSlotDto> nonNullSlots(List<MpMetricSlotDto> slots) {
        return slots == null ? List.of() : slots;
    }

    /**
     * 展示名/映射前后文案是否为开关：映射后多为「开关」；映射前常见「开关(读写值)(switch)」等。
     * 全角括号统一成半角后再匹配 {@code (SWITCH)}，避免漏检。
     */
    private static boolean textBlobSuggestsSwitch(String metricKindLabel, String displayLabel, String variableName) {
        String lb = metricKindLabel == null ? "" : metricKindLabel.trim();
        String dl = displayLabel == null ? "" : displayLabel.trim();
        if (lb.contains("开关") || dl.contains("开关")) {
            return true;
        }
        String blob = (lb + "\u0000" + dl).replace('（', '(').replace('）', ')');
        String blobU = blob.toUpperCase(Locale.ROOT);
        if (blobU.contains("(SWITCH)")) {
            return true;
        }
        /** WinCC/导入变量名：{@code xxx.Switch}、{@code xxx_Switch}（大小写不敏感），避免误伤含 SWITCH 子串的普通词 */
        String vn = variableName == null ? "" : variableName.trim();
        if (vn.isEmpty()) {
            return false;
        }
        String vu = vn.toUpperCase(Locale.ROOT);
        if (vu.endsWith("_SWITCH") || vu.endsWith(".SWITCH")) {
            return true;
        }
        return vu.contains("_SWITCH_")
                || vu.contains(".SWITCH.")
                || vu.contains("_SWITCH.")
                || vu.contains(".SWITCH_");
    }

    /**
     * 是否为「开关类」测点（用于 Web chrome 每行套数）。
     * 与前端 {@code frontend/src/telemetry-view/structuredTabs.ts} 中 {@code isSwitchTelemetryMetric} 对齐。
     */
    private boolean metricSlotIsSwitch(MpMetricSlotDto s) {
        if (s == null) return false;
        TelemetryTagItemDto it = s.getItem();
        String kr = it != null && it.getKindRole() != null ? it.getKindRole().trim().toUpperCase(Locale.ROOT) : "";
        if ("SWITCH".equals(kr)) {
            return true;
        }
        String code = s.getMetricKindCode() != null ? s.getMetricKindCode().trim().toUpperCase(Locale.ROOT) : "";
        if ("SWITCH".equals(code) || code.contains("SWITCH")) {
            return true;
        }
        String lb = s.getMetricKindLabel() != null ? s.getMetricKindLabel().trim() : "";
        String dl = it != null && it.getDisplayLabel() != null ? it.getDisplayLabel().trim() : "";
        String vn = it != null && it.getVariableName() != null ? it.getVariableName().trim() : "";
        return textBlobSuggestsSwitch(lb, dl, vn);
    }

    /**
     * Web：套间内任一等效房间卡上存在开关类测点即视为「带开关套间」。
     * 必须扫描 {@link MpPreparedSuiteDto#getSuite()} 下原始 {@code rooms}：基间单测点会升入 titleSlots 展示，
     * 但指标对象仍挂在房间卡上，仅扫 titleSlots/visibleRooms 可能遗漏路径依赖。
     */
    private boolean preparedSuiteHasSwitch(MpPreparedSuiteDto p) {
        if (p == null || p.getSuite() == null) {
            return false;
        }
        for (MpRoomCardDto room : nonNullSlotsRoomCards(p.getSuite().getRooms())) {
            for (MpMetricSlotDto m : nonNullSlots(room.getMetrics())) {
                if (metricSlotIsSwitch(m)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static List<MpRoomCardDto> nonNullSlotsRoomCards(List<MpRoomCardDto> rooms) {
        return rooms == null ? List.of() : rooms;
    }

    /**
     * 自 startIdx 起连续「非 chrome 套件」的单间小卡，最多 maxCards 张（Web 侧栏 2×2）。
     * {@code maxMetricsPerRoom}=1：严格单测点；=2：允许温+湿等双测点小房间（与饲养室单间一致）。
     */
    private List<MpRoomCardDto> peekSingleMetricSoloCards(
            List<MpSuiteGroupDto> groups,
            int startIdx,
            int maxCards,
            Set<Integer> consumeGroupIndices,
            int maxMetricsPerRoom) {
        List<MpRoomCardDto> cards = new ArrayList<>();
        for (int i = startIdx; i < groups.size() && cards.size() < maxCards; i++) {
            MpSuiteGroupDto g = groups.get(i);
            if (suiteHasChrome(g)) break;
            if (g.getRooms() == null || g.getRooms().size() != 1) break;
            MpRoomCardDto card = g.getRooms().get(0);
            int mc = card.getMetrics() == null ? 0 : card.getMetrics().size();
            if (mc < 1 || mc > maxMetricsPerRoom) break;
            cards.add(card);
            consumeGroupIndices.add(i);
        }
        return cards;
    }

    /** 末行 chrome：标准 TRIPLE_PACK，且两可见间各恰好 3 个测点（「两小间×三项」） */
    private boolean preparedIsTriplePackTwoRoomsThreeMetrics(MpPreparedSuiteDto p, MpSuiteGroupDto raw) {
        if (p == null || raw == null) {
            return false;
        }
        if (outerSuiteBand(p, raw) != Band.TRIPLE_PACK) {
            return false;
        }
        if (p.getVisibleRooms().size() != 2) {
            return false;
        }
        for (MpRoomCardDto r : p.getVisibleRooms()) {
            if (r.getMetrics() == null || r.getMetrics().size() != 3) {
                return false;
            }
        }
        return true;
    }

    /**
     * 侧栏候选：原始 2 张房间卡各 1 测点，展示态为标题槽非空 + 恰好 1 间可见（另一间并入标题区）。
     */
    private boolean suiteGroupIsTitlePlusOneVisibleCard(MpSuiteGroupDto g) {
        if (g == null || g.getRooms() == null || g.getRooms().size() != 2) {
            return false;
        }
        for (MpRoomCardDto r : g.getRooms()) {
            if (r.getMetrics() == null || r.getMetrics().size() != 1) {
                return false;
            }
        }
        MpPreparedSuiteDto p = prepareSuiteDisplay(g);
        return !p.getTitleSlots().isEmpty() && p.getVisibleRooms().size() == 1;
    }

    /**
     * 自 startIdx 起连续「标题槽 + 单间卡」小套间，最多 maxN 套；按 {@link #suiteNorm} 排序便于房间号顺序展示。
     */
    private List<MpPreparedSuiteDto> peekTitlePlusOneCardPreparedSuites(
            List<MpSuiteGroupDto> groups,
            int startIdx,
            int maxN,
            Set<Integer> consumeGroupIndices) {
        List<MpPreparedSuiteDto> list = new ArrayList<>();
        for (int i = startIdx; i < groups.size() && list.size() < maxN; i++) {
            MpSuiteGroupDto g = groups.get(i);
            if (!suiteGroupIsTitlePlusOneVisibleCard(g)) {
                break;
            }
            consumeGroupIndices.add(i);
            list.add(prepareSuiteDisplay(g));
        }
        list.sort(Comparator.comparing(p -> p.getSuite().getSuiteNorm(), CN_COLLATOR));
        return list;
    }

    /**
     * Web + B1F 分页（{@code B1F-E10} 等）：MAU/PAU 可能分别为 PAIR_LARGE 与 TRIPLE_PACK，
     * 若按 band 拆分 chrome 队列会先 flush 再排，导致无法「一行两个带开关套间」。合并为同一 run 后按行内实际 band 算 cap。
     */
    private void flushChromeQueueToOut(
            List<FloorChunk> out,
            List<ChromeQueued> chromeQueue,
            List<MpSuiteGroupDto> suiteGroups,
            int peekFromIndex,
            int chromeMediumRowMax,
            boolean webSwitchLayout,
            boolean webBasementMergeChromeRuns,
            Set<Integer> consumedSuiteGroupIndices) {
        if (chromeQueue.isEmpty()) return;
        int i = 0;
        while (i < chromeQueue.size()) {
            List<ChromeQueued> run;
            int j;
            if (webBasementMergeChromeRuns) {
                run = new ArrayList<>(chromeQueue.subList(i, chromeQueue.size()));
                j = chromeQueue.size();
            } else {
                boolean isLarge = chromeQueue.get(i).isLargeSuite();
                j = i + 1;
                while (j < chromeQueue.size() && chromeQueue.get(j).isLargeSuite() == isLarge) j++;
                run = new ArrayList<>(chromeQueue.subList(i, j));
            }

            List<ChromeQueued> row = new ArrayList<>();
            for (int qi = 0; qi < run.size(); qi++) {
                ChromeQueued cq = run.get(qi);
                List<ChromeQueued> tentative = new ArrayList<>(row);
                tentative.add(cq);
                boolean anySwitchInRow =
                        webSwitchLayout && tentative.stream().anyMatch(c -> preparedSuiteHasSwitch(c.prepared())
                                || rb().suiteAllowsBoilerSwitchRowMerge(c.prepared().getSuite()));
                boolean rowHasLarge = tentative.stream().anyMatch(ChromeQueued::isLargeSuite);
                int cap = (webSwitchLayout && anySwitchInRow) ? 2 : (rowHasLarge ? 3 : chromeMediumRowMax);
                if (tentative.size() > cap) {
                    emitChromeRowSliceFromQueued(
                            out,
                            row,
                            false,
                            suiteGroups,
                            peekFromIndex,
                            chromeMediumRowMax,
                            webSwitchLayout,
                            consumedSuiteGroupIndices);
                    row.clear();
                    row.add(cq);
                } else {
                    row.add(cq);
                }
            }
            if (!row.isEmpty()) {
                emitChromeRowSliceFromQueued(
                        out,
                        row,
                        true,
                        suiteGroups,
                        peekFromIndex,
                        chromeMediumRowMax,
                        webSwitchLayout,
                        consumedSuiteGroupIndices);
            }
            i = j;
        }
        chromeQueue.clear();
    }

    private void emitChromeRowSliceFromQueued(
            List<FloorChunk> out,
            List<ChromeQueued> rowSlice,
            boolean isLastSliceOfRun,
            List<MpSuiteGroupDto> suiteGroups,
            int peekFromIndex,
            int chromeMediumRowMax,
            boolean webSwitchLayout,
            Set<Integer> consumedSuiteGroupIndices) {
        if (rowSlice.isEmpty()) {
            return;
        }
        boolean sliceHasLarge = rowSlice.stream().anyMatch(ChromeQueued::isLargeSuite);
        List<MpPreparedSuiteDto> slice = new ArrayList<>(rowSlice.size());
        for (ChromeQueued cq : rowSlice) {
            slice.add(cq.prepared());
        }
        emitChromeRowSlice(
                out,
                slice,
                isLastSliceOfRun,
                suiteGroups,
                peekFromIndex,
                chromeMediumRowMax,
                webSwitchLayout,
                sliceHasLarge,
                consumedSuiteGroupIndices);
    }

    /** Web：仅当本行内存在带开关套间时限 2 列；否则按本行是否含 large band 定 medium/large 行类 */
    private void emitChromeRowSlice(
            List<FloorChunk> out,
            List<MpPreparedSuiteDto> slice,
            boolean isLastSliceOfRun,
            List<MpSuiteGroupDto> suiteGroups,
            int peekFromIndex,
            int chromeMediumRowMax,
            boolean webSwitchLayout,
            boolean sliceHasLarge,
            Set<Integer> consumedSuiteGroupIndices) {
        if (slice.isEmpty()) {
            return;
        }
        boolean rowHasSwitch = webSwitchLayout && slice.stream().anyMatch(p ->
                preparedSuiteHasSwitch(p) || rb().suiteAllowsBoilerSwitchRowMerge(p.getSuite()));
        String rowKind = rowHasSwitch
                ? "switch2"
                : (sliceHasLarge ? "large3" : (chromeMediumRowMax >= 3 ? "medium3" : "medium2"));

        boolean orphanTriplePackSidecar =
                webSwitchLayout
                        && slice.size() == 1
                        && isLastSliceOfRun
                        && peekFromIndex < suiteGroups.size()
                        && preparedIsTriplePackTwoRoomsThreeMetrics(slice.get(0), slice.get(0).getSuite());

        if (orphanTriplePackSidecar) {
            Set<Integer> sideScratch = new HashSet<>();
            List<MpPreparedSuiteDto> sidePrepared =
                    peekTitlePlusOneCardPreparedSuites(suiteGroups, peekFromIndex, 3, sideScratch);
            if (!sidePrepared.isEmpty()) {
                consumedSuiteGroupIndices.addAll(sideScratch);
                MpPreparedSuiteDto lone = slice.get(0);
                List<MpChromeCellDto> cells = new ArrayList<>();
                cells.add(MpChromeCellDto.builder()
                        .prepared(lone)
                        .suiteLatestText(suiteLatestText(lone))
                        .build());
                cells.add(MpChromeCellDto.builder().webSidecarPreparedSuites(new ArrayList<>(sidePrepared)).build());
                String key = "chr-" + rowKind + "-" + lone.getSuite().getSuiteNorm() + "|sidePrep";
                out.add(new FloorChunkChrome(key, rowKind, cells));
                return;
            }
        }

        boolean orphanSwitchRow =
                webSwitchLayout
                        && slice.size() == 1
                        && isLastSliceOfRun
                        && peekFromIndex < suiteGroups.size()
                        && preparedSuiteHasSwitch(slice.get(0));

        if (orphanSwitchRow) {
            Set<Integer> sideScratch = new HashSet<>();
            List<MpRoomCardDto> sideCards =
                    peekSingleMetricSoloCards(suiteGroups, peekFromIndex, 4, sideScratch, 2);
            if (!sideCards.isEmpty()) {
                consumedSuiteGroupIndices.addAll(sideScratch);
                MpPreparedSuiteDto lone = slice.get(0);
                List<MpChromeCellDto> cells = new ArrayList<>();
                cells.add(MpChromeCellDto.builder()
                        .prepared(lone)
                        .suiteLatestText(suiteLatestText(lone))
                        .build());
                cells.add(MpChromeCellDto.builder().webSoloMicroGrid(new ArrayList<>(sideCards)).build());
                String key = "chr-" + rowKind + "-" + lone.getSuite().getSuiteNorm() + "|sideMicro";
                out.add(new FloorChunkChrome(key, rowKind, cells));
                return;
            }
        }

        List<MpChromeCellDto> cells = new ArrayList<>();
        for (MpPreparedSuiteDto ps : slice) {
            cells.add(MpChromeCellDto.builder()
                    .prepared(ps)
                    .suiteLatestText(suiteLatestText(ps))
                    .build());
        }
        String key = "chr-" + rowKind + "-" + slice.stream()
                .map(p -> p.getSuite().getSuiteNorm())
                .collect(Collectors.joining("|"));
        out.add(new FloorChunkChrome(key, rowKind, cells));
    }

    private boolean suiteHasChrome(MpSuiteGroupDto suite) {
        String tk = suite.getTabKey();
        if (!isSuiteConceptFloor(tk) && !isBasementFloorScopeTabKey(tk)) {
            return false;
        }
        return suite.getRooms().size() > 1;
    }

    private enum Band {
        PAIR_LARGE, TRIPLE_PACK, SINGLE
    }

    private Band outerSuiteBand(MpPreparedSuiteDto prepared, MpSuiteGroupDto rawSuite) {
        int v = prepared.getVisibleRooms().size();
        if (v >= 3) return Band.PAIR_LARGE;
        if (v == 2 && !suiteRawHasPureDigitSingleNonBase(rawSuite)) return Band.TRIPLE_PACK;
        return Band.SINGLE;
    }

    /**
     * Web+B1F 合并 chrome：多房间套间若大量单参升入标题槽，{@link #outerSuiteBand} 会得到 {@link Band#SINGLE}，
     * 从而走 {@link FloorChunkSuite} 独占宽行，无法与相邻 MAU/PAU 等并排。此类仍有多张房间卡时强制 TRIPLE_PACK 进 chrome 队列。
     */
    private Band outerSuiteBandForChromeQueue(
            MpPreparedSuiteDto prepared, MpSuiteGroupDto rawSuite, boolean webBasementMergeChromeRuns) {
        Band b = outerSuiteBand(prepared, rawSuite);
        if (!webBasementMergeChromeRuns || b != Band.SINGLE) {
            return b;
        }
        int nRooms = rawSuite.getRooms() == null ? 0 : rawSuite.getRooms().size();
        if (nRooms > 1) {
            return Band.TRIPLE_PACK;
        }
        return Band.SINGLE;
    }

    private record SoloPartition(String label, List<MpRoomCardDto> cards, String zoneSub) {
    }

    /** 单间分桶顺序随套间遍历，不按房间名全局重排；三列分行由 {@link #splitSoloCardsFixedMaxColsWithLoneRemainder} 处理余 1/余 2。 */
    private List<SoloPartition> partitionSoloCards(List<MpSuiteGroupDto> suites) {
        List<MpRoomCardDto> triple = new ArrayList<>();
        List<MpRoomCardDto> pair = new ArrayList<>();
        List<MpRoomCardDto> single = new ArrayList<>();
        List<MpRoomCardDto> other = new ArrayList<>();
        for (MpSuiteGroupDto su : suites) {
            for (MpRoomCardDto card : su.getRooms()) {
                int m = card.getMetrics().size();
                if (m == 3) triple.add(card);
                else if (m == 2) pair.add(card);
                else if (m == 1) single.add(card);
                else other.add(card);
            }
        }
        List<SoloPartition> out = new ArrayList<>();
        if (!triple.isEmpty()) out.add(new SoloPartition("单间 · 三项参数", triple, null));
        if (!pair.isEmpty()) out.add(new SoloPartition("单间 · 两项参数", pair, null));
        if (!single.isEmpty()) out.add(new SoloPartition(SOLO_PARTITION_LABEL_SINGLE_METRIC, single, null));
        if (!other.isEmpty()) out.add(new SoloPartition("单间 · 其他项数", other, null));
        return out;
    }

    private static String mergeZoneSubLine(String a, String b) {
        LinkedHashSet<String> uniq = new LinkedHashSet<>();
        if (a != null && !a.isBlank()) {
            for (String x : a.split("\\s*·\\s*")) {
                String t = x.trim();
                if (!t.isEmpty()) uniq.add(t);
            }
        }
        if (b != null && !b.isBlank()) {
            for (String x : b.split("\\s*·\\s*")) {
                String t = x.trim();
                if (!t.isEmpty()) uniq.add(t);
            }
        }
        return uniq.isEmpty() ? null : String.join(" · ", uniq);
    }

    private List<SoloPartition> mergeSoloPartitions(List<SoloPartition> a, List<SoloPartition> b) {
        final class Acc {
            List<MpRoomCardDto> cards = new ArrayList<>();
            String zoneSub;
        }
        Map<String, Acc> map = new LinkedHashMap<>();
        for (SoloPartition p : a) {
            Acc acc = map.computeIfAbsent(p.label(), k -> new Acc());
            acc.cards.addAll(p.cards());
            acc.zoneSub = mergeZoneSubLine(acc.zoneSub, p.zoneSub());
        }
        for (SoloPartition p : b) {
            Acc acc = map.computeIfAbsent(p.label(), k -> new Acc());
            acc.cards.addAll(p.cards());
            acc.zoneSub = mergeZoneSubLine(acc.zoneSub, p.zoneSub());
        }
        List<SoloPartition> ordered = new ArrayList<>();
        for (String label : SOLO_PARTITION_LABEL_ORDER) {
            Acc acc = map.get(label);
            if (acc != null && !acc.cards.isEmpty()) {
                ordered.add(new SoloPartition(label, new ArrayList<>(acc.cards), acc.zoneSub));
            }
            map.remove(label);
        }
        for (Map.Entry<String, Acc> e : map.entrySet()) {
            if (!e.getValue().cards.isEmpty()) {
                ordered.add(new SoloPartition(e.getKey(), e.getValue().cards, e.getValue().zoneSub));
            }
        }
        return ordered;
    }

    sealed interface FloorChunk permits FloorChunkZoneBand, FloorChunkSuite, FloorChunkChrome, FloorChunkSolos {
        String key();
    }

    private record FloorChunkZoneBand(String key, String zoneLabel) implements FloorChunk {
    }

    private record FloorChunkSuite(String key, MpPreparedSuiteDto prepared) implements FloorChunk {
    }

    private record FloorChunkChrome(String key, String rowKind, List<MpChromeCellDto> cells) implements FloorChunk {
    }

    private record FloorChunkSolos(String key, List<SoloPartition> partitions) implements FloorChunk {
    }

    private List<FloorChunk> mergeConsecutiveSoloChunks(List<FloorChunk> chunks) {
        List<FloorChunk> out = new ArrayList<>();
        for (FloorChunk ch : chunks) {
            if (ch instanceof FloorChunkZoneBand) {
                out.add(ch);
                continue;
            }
            if (!(ch instanceof FloorChunkSolos sol)) {
                out.add(ch);
                continue;
            }
            if (!out.isEmpty() && out.get(out.size() - 1) instanceof FloorChunkSolos prev) {
                List<SoloPartition> merged = mergeSoloPartitions(prev.partitions(), sol.partitions());
                out.set(out.size() - 1, new FloorChunkSolos(prev.key() + "++" + sol.key(), merged));
            } else {
                out.add(new FloorChunkSolos(sol.key(), new ArrayList<>(sol.partitions().stream()
                        .map(p -> new SoloPartition(p.label(), new ArrayList<>(p.cards()), p.zoneSub()))
                        .toList())));
            }
        }
        return out;
    }

    private static List<Integer> splitEvenRowSizes(int n, int rowCount) {
        int r = Math.min(Math.max(1, rowCount), n);
        int base = n / r;
        int rem = n % r;
        List<Integer> sizes = new ArrayList<>();
        for (int i = 0; i < r; i++) sizes.add(base + (i < rem ? 1 : 0));
        return sizes;
    }

    private static int soloMinCardPxForPartition(String label) {
        if ("单间 · 三项参数".equals(label)) return 200;
        if ("单间 · 两项参数".equals(label)) return 176;
        if (label == null || label.isEmpty()) return 168;
        return 176;
    }

    private static List<List<MpRoomCardDto>> rowSplitsForBalancedSoloGrid(List<MpRoomCardDto> cards, int containerWidthPx, int minCardPx) {
        int n = cards.size();
        if (n == 0) return List.of();
        if (containerWidthPx < 48) return List.of(cards);
        int maxPerRow = Math.max(1, (containerWidthPx + SOLO_GRID_GAP_PX) / (minCardPx + SOLO_GRID_GAP_PX));
        int rowCount = Math.min(n, Math.max(1, (int) Math.ceil((double) n / maxPerRow)));
        List<Integer> sizes = splitEvenRowSizes(n, rowCount);
        List<List<MpRoomCardDto>> rows = new ArrayList<>();
        int off = 0;
        for (int sz : sizes) {
            rows.add(new ArrayList<>(cards.subList(off, off + sz)));
            off += sz;
        }
        return rows;
    }

    /**
     * 与 frontend {@code splitSoloCardsFixedMaxColsWithLoneRemainder} 一致：固定每行最多 {@code maxCols} 张；
     * 余 1 末行单独 1 张；余 2 末行并排 2 张；不改变 cards 顺序（不另做房间名稳定排序）。
     */
    private static List<List<MpRoomCardDto>> splitSoloCardsFixedMaxColsWithLoneRemainder(List<MpRoomCardDto> cards, int maxCols) {
        int n = cards.size();
        if (n == 0) {
            return List.of();
        }
        int m = Math.min(Math.max(1, maxCols), SOLO_BALANCED_GRID_MAX_COLS);
        if (m == 1) {
            List<List<MpRoomCardDto>> rows = new ArrayList<>();
            for (MpRoomCardDto c : cards) {
                rows.add(List.of(c));
            }
            return rows;
        }
        if (n <= m) {
            return List.of(new ArrayList<>(cards));
        }
        int rem = n % m;
        if (rem == 0) {
            List<List<MpRoomCardDto>> rows = new ArrayList<>();
            for (int i = 0; i < n; i += m) {
                rows.add(new ArrayList<>(cards.subList(i, i + m)));
            }
            return rows;
        }
        if (rem == 1) {
            int fullRows = (n - 1) / m;
            List<List<MpRoomCardDto>> rows = new ArrayList<>();
            int i = 0;
            for (int r = 0; r < fullRows; r++, i += m) {
                rows.add(new ArrayList<>(cards.subList(i, i + m)));
            }
            rows.add(new ArrayList<>(cards.subList(i, n)));
            return rows;
        }
        if (rem == 2) {
            int fullRows = (n - 2) / m;
            List<List<MpRoomCardDto>> rows = new ArrayList<>();
            int i = 0;
            for (int r = 0; r < fullRows; r++, i += m) {
                rows.add(new ArrayList<>(cards.subList(i, i + m)));
            }
            rows.add(new ArrayList<>(cards.subList(i, i + 2)));
            return rows;
        }
        List<List<MpRoomCardDto>> rows = new ArrayList<>();
        int i = 0;
        while (i < n) {
            int left = n - i;
            if (left <= m) {
                rows.add(new ArrayList<>(cards.subList(i, n)));
                break;
            }
            if (left % m == 1) {
                rows.add(new ArrayList<>(cards.subList(i, i + m)));
                i += m;
            } else {
                rows.add(new ArrayList<>(cards.subList(i, i + m)));
                i += m;
            }
        }
        return rows;
    }

    private record ChromeQueued(MpPreparedSuiteDto prepared, boolean isLargeSuite) {
    }

    private record ZoneBlock(String zoneKey, List<MpSuiteGroupDto> groups) {
    }

    private List<ZoneBlock> zoneBlocksFromSuiteGroups(List<MpSuiteGroupDto> suiteGroups) {
        Map<String, List<MpSuiteGroupDto>> map = new LinkedHashMap<>();
        for (MpSuiteGroupDto sg : suiteGroups) {
            String zk = zoneSortKeyForSuite(sg);
            map.computeIfAbsent(zk, k -> new ArrayList<>()).add(sg);
        }
        List<ZoneBlock> blocks = new ArrayList<>();
        for (String zk : sortZoneKeyList(new ArrayList<>(map.keySet()))) {
            blocks.add(new ZoneBlock(zk, map.get(zk)));
        }
        return blocks;
    }

    private List<FloorChunk> buildFloorChunksForSuiteSequence(
            String tabKey, List<MpSuiteGroupDto> suiteGroups, int chromeMediumRowMax, boolean webSwitchLayout) {
        List<FloorChunk> out = new ArrayList<>();
        List<MpSuiteGroupDto> solos = new ArrayList<>();
        List<ChromeQueued> chromeQueue = new ArrayList<>();
        Set<Integer> consumedSuiteGroupIndices = new HashSet<>();
        boolean webBasementMergeChromeRuns = webSwitchLayout && isBasementFloorScopeTabKey(tabKey);

        Runnable flushSolos = () -> {
            if (solos.isEmpty()) return;
            List<SoloPartition> partitions = partitionSoloCards(solos);
            if (!partitions.isEmpty()) {
                String key = "solos-" + solos.stream().map(MpSuiteGroupDto::getSuiteNorm).collect(Collectors.joining("|"));
                out.add(new FloorChunkSolos(key, partitions));
            }
            solos.clear();
        };

        for (int gi = 0; gi < suiteGroups.size(); gi++) {
            if (consumedSuiteGroupIndices.contains(gi)) {
                continue;
            }
            MpSuiteGroupDto suite = suiteGroups.get(gi);
            if (!suiteHasChrome(suite)) {
                flushChromeQueueToOut(
                        out,
                        chromeQueue,
                        suiteGroups,
                        gi,
                        chromeMediumRowMax,
                        webSwitchLayout,
                        webBasementMergeChromeRuns,
                        consumedSuiteGroupIndices);
                if (consumedSuiteGroupIndices.contains(gi)) {
                    continue;
                }
                solos.add(suite);
                continue;
            }
            flushSolos.run();
            // B1F 动力站：多套间 chrome 独占一行，不与锅炉房等待合并 chrome 并排
            if (isBasementFloorScopeTabKey(tabKey) && rb().suiteNormExclusiveBasementChromeRow(suite.getSuiteNorm())) {
                flushChromeQueueToOut(
                        out,
                        chromeQueue,
                        suiteGroups,
                        gi,
                        chromeMediumRowMax,
                        webSwitchLayout,
                        webBasementMergeChromeRuns,
                        consumedSuiteGroupIndices);
                MpPreparedSuiteDto preparedPs = prepareSuiteDisplay(suite);
                Band bandPs = outerSuiteBandForChromeQueue(preparedPs, suite, webBasementMergeChromeRuns);
                if (bandPs == Band.SINGLE) {
                    out.add(new FloorChunkSuite(tabKey + "-" + suite.getSuiteNorm(), preparedPs));
                } else {
                    chromeQueue.add(new ChromeQueued(preparedPs, bandPs == Band.PAIR_LARGE));
                    flushChromeQueueToOut(
                            out,
                            chromeQueue,
                            suiteGroups,
                            gi + 1,
                            chromeMediumRowMax,
                            webSwitchLayout,
                            webBasementMergeChromeRuns,
                            consumedSuiteGroupIndices);
                }
                continue;
            }

            MpPreparedSuiteDto prepared = prepareSuiteDisplay(suite);
            Band band = outerSuiteBandForChromeQueue(prepared, suite, webBasementMergeChromeRuns);
            if (band == Band.SINGLE) {
                flushChromeQueueToOut(
                        out,
                        chromeQueue,
                        suiteGroups,
                        gi,
                        chromeMediumRowMax,
                        webSwitchLayout,
                        webBasementMergeChromeRuns,
                        consumedSuiteGroupIndices);
                out.add(new FloorChunkSuite(tabKey + "-" + suite.getSuiteNorm(), prepared));
                continue;
            }
            boolean isLargeSuite = band == Band.PAIR_LARGE;
            if (!chromeQueue.isEmpty()
                    && !webBasementMergeChromeRuns
                    && chromeQueue.get(chromeQueue.size() - 1).isLargeSuite() != isLargeSuite) {
                flushChromeQueueToOut(
                        out,
                        chromeQueue,
                        suiteGroups,
                        gi,
                        chromeMediumRowMax,
                        webSwitchLayout,
                        webBasementMergeChromeRuns,
                        consumedSuiteGroupIndices);
            }
            chromeQueue.add(new ChromeQueued(prepared, isLargeSuite));
        }
        flushSolos.run();
        flushChromeQueueToOut(
                out,
                chromeQueue,
                suiteGroups,
                suiteGroups.size(),
                chromeMediumRowMax,
                webSwitchLayout,
                webBasementMergeChromeRuns,
                consumedSuiteGroupIndices);
        return mergeConsecutiveSoloChunks(out);
    }

    /** 楼层内按 E 区（E10→E11A→E11B→E11C 硬编码顺序）分块后再排版，区内再按单间三项/两项参数分桶 */
    private List<FloorChunk> buildFloorChunks(FloorTab tab, int chromeMediumRowMax, boolean webSwitchLayout) {
        List<FloorChunk> merged = new ArrayList<>();
        for (ZoneBlock block : zoneBlocksFromSuiteGroups(tab.suiteGroups)) {
            if (!DEFAULT_PLANE_ZONE_KEY.equals(block.zoneKey())) {
                if (!tabImpliesSingleBasementZone(tab.tabKey, block.zoneKey())) {
                    merged.add(new FloorChunkZoneBand("zb-" + tab.tabKey + "-" + block.zoneKey(), block.zoneKey()));
                }
            }
            merged.addAll(buildFloorChunksForSuiteSequence(tab.tabKey, block.groups(), chromeMediumRowMax, webSwitchLayout));
        }
        return merged;
    }

    private List<MpViewChunkDto> buildViewChunks(FloorTab tab, int soloWidthPx, boolean webSwitchLayout) {
        /** 竖屏小程序 soloWidth 较小，两小间套间每行 1 套；Web 等宽屏（≥600）每行 3 套均分 */
        int chromeMediumRowMax = soloWidthPx >= 600 ? 3 : 1;
        List<FloorChunk> chunks = buildFloorChunks(tab, chromeMediumRowMax, webSwitchLayout);
        int width = Math.max(48, soloWidthPx);
        List<MpViewChunkDto> dto = new ArrayList<>();
        for (FloorChunk ch : chunks) {
            if (ch instanceof FloorChunkZoneBand zb) {
                dto.add(MpViewChunkDto.builder()
                        .kind("zoneBand")
                        .key(zb.key())
                        .zoneLabel(zb.zoneLabel())
                        .build());
            } else if (ch instanceof FloorChunkSuite s) {
                dto.add(MpViewChunkDto.builder()
                        .kind("suite")
                        .key(s.key())
                        .prepared(s.prepared())
                        .suiteHalfRow(s.prepared().getVisibleRooms().size() == 1)
                        .suiteLatestText(suiteLatestText(s.prepared()))
                        .build());
            } else if (ch instanceof FloorChunkChrome c) {
                dto.add(MpViewChunkDto.builder()
                        .kind("chromeSuiteRow")
                        .key(c.key())
                        .rowKind(c.rowKind())
                        .list(new ArrayList<>(c.cells()))
                        .build());
            } else if (ch instanceof FloorChunkSolos sol) {
                List<MpSoloPartitionDto> parts = new ArrayList<>();
                for (SoloPartition p : sol.partitions()) {
                    // 宽屏与 Web 半栏一致：固定三列，余 1 独占末行、余 2 末行两张并排；窄屏仍按宽度均分行
                    List<List<MpRoomCardDto>> rows = soloWidthPx >= 600
                            ? splitSoloCardsFixedMaxColsWithLoneRemainder(p.cards(), ANIMAL_ROOM_SOLO_GRID_MAX_COLS_PER_ROW)
                            : rowSplitsForBalancedSoloGrid(p.cards(), width, soloMinCardPxForPartition(p.label()));
                    List<MpSoloRowDto> rowDtos = new ArrayList<>();
                    for (List<MpRoomCardDto> row : rows) {
                        rowDtos.add(MpSoloRowDto.builder().cards(row).build());
                    }
                    parts.add(MpSoloPartitionDto.builder()
                            .label(p.label())
                            .zoneSub(p.zoneSub())
                            .rows(rowDtos)
                            .build());
                }
                dto.add(MpViewChunkDto.builder()
                        .kind("solos")
                        .key(sol.key())
                        .partitions(parts)
                        .build());
            }
        }
        return dto;
    }
}

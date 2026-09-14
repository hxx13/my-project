package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.student.service.StudentCageShelfService;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位特殊状态汇总（**本地笼位表单口径**），供各端按不同粒度复用。
 *
 * <p>数据源是本地表单：{@code cage_info_value} 派生后物化在 {@code cage_cell_detail} 的
 * needs_division / needs_special_feeding / has_health_abnormality / needs_cohabitation / needs_transfer。
 * **刻意不用 {@code cage_special_status_snapshot}**（ARO /back 扫描链）：① 与本地表单对不上
 * （实测全库 合笼 3770 vs 0、密度超标 1042 vs 957）；② 那条链取明细是「全库先截断 200 条再按课题组过滤」，
 * 组内笼位几乎必然被截掉（实测钟清课题组密度超标 实际 105，快照链只筛出 0）。
 *
 * <p>粒度靠参数切换，不再为每个页面新开接口：
 * <ul>
 *   <li>{@code scope=me|mine|all} —— 本人（占用人是我）/ 本课题组 / 全量（全量需全局可见权限）</li>
 *   <li>{@code statusCode} —— 限定某一个状态；同时决定明细返回哪些笼位</li>
 *   <li>{@code groupBy=status|campus|floor|room|pi} —— 聚合维度（status 为默认，与首页卡片同口径）</li>
 *   <li>{@code keyword} —— 房间 / 笼架 / 笼盒号模糊</li>
 *   <li>{@code page/size} —— 明细分页；{@code size=0} 表示只要汇总不取明细</li>
 * </ul>
 * 过滤**全部下沉到 SQL 且在 LIMIT 之前**（先截断再过滤是这条链上最容易算错的写法）。
 */
@Service
public class CageStatusSummaryService {

    private static final Logger log = LoggerFactory.getLogger(CageStatusSummaryService.class);

    public static final String SCOPE_ME = "me";
    public static final String SCOPE_MINE = "mine";
    public static final String SCOPE_ALL = "all";

    public static final String BY_STATUS = "status";
    public static final String BY_CAMPUS = "campus";
    public static final String BY_FLOOR = "floor";
    public static final String BY_ROOM = "room";
    public static final String BY_PI = "pi";

    /** 状态码 → 汇总用的简明中文名（管理端另有更长的展示名，各端各取所需）。 */
    private static final Map<String, String> STATUS_LABELS = Map.of(
            "NEED_DIVIDE", "密度超标",
            "SPECIAL_FEEDING", "特殊饲养",
            "HEALTH_ABNORMAL", "健康异常",
            "COHABITATION", "合笼",
            "ANIMAL_TRANSFER", "动物转移"
    );

    /** 明细上限：再大前端也读不动，超过只提示截断，不影响计数。 */
    private static final int MAX_SIZE = 500;

    private final JdbcTemplate jdbcTemplate;
    private final StudentCageShelfService studentCageShelfService;
    private final CageVisibilityPolicy visibilityPolicy;
    private final PersonnelService personnelService;

    public CageStatusSummaryService(JdbcTemplate jdbcTemplate,
                                    StudentCageShelfService studentCageShelfService,
                                    CageVisibilityPolicy visibilityPolicy,
                                    PersonnelService personnelService) {
        this.jdbcTemplate = jdbcTemplate;
        this.studentCageShelfService = studentCageShelfService;
        this.visibilityPolicy = visibilityPolicy;
        this.personnelService = personnelService;
    }

    public Map<String, Object> summary(User user, String scope, String statusCode, String groupBy,
                                       String keyword, int page, int size) {
        String scopeKey = StringUtils.hasText(scope) ? scope.trim().toLowerCase() : SCOPE_MINE;
        boolean all = SCOPE_ALL.equals(scopeKey);
        if (all && !visibilityPolicy.isGlobalViewer(user)) {
            throw new IllegalStateException("无权查看全量笼位状态");
        }
        boolean me = SCOPE_ME.equals(scopeKey);
        String dimension = StringUtils.hasText(groupBy) ? groupBy.trim().toLowerCase() : BY_STATUS;
        int safeSize = Math.max(0, Math.min(size, MAX_SIZE));
        int safePage = Math.max(1, page);

        List<String> groupNames = all ? List.of() : studentCageShelfService.resolveUserGroupNames(user.getId());
        // 「本人」= 笼位占用人（cage_cell_detail.experimenter_name 存的是姓名）
        String myName = me ? resolveMyName(user) : null;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scope", all ? SCOPE_ALL : scopeKey);
        out.put("groupBy", dimension);
        out.put("groupNames", groupNames);

        List<String> candidates = groupCandidates(groupNames);
        if ((!all && !me && candidates.isEmpty()) || (me && !StringUtils.hasText(myName))) {
            // 没有课题组 / 拿不到本人姓名 → 空结果（绝不能退化成全量把别人的笼位漏出来）
            out.put("cagesTotal", 0);
            out.put("abnormalCages", 0);
            out.put("statusCounts", Collections.emptyMap());
            out.put("groups", Collections.emptyList());
            out.put("items", Collections.emptyList());
            out.put("page", safePage);
            out.put("size", safeSize);
            out.put("hasMore", false);
            return out;
        }

        String where = baseWhere(all, candidates, statusCode, keyword, me);
        List<Object> args = whereArgs(all, candidates, statusCode, keyword, myName);
        try {
            Map<String, Object> row = jdbcTemplate.queryForMap(
                    "SELECT COUNT(*) AS totalCages,"
                            + " COALESCE(SUM(CASE WHEN " + anyFlag("d") + " THEN 1 ELSE 0 END), 0) AS abnormal,"
                            + " COALESCE(SUM(d.needs_division), 0) AS nd,"
                            + " COALESCE(SUM(d.needs_special_feeding), 0) AS sf,"
                            + " COALESCE(SUM(d.has_health_abnormality), 0) AS ha,"
                            + " COALESCE(SUM(d.needs_cohabitation), 0) AS ch,"
                            + " COALESCE(SUM(d.needs_transfer), 0) AS tr"
                            + " FROM " + FROM_CLAUSE + " WHERE " + where,
                    args.toArray());

            Map<String, Object> statusCounts = new LinkedHashMap<>();
            statusCounts.put("NEED_DIVIDE", intVal(row.get("nd")));
            statusCounts.put("SPECIAL_FEEDING", intVal(row.get("sf")));
            statusCounts.put("HEALTH_ABNORMAL", intVal(row.get("ha")));
            statusCounts.put("COHABITATION", intVal(row.get("ch")));
            statusCounts.put("ANIMAL_TRANSFER", intVal(row.get("tr")));
            out.put("cagesTotal", intVal(row.get("totalCages")));
            // 同一笼位可多标，所以异常笼位数单独按「有没有任一标记」数，不等于 statusCounts 相加
            out.put("abnormalCages", intVal(row.get("abnormal")));
            out.put("statusCounts", statusCounts);
            out.put("groups", groupBy(dimension, statusCounts, where, args, statusCode, all));
            if (safeSize == 0) {
                out.put("items", Collections.emptyList());
                out.put("hasMore", false);
            } else {
                // 多取一条判断还有没有下一页，省掉一次 COUNT
                List<Map<String, Object>> items = listItems(statusCode, where, args, safePage, safeSize + 1);
                out.put("hasMore", items.size() > safeSize);
                out.put("items", items.size() > safeSize ? items.subList(0, safeSize) : items);
            }
            out.put("page", safePage);
            out.put("size", safeSize);
        } catch (Exception e) {
            log.warn("[cage-status-summary] 查询失败 userId={} scope={} err={}", user.getId(), scope, e.getMessage());
            throw new IllegalStateException("查询笼位状态失败：" + e.getMessage());
        }
        return out;
    }

    /* ---------------- 聚合维度 ---------------- */

    private List<Map<String, Object>> groupBy(String dimension, Map<String, Object> statusCounts,
                                              String where, List<Object> args,
                                              String statusCode, boolean all) {
        if (BY_STATUS.equals(dimension)) {
            List<Map<String, Object>> groups = new ArrayList<>();
            for (Map.Entry<String, String> e : STATUS_LABELS.entrySet()) {
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("key", e.getKey());
                g.put("label", e.getValue());
                g.put("count", statusCounts.getOrDefault(e.getKey(), 0));
                groups.add(g);
            }
            groups.sort((a, b) -> Integer.compare(intVal(b.get("count")), intVal(a.get("count"))));
            return groups;
        }

        String expr = switch (dimension) {
            case BY_CAMPUS -> "s.campus_name";
            case BY_FLOOR -> "s.floor_name";
            case BY_ROOM -> "s.room_name";
            case BY_PI -> "COALESCE(NULLIF(d.project_pi_name, ''), d.pi_name)";
            default -> throw new IllegalStateException("不支持的 groupBy：" + dimension);
        };
        // baseWhere 已经带上了 statusCode 条件，这里只在「不限状态」时补一层「带任一状态」
        String statusWhere = StringUtils.hasText(statusCode) ? "1 = 1" : anyFlag("d");
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT " + expr + " AS k, COUNT(*) AS c FROM " + FROM_CLAUSE
                            + " WHERE " + where + " AND " + statusWhere
                            + " GROUP BY k ORDER BY c DESC LIMIT 200",
                    args.toArray());
            List<Map<String, Object>> groups = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                String key = r.get("k") == null ? "" : String.valueOf(r.get("k"));
                if (key.isBlank()) {
                    key = all ? "（未归属）" : "";
                }
                if (key.isBlank()) {
                    continue;
                }
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("key", key);
                g.put("label", key);
                g.put("count", intVal(r.get("c")));
                groups.add(g);
            }
            return groups;
        } catch (Exception e) {
            log.warn("[cage-status-summary] groupBy={} 聚合失败 err={}", dimension, e.getMessage());
            return Collections.emptyList();
        }
    }

    /* ---------------- 明细 ---------------- */

    private List<Map<String, Object>> listItems(String statusCode, String where, List<Object> args,
                                                int page, int size) {
        // 没给状态就按「带任一状态」列明细，方便「全部异常」视图
        String statusWhere = StringUtils.hasText(statusCode) ? "1 = 1" : anyFlag("d");
        return jdbcTemplate.queryForList(
                "SELECT s.campus_name AS campusName, s.floor_name AS floorName, s.room_name AS roomName,"
                        + " s.shelve_name AS shelveName, i.position_x AS positionX, i.position_y AS positionY,"
                        + " d.cage_box_code AS cageBoxCode,"
                        + " d.project_pi_name AS projectPiName, d.pi_name AS piName,"
                        + " d.experimenter_name AS experimenterName, d.animal_strain_name AS animalStrainName,"
                        + " d.special_breeding_name AS detailName, d.special_breeding_desc AS detailDescription,"
                        + " d.needs_division AS needsDivision, d.needs_special_feeding AS needsSpecialFeeding,"
                        + " d.has_health_abnormality AS hasHealthAbnormality,"
                        + " d.needs_cohabitation AS needsCohabitation, d.needs_transfer AS needsTransfer"
                        + " FROM " + FROM_CLAUSE
                        + " WHERE " + where + " AND " + statusWhere
                        + " ORDER BY s.room_name, s.shelve_name, i.position_y, i.position_x"
                        + " LIMIT " + size + " OFFSET " + (long) (page - 1) * size,
                args.toArray());
    }

    /* ---------------- 条件拼装 ---------------- */

    private static final String FROM_CLAUSE = "cage_cell_detail d"
            + " JOIN cage_cell_index i ON i.animal_cage_id = d.animal_cage_id"
            + " JOIN cage_shelf_index s ON s.id = i.shelf_index_id AND s.deleted = 0";

    private static String anyFlag(String alias) {
        return "(" + alias + ".needs_division = 1 OR " + alias + ".needs_special_feeding = 1"
                + " OR " + alias + ".has_health_abnormality = 1 OR " + alias + ".needs_cohabitation = 1"
                + " OR " + alias + ".needs_transfer = 1)";
    }

    /**
     * 课题组名 → SQL 可用的等值候选。
     *
     * <p>笼位表里存的是**裸 PI 名**（`卢今`），课题组表里是 `卢今的课题组`，两边都要进候选，
     * 再补 department_name 等值分支（与 {@code PersonnelProjectGroupUtil} 的组名判定前三支对齐）。
     * 刻意**不做 LIKE 模糊匹配**：`33` 这类短组名会 LIKE 到一堆无关组。
     */
    private static List<String> groupCandidates(List<String> groups) {
        List<String> out = new ArrayList<>();
        for (String g : groups) {
            if (!StringUtils.hasText(g)) {
                continue;
            }
            String name = g.trim();
            if (!out.contains(name)) {
                out.add(name);
            }
            String pi = PersonnelProjectGroupUtil.extractPiPrefixFromGroupName(name);
            if (StringUtils.hasText(pi) && !out.contains(pi)) {
                out.add(pi);
            }
        }
        return out;
    }

    private static String baseWhere(boolean all, List<String> candidates, String statusCode,
                                    String keyword, boolean me) {
        StringBuilder sb = new StringBuilder("1 = 1");
        if (me) {
            sb.append(" AND d.experimenter_name = ?");
        } else if (!all) {
            String ph = "(" + String.join(",", Collections.nCopies(candidates.size(), "?")) + ")";
            sb.append(" AND (d.project_pi_name IN ").append(ph)
                    .append(" OR d.pi_name IN ").append(ph)
                    .append(" OR d.department_name IN ").append(ph).append(")");
        }
        if (StringUtils.hasText(keyword)) {
            sb.append(" AND (s.room_name LIKE ? OR s.shelve_name LIKE ? OR d.cage_box_code LIKE ?)");
        }
        if (StringUtils.hasText(statusCode)) {
            sb.append(" AND d.").append(columnOf(statusCode)).append(" = 1");
        }
        return sb.toString();
    }

    private static List<Object> whereArgs(boolean all, List<String> candidates, String statusCode,
                                         String keyword, String myName) {
        List<Object> args = new ArrayList<>();
        if (myName != null) {
            args.add(myName);
        } else if (!all) {
            for (int i = 0; i < 3; i++) {
                args.addAll(candidates);
            }
        }
        if (StringUtils.hasText(keyword)) {
            String like = "%" + keyword.trim() + "%";
            args.add(like);
            args.add(like);
            args.add(like);
        }
        return args;
    }

    /** 当前账号的姓名（统一人员表口径），用于「本人」范围。 */
    private String resolveMyName(User user) {
        try {
            Personnel me = personnelService.resolveByAccount(user.getId());
            return me != null && StringUtils.hasText(me.getName()) ? me.getName().trim() : null;
        } catch (Exception e) {
            log.warn("[cage-status-summary] 解析本人姓名失败 userId={} err={}", user.getId(), e.getMessage());
            return null;
        }
    }

    /** 状态码 → 本地表单列名。唯一映射在 {@link CageStatusIntervalService#STATUS_TO_FIELD}，不另开一份。 */
    private static String columnOf(String statusCode) {
        String column = CageStatusIntervalService.STATUS_TO_FIELD.get(statusCode);
        if (column == null) {
            throw new IllegalStateException("未知状态码：" + statusCode);
        }
        return column;
    }

    private static int intVal(Object v) {
        return v instanceof Number n ? n.intValue() : 0;
    }
}

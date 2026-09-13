package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.mapper.CageAlertRuleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 阈值解析：回答「某笼位的某状态，现在生效的告警规则是什么（开不开、阈值多少天、高亮还是发违规）」。
 *
 * <p>只做解析，不碰告警实例（cage_status_alert）、不读快照、不写库。真相源是两张阈值表
 * （全局默认 cage_alert_default + 区域规则 cage_region_alert_rule），与老的快照告警链路零耦合。
 *
 * <p><b>区域键复用</b>：笼位→区域（房间/楼层/校区）的解析完全委托 {@link CageRegionCapabilityService}，
 * 与区域能力/区域分配同一套口径，不在这里另写一份 lookup。
 *
 * <p><b>层级就近</b>（ROOM &gt; FLOOR &gt; CAMPUS &gt; 全局默认）：命中最近一级即用，不再往上看。
 * 与区域能力的「配过就以配过的为准」同一取向——更细粒度有人明确配过，就该盖过粗粒度的默认。
 *
 * <p><b>「配过」的判定</b>：某一级存在该 (区域, 状态) 的行就算配过（哪怕全是 enabled=0），
 * 即以该级为准不回落。否则饲养组长永远关不掉一个被全局默认打开的告警——这正是区域能力那边踩过的坑。
 *
 * <p><b>同一区域多个饲养组长 → 取并集</b>：enabled 任一行开即开；阈值在开着的行为里取最小
 * （更早告警者生效）；动作取并集（任一行要 HIGHLIGHT 就高亮、任一行要 VIOLATION 就发违规）。
 * 告警是提醒不是限制，所以只增不减，与区域能力「谁开的都算开」同一取向。
 *
 * <p><b>fail-closed</b>：全局默认表缺某 status_code 的行时 enabled=false（宁可漏报不可乱报），
 * 并打 warn——这是配置缺失，该被发现而不是静默放行。
 */
@Service
public class CageAlertRuleService {

    private static final Logger log = LoggerFactory.getLogger(CageAlertRuleService.class);

    /** 五个特殊状态码（与 {@link CageStatusIntervalService#STATUS_TO_FIELD} 的键一致，顺序固定供输出稳定）。 */
    public static final List<String> STATUS_CODES = List.of(
            "NEED_DIVIDE", "SPECIAL_FEEDING", "ANIMAL_TRANSFER", "HEALTH_ABNORMAL", "COHABITATION");

    /**
     * 状态码 → 中文名。本模块的读取端点（T5 活跃告警）与配置端点（T6a）都要回 statusLabel，
     * 放这里做唯一出处，不再像 T5 早期那样在 controller 里私拷一份。
     */
    public static final Map<String, String> STATUS_LABELS = Map.of(
            "NEED_DIVIDE", "需分笼",
            "SPECIAL_FEEDING", "需特殊饲养",
            "ANIMAL_TRANSFER", "动物转移",
            "HEALTH_ABNORMAL", "健康异常",
            "COHABITATION", "合笼");

    /** 层级就近的优先序：ROOM 最细，CAMPUS 最粗。 */
    private static final List<String> REGION_PRIORITY = List.of("ROOM", "FLOOR", "CAMPUS");

    private final CageAlertRuleMapper mapper;
    private final CageRegionCapabilityService regionCapabilityService;

    public CageAlertRuleService(CageAlertRuleMapper mapper,
                                CageRegionCapabilityService regionCapabilityService) {
        this.mapper = mapper;
        this.regionCapabilityService = regionCapabilityService;
    }

    /**
     * 某笼位某状态当前生效的告警规则。
     *
     * @param enabled       false = 该状态在此不告警
     * @param thresholdDays 持续多少天触发；0 = 状态一出现就触发
     * @param highlight     触发后是否在网格/弹窗高亮
     * @param violation     触发后是否自动发违规
     */
    public record EffectiveAlertRule(
            String statusCode,
            boolean enabled,
            int thresholdDays,
            boolean highlight,
            boolean violation
    ) {
    }

    /**
     * 批量：一次取全部笼位的区域键、一次批量读规则行、一次读全局默认，然后内存解析。
     * 返回每个 cageId → 它五个状态的生效规则（五个都要有，即使按全局默认）。
     */
    public Map<Long, List<EffectiveAlertRule>> resolveForCages(Collection<Long> cageIds) {
        if (cageIds == null || cageIds.isEmpty()) return Map.of();
        List<Long> ids = cageIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return Map.of();

        // 一次批量取区域键（不许逐笼位查库 → N 次查询）。
        Map<Long, List<Map<String, String>>> keysByCage = regionCapabilityService.regionsOfCages(ids);

        // 一次批量读规则行：所有笼位涉及的区域拍平去重后一条 IN 查回。
        List<Map<String, String>> allRegions = flattenRegions(keysByCage.values());
        List<Map<String, Object>> rules = allRegions.isEmpty() ? List.of() : mapper.listRegionRules(allRegions);

        // 一次读全局默认，按 status_code 建索引。
        Map<String, Map<String, Object>> defaults = indexDefaults(mapper.listDefaultRules());

        Map<Long, List<EffectiveAlertRule>> out = new LinkedHashMap<>();
        for (Long id : ids) {
            List<Map<String, String>> keys = keysByCage.getOrDefault(id, List.of());
            List<EffectiveAlertRule> perCage = new ArrayList<>(STATUS_CODES.size());
            for (String status : STATUS_CODES) {
                perCage.add(resolveOne(keys, status, rules, defaults));
            }
            out.put(id, perCage);
        }
        return out;
    }

    /**
     * 解析单个「笼位区域键 + 状态」的生效规则（纯函数，单测主入口）。
     *
     * @param regionKeys      该笼位的区域键列表（ROOM/FLOOR/CAMPUS，可能缺级）
     * @param statusCode      状态码
     * @param regionRules     预先取好的区域规则行（含该笼位涉及区域的全部行，可含别的状态）
     * @param defaultByStatus 预先取好的全局默认，按 status_code 索引
     */
    public static EffectiveAlertRule resolveOne(List<Map<String, String>> regionKeys,
                                                String statusCode,
                                                List<Map<String, Object>> regionRules,
                                                Map<String, Map<String, Object>> defaultByStatus) {
        // 只留这个状态的行，按 (regionType:regionId) 分桶。
        Map<String, List<Map<String, Object>>> byRegion = new HashMap<>();
        if (regionRules != null) {
            for (Map<String, Object> row : regionRules) {
                if (row == null || !statusCode.equals(str(row.get("statusCode")))) continue;
                String rt = str(row.get("regionType"));
                String rid = str(row.get("regionId"));
                if (rt == null || rid == null) continue;
                byRegion.computeIfAbsent(rt + ":" + rid, k -> new ArrayList<>()).add(row);
            }
        }

        // 层级就近：ROOM > FLOOR > CAMPUS。命中最近一级即用，不再往上看。
        for (String type : REGION_PRIORITY) {
            String regionId = regionIdOf(regionKeys, type);
            if (regionId == null) continue;
            List<Map<String, Object>> rows = byRegion.get(type + ":" + regionId);
            if (rows != null && !rows.isEmpty()) {
                return unionOf(statusCode, rows, defaultByStatus);
            }
        }

        // 未配过任何一级 → 全局默认；缺行则 fail-closed。
        Map<String, Object> def = defaultByStatus == null ? null : defaultByStatus.get(statusCode);
        if (def == null) {
            log.warn("[cage-alert-rule] 全局默认缺 status_code={}，fail-closed 不告警", statusCode);
            return new EffectiveAlertRule(statusCode, false, 0, false, false);
        }
        return fromDefault(statusCode, def);
    }

    /** 某一级「配过」时的并集解析。关闭行（enabled=0）不参与并集。 */
    private static EffectiveAlertRule unionOf(String statusCode, List<Map<String, Object>> rows,
                                              Map<String, Map<String, Object>> defaultByStatus) {
        boolean enabled = false;
        int minThreshold = Integer.MAX_VALUE;
        boolean highlight = false;
        boolean violation = false;
        for (Map<String, Object> row : rows) {
            if (!truthy(row.get("enabled"))) continue;
            enabled = true;
            minThreshold = Math.min(minThreshold, toInt(row.get("thresholdDays"), 0));
            boolean[] flags = actionFlags(str(row.get("action")));
            highlight |= flags[0];
            violation |= flags[1];
        }
        if (!enabled) {
            // 配过但全关：本区该状态不告警。阈值/动作给确定值（沿用全局默认阈值，动作取无）。
            Map<String, Object> def = defaultByStatus == null ? null : defaultByStatus.get(statusCode);
            int t = def == null ? 0 : toInt(def.get("thresholdDays"), 0);
            return new EffectiveAlertRule(statusCode, false, t, false, false);
        }
        return new EffectiveAlertRule(statusCode, true,
                minThreshold == Integer.MAX_VALUE ? 0 : minThreshold, highlight, violation);
    }

    private static EffectiveAlertRule fromDefault(String statusCode, Map<String, Object> def) {
        boolean enabled = truthy(def.get("enabled"));
        boolean[] flags = actionFlags(str(def.get("action")));
        return new EffectiveAlertRule(statusCode, enabled, toInt(def.get("thresholdDays"), 0),
                flags[0], flags[1]);
    }

    // ── 小工具 ──

    private static List<Map<String, String>> flattenRegions(Collection<List<Map<String, String>>> groups) {
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        for (List<Map<String, String>> g : groups) {
            for (Map<String, String> r : g) {
                if (r == null) continue;
                out.putIfAbsent(r.get("regionType") + ":" + r.get("regionId"), r);
            }
        }
        return List.copyOf(out.values());
    }

    private static Map<String, Map<String, Object>> indexDefaults(List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        if (rows == null) return out;
        for (Map<String, Object> r : rows) {
            String code = str(r.get("statusCode"));
            if (code != null) out.put(code, r);
        }
        return out;
    }

    private static String regionIdOf(List<Map<String, String>> regionKeys, String type) {
        if (regionKeys == null) return null;
        for (Map<String, String> r : regionKeys) {
            if (r != null && type.equals(r.get("regionType"))) return r.get("regionId");
        }
        return null;
    }

    /** action 列 HIGHLIGHT | VIOLATION | BOTH → [highlight, violation]。 */
    private static boolean[] actionFlags(String action) {
        boolean highlight = "HIGHLIGHT".equals(action) || "BOTH".equals(action);
        boolean violation = "VIOLATION".equals(action) || "BOTH".equals(action);
        return new boolean[]{highlight, violation};
    }

    private static boolean truthy(Object v) {
        if (v == null) return false;
        String s = String.valueOf(v).trim();
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    private static int toInt(Object v, int dflt) {
        if (v == null) return dflt;
        if (v instanceof Number n) return n.intValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return dflt;
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return dflt;
        }
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }
}

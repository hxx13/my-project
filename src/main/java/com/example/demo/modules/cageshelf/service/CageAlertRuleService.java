package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import com.example.demo.modules.cageshelf.mapper.CageAlertRuleMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistItemMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistMapper;
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
import java.util.TreeSet;

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
    private final CageInfoCodelistMapper codelistMapper;
    private final CageInfoCodelistItemMapper codelistItemMapper;

    public CageAlertRuleService(CageAlertRuleMapper mapper,
                                CageRegionCapabilityService regionCapabilityService,
                                CageInfoCodelistMapper codelistMapper,
                                CageInfoCodelistItemMapper codelistItemMapper) {
        this.mapper = mapper;
        this.regionCapabilityService = regionCapabilityService;
        this.codelistMapper = codelistMapper;
        this.codelistItemMapper = codelistItemMapper;
    }

    /**
     * 状态码 → 中文名。五个状态查静态表；**特殊饲养明细**（{@code SF_} + item_code）查码表。
     * 查不到退回码本身 —— 不静默成空串，排查时要看得见是哪个码没配到名字。
     */
    public String labelOf(String statusCode) {
        if (statusCode == null) return "";
        String known = STATUS_LABELS.get(statusCode);
        if (known != null) return known;
        if (!CageStatusIntervalService.isDetailStatus(statusCode)) return statusCode;
        String itemCode = statusCode.substring(CageStatusIntervalService.DETAIL_STATUS_PREFIX.length());
        return detailItemLabels().getOrDefault(itemCode, statusCode);
    }

    /**
     * 特殊饲养明细的码表项：{@code item_code → 中文名}，按码表 sort_order 返回（顺序即界面顺序）。
     *
     * <p>逐行 {@link #labelOf} 每次都要读一遍码表，批量场景（配置界面一次出全部行、批量打标签）
     * 走这里只读一次。码表未配/查不到回空表，调用方据此出「只有五个固定状态」的清单。
     */
    public Map<String, String> detailItemLabels() {
        Map<String, String> out = new LinkedHashMap<>();
        CageInfoCodelist cl = codelistMapper.selectByCode(CageStatusIntervalService.DETAIL_DICT_CODE);
        if (cl == null || cl.getId() == null) return out;
        for (CageInfoCodelistItem it : codelistItemMapper.selectByCodelistId(cl.getId())) {
            if (it != null && it.getItemCode() != null) out.put(it.getItemCode(), it.getItemLabel());
        }
        return out;
    }

    /**
     * 可配置告警阈值的**全部**状态码 = 五个固定状态 + 特殊饲养明细（{@code SF_} + item_code）。
     *
     * <p>为什么明细要单列：需特殊饲养本身可能是**常驻**的，真正要盯的是每个细项自己的变化
     * （需加食 / 勿加水 …）。每个明细项都是一个独立状态码，有各自的阈值、动作与违规联动，
     * 所以配置界面按这份清单出行 —— 写死五个，明细就永远配不了、也就永远不告警。
     * 码表项由维护人增删，这份清单跟着变，不在这里写死明细。
     */
    public List<String> configurableStatusCodes() {
        List<String> out = new ArrayList<>(STATUS_CODES);
        for (String itemCode : detailItemLabels().keySet()) {
            out.add(CageStatusIntervalService.DETAIL_STATUS_PREFIX + itemCode);
        }
        return out;
    }

    /** 上面那份清单的中文名（五个固定 + 明细码表），一次读回供配置界面批量打标签。 */
    public Map<String, String> configurableLabels() {
        Map<String, String> out = new LinkedHashMap<>(STATUS_LABELS);
        for (Map.Entry<String, String> e : detailItemLabels().entrySet()) {
            out.put(CageStatusIntervalService.DETAIL_STATUS_PREFIX + e.getKey(), e.getValue());
        }
        return out;
    }

    /**
     * 某笼位某状态**某通知对象**当前生效的告警规则。
     *
     * @param notifyTarget  通知对象：DEFAULT（原有单目标语义）/ VET / OCCUPANT
     * @param enabled       false = 该状态在此不告警
     * @param thresholdDays 持续多少天触发；0 = 状态一出现就触发
     * @param highlight     触发后是否在网格/弹窗高亮
     * @param violation     触发后是否自动发违规
     * @param startValue    计时起点：true = 出现 1 开始（1→0 结束，默认）；false = 出现 0 开始（0→1 结束）
     */
    public record EffectiveAlertRule(
            String statusCode,
            String notifyTarget,
            boolean enabled,
            int thresholdDays,
            boolean highlight,
            boolean violation,
            boolean startValue
    ) {
    }

    /**
     * 可配置的 (状态, 通知对象) 组合，顺序固定供输出稳定：内置状态 + 特殊饲养明细（码表项），
     * 每个再展开成它的 {@link CageStatusIntervalService#notifyTargetsOf 通知对象域}。
     *
     * <p>阈值配置页按这份清单出行 —— 健康异常因此天然出「兽医」「笼位所有者」两行。
     */
    public List<StatusTarget> configurableRuleKeys() {
        List<StatusTarget> out = new ArrayList<>();
        for (String code : configurableStatusCodes()) {
            for (String target : CageStatusIntervalService.notifyTargetsOf(code)) {
                out.add(new StatusTarget(code, target));
            }
        }
        return out;
    }

    /** 一个可配置的规则身份：(状态码, 通知对象)。 */
    public record StatusTarget(String statusCode, String notifyTarget) {
    }

    /**
     * 批量：一次取全部笼位的区域键、一次批量读规则行、一次读全局默认，然后内存解析。
     * 返回每个 cageId → 它每个 (状态, 通知对象) 的生效规则（全部都要有，即使按全局默认）。
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

        /*
          候选状态码 = 五个内置 ∪ **配置里实际出现过的其它码**。
          后者就是特殊饲养明细（SF_ + item_code）：它的项由码表维护、可增长，写死五个会让明细
          永远拿不到规则 —— 引擎按 fail-closed 视作「告警被关」，既不触发还会把存量清掉。
          顺序：内置五个在前（输出稳定），其余按码排序。
        */
        List<String> statusCodes = new ArrayList<>(STATUS_CODES);
        TreeSet<String> extra = new TreeSet<>();
        // 注意取的是行里的 statusCode，**不是** defaults 的 map 键 —— 键是 (状态:对象)，拿它比会
        // 把 "NEED_DIVIDE:DEFAULT" 当成一个新状态码塞进来。
        for (Map<String, Object> r : defaults.values()) {
            String code = str(r.get("statusCode"));
            if (code != null && !statusCodes.contains(code)) extra.add(code);
        }
        for (Map<String, Object> r : rules) {
            Object c = r == null ? null : r.get("statusCode");
            if (c != null && !statusCodes.contains(String.valueOf(c))) extra.add(String.valueOf(c));
        }
        statusCodes.addAll(extra);

        List<StatusTarget> ruleKeys = new ArrayList<>();
        for (String status : statusCodes) {
            for (String target : CageStatusIntervalService.notifyTargetsOf(status)) {
                ruleKeys.add(new StatusTarget(status, target));
            }
        }

        Map<Long, List<EffectiveAlertRule>> out = new LinkedHashMap<>();
        for (Long id : ids) {
            List<Map<String, String>> keys = keysByCage.getOrDefault(id, List.of());
            List<EffectiveAlertRule> perCage = new ArrayList<>(ruleKeys.size());
            for (StatusTarget k : ruleKeys) {
                perCage.add(resolveOne(keys, k.statusCode(), k.notifyTarget(), rules, defaults));
            }
            out.put(id, perCage);
        }
        return out;
    }

    /**
     * 解析单个「笼位区域键 + 状态 + 通知对象」的生效规则（纯函数，单测主入口）。
     *
     * @param regionKeys      该笼位的区域键列表（ROOM/FLOOR/CAMPUS，可能缺级）
     * @param statusCode      状态码
     * @param notifyTarget    通知对象（DEFAULT / VET / OCCUPANT）—— 健康异常两个对象各有各的阈值与方向
     * @param regionRules     预先取好的区域规则行（含该笼位涉及区域的全部行，可含别的状态/对象）
     * @param defaultByStatus 预先取好的全局默认，按 {@link CageStatusIntervalService#ruleKey} 索引
     */
    public static EffectiveAlertRule resolveOne(List<Map<String, String>> regionKeys,
                                                String statusCode,
                                                String notifyTarget,
                                                List<Map<String, Object>> regionRules,
                                                Map<String, Map<String, Object>> defaultByStatus) {
        String target = CageStatusIntervalService.normalizeTarget(notifyTarget);
        // 只留这个 (状态, 通知对象) 的行，按 (regionType:regionId) 分桶。
        Map<String, List<Map<String, Object>>> byRegion = new HashMap<>();
        if (regionRules != null) {
            for (Map<String, Object> row : regionRules) {
                if (row == null || !statusCode.equals(str(row.get("statusCode")))) continue;
                if (!target.equals(CageStatusIntervalService.normalizeTarget(str(row.get("notifyTarget"))))) continue;
                String rt = str(row.get("regionType"));
                String rid = str(row.get("regionId"));
                if (rt == null || rid == null) continue;
                byRegion.computeIfAbsent(rt + ":" + rid, k -> new ArrayList<>()).add(row);
            }
        }
        String ruleKey = CageStatusIntervalService.ruleKey(statusCode, target);

        /*
          **全局总闸**：全局默认行把这一项关了（enabled=0），就是全站停用 —— 区域规则不再有机会把它打开。
          没有这一道，全局开关按「就近覆盖」根本关不住已配区域规则的房间：
          用户把全局全关掉，区域规则照旧生效，看到的就是「关了没用」（2026-09-18 用户报）。
          所以顺序是「先过总闸，再谈就近」；全局缺行仍然按原逻辑落到 fail-closed。
        */
        Map<String, Object> def = defaultByStatus == null ? null : defaultByStatus.get(ruleKey);
        if (def != null && !truthy(def.get("enabled"))) {
            return new EffectiveAlertRule(statusCode, target, false, 0, false, false, true);
        }

        // 层级就近：ROOM > FLOOR > CAMPUS。命中最近一级即用，不再往上看。
        for (String type : REGION_PRIORITY) {
            String regionId = regionIdOf(regionKeys, type);
            if (regionId == null) continue;
            List<Map<String, Object>> rows = byRegion.get(type + ":" + regionId);
            if (rows != null && !rows.isEmpty()) {
                return unionOf(statusCode, target, rows, defaultByStatus);
            }
        }

        // 未配过任何一级 → 全局默认；缺行则 fail-closed。
        if (def == null) {
            log.warn("[cage-alert-rule] 全局默认缺 {}，fail-closed 不告警", ruleKey);
            // fail-closed 时方向给 true（= 现状语义）：缺行反而把方向翻成反向是最坏的结果。
            return new EffectiveAlertRule(statusCode, target, false, 0, false, false, true);
        }
        return fromDefault(statusCode, target, def);
    }

    /** 某一级「配过」时的并集解析。关闭行（enabled=0）不参与并集。 */
    private static EffectiveAlertRule unionOf(String statusCode, String notifyTarget,
                                              List<Map<String, Object>> rows,
                                              Map<String, Map<String, Object>> defaultByStatus) {
        boolean enabled = false;
        int minThreshold = Integer.MAX_VALUE;
        boolean highlight = false;
        boolean violation = false;
        // 计时起点（方向）**没有可并集的语义**：同区域多组长的方向由保存链保证一致（不一致直接拒绝保存）。
        // 万一同级真出现分歧（历史数据 / 绕过保存链写进来的行），取先出现的那个并打 warn，
        // 绝不做「取最小/取或」—— 那会得出一个谁都没配过的第三态。
        boolean startValue = startValueOf(rows.isEmpty() ? null : rows.get(0));
        boolean startValueTaken = false;
        for (Map<String, Object> row : rows) {
            if (!truthy(row.get("enabled"))) continue;
            enabled = true;
            minThreshold = Math.min(minThreshold, toInt(row.get("thresholdDays"), 0));
            boolean[] flags = actionFlags(str(row.get("action")));
            highlight |= flags[0];
            violation |= flags[1];
            boolean sv = startValueOf(row);
            if (!startValueTaken) {
                startValue = sv;
                startValueTaken = true;
            } else if (sv != startValue) {
                log.warn("[cage-alert-rule] 同级 {} 的计时起点不一致，取先出现的 {}（保存链本应拦住）",
                        CageStatusIntervalService.ruleKey(statusCode, notifyTarget), startValue);
            }
        }
        if (!enabled) {
            // 配过但全关：本区该状态不告警。阈值/动作给确定值（沿用全局默认阈值，动作取无）。
            // 方向仍回显第一行配过的值（界面上要看得出组长当时配了什么）。
            Map<String, Object> def = defaultByStatus == null ? null
                    : defaultByStatus.get(CageStatusIntervalService.ruleKey(statusCode, notifyTarget));
            int t = def == null ? 0 : toInt(def.get("thresholdDays"), 0);
            return new EffectiveAlertRule(statusCode, notifyTarget, false, t, false, false, startValue);
        }
        return new EffectiveAlertRule(statusCode, notifyTarget, true,
                minThreshold == Integer.MAX_VALUE ? 0 : minThreshold, highlight, violation, startValue);
    }

    private static EffectiveAlertRule fromDefault(String statusCode, String notifyTarget,
                                                  Map<String, Object> def) {
        boolean enabled = truthy(def.get("enabled"));
        boolean[] flags = actionFlags(str(def.get("action")));
        return new EffectiveAlertRule(statusCode, notifyTarget, enabled, toInt(def.get("thresholdDays"), 0),
                flags[0], flags[1], startValueOf(def));
    }

    /**
     * 计时起点取值：`start_value = 1` → true（出现 1 开始）；`0` → false。
     * 缺列/缺值/非法一律回落到 1（true = 现状语义）—— 缺值反而把方向翻成反向是最坏的结果。
     */
    private static boolean startValueOf(Map<String, Object> row) {
        return row == null || toInt(row.get("startValue"), 1) != 0;
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

    /** 全局默认按 (状态, 通知对象) 建索引 —— 键走 {@link CageStatusIntervalService#ruleKey}。 */
    private static Map<String, Map<String, Object>> indexDefaults(List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        if (rows == null) return out;
        for (Map<String, Object> r : rows) {
            String code = str(r.get("statusCode"));
            if (code == null) continue;
            out.put(CageStatusIntervalService.ruleKey(code, str(r.get("notifyTarget"))), r);
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

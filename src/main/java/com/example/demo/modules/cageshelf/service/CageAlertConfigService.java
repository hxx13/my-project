package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageAlertRuleMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 告警阈值配置的**读写唯一入口**（cage_alert_default 全局默认 + cage_region_alert_rule 区域阈值）。
 *
 * <p>只做配置的读/写/校验，不碰告警实例、不读快照、不做解析。解析（生效规则怎么算）是
 * {@link CageAlertRuleService} 的事；这里保证的是「写进去的形状能被它正确读出来」：
 * **每个可配置状态都落一行**（五个固定状态 + 特殊饲养明细的每个码表项；勾的 enabled=1、
 * 没勾的 enabled=0），于是「配过但全关」天然有行，不会退化成「零行 = 从未配置 = 回落全局默认」，
 * 组长才关得掉一个被全局默认打开的告警。
 *
 * <p><b>同一区域多个饲养组长 → 各自配各自的，生效并集</b>：写的时候只删 {@code configured_by = 操作人}
 * 的行，按区域整片删会把别人的配置一起抹掉（cage_region_capability 那边实测踩过）。
 * {@code asAdmin=true} 相反 —— 先清该区域**所有人**的行再写自己的，即「本区重置」，
 * 是唯一能清掉别人残留配置的路径。
 *
 * <p><b>为什么写/读都带能力判断（不只判 LEADER 行）</b>：{@code cage.alert.config} 这个能力码
 * 在 T1 种子里已注册并勾给了 {@code BREEDING_GROUP_LEADER}。如果这里只判「是不是该区域组长」、
 * 不消费这个能力码，它就沦为摆设，矩阵永远收窄不了「哪些身份能配告警」——这正是本模块
 * 反复踩的「声明了配置项却没实装」的坑。所以访问门槛 = 超管 OR（该区域 LEADER 行 AND 持有该能力）。
 */
@Service
public class CageAlertConfigService {

    /** 告警阈值配置能力码（T1 种子已注册、勾给 BREEDING_GROUP_LEADER）。 */
    public static final String CAP_ALERT_CONFIG = "cage.alert.config";

    /** 违规联动能力码：动作含 VIOLATION/BOTH 时，操作人还须持有它（超管除外）。 */
    public static final String CAP_ALERT_VIOLATION = "cage.alert.violation";

    private static final Set<String> ACTIONS = Set.of("HIGHLIGHT", "VIOLATION", "BOTH");

    private final CageAlertRuleMapper ruleMapper;
    private final CageRegionGrantService regionGrantService;
    private final CagePermissionService permissionService;
    private final CageShelfMapper shelfMapper;
    private final CageAlertRuleService alertRuleService;

    public CageAlertConfigService(CageAlertRuleMapper ruleMapper,
                                  CageRegionGrantService regionGrantService,
                                  CagePermissionService permissionService,
                                  CageShelfMapper shelfMapper,
                                  CageAlertRuleService alertRuleService) {
        this.ruleMapper = ruleMapper;
        this.regionGrantService = regionGrantService;
        this.permissionService = permissionService;
        this.shelfMapper = shelfMapper;
        this.alertRuleService = alertRuleService;
    }

    /**
     * 一条待落库的阈值规则（thresholdDays/action/enabled/startValue 可为 null，由 {@link #normalizeRules} 校验并报错）。
     *
     * @param startValue 计时起点：1 = 出现 1 开始（1→0 结束，默认）；0 = 出现 0 开始（0→1 结束）
     */
    public record Rule(String statusCode, Integer thresholdDays, String action, Boolean enabled,
                       Integer startValue) {
    }

    /**
     * 区域树节点（GET /config/regions 下发）。字段语义：
     * <ul>
     *   <li>{@code configured} —— 这一层自己在 cage_region_alert_rule 里有行（含全关行）；</li>
     *   <li>{@code descendantConfigured} —— 任一后代有行（折叠时一眼看出「下面配过」）；</li>
     *   <li>{@code locationOnly} —— 祖先节点仅为补路径定位，非本人可配（超管恒 false）。</li>
     * </ul>
     * 层级固定 CAMPUS → FLOOR → ROOM；ROOM 的 children 恒为空数组。
     */
    public record RegionTreeNode(String regionType, String regionId, String name,
                                 boolean configured, boolean descendantConfigured,
                                 boolean locationOnly, List<RegionTreeNode> children) {
    }

    // ── 全局默认 ──

    /**
     * 全局默认：五个固定状态 + 特殊饲养明细（码表项，各算一个独立状态）。
     * statusCode 恒按 {@link CageAlertRuleService#configurableStatusCodes()} 顺序返回。
     */
    public List<Map<String, Object>> globalView() {
        Map<String, Map<String, Object>> rows = defaultRows();
        Map<String, String> labels = alertRuleService.configurableLabels();
        List<String> codes = alertRuleService.configurableStatusCodes();
        List<Map<String, Object>> out = new ArrayList<>(codes.size());
        for (String code : codes) {
            Map<String, Object> r = rows.get(code);
            // 缺行（新加的码表项还没种默认行）回一个安全默认：阈值 0、仅高亮。总比 NPE 强。
            out.add(entry(code,
                    r == null ? 0 : toInt(r.get("thresholdDays"), 0),
                    r == null ? "HIGHLIGHT" : orDefaultAction(str(r.get("action"))),
                    r == null || truthy(r.get("enabled")),
                    r == null ? 1 : toInt(r.get("startValue"), 1),
                    labels));
        }
        return out;
    }

    /** 全量替换五行（校验 + 逐行 upsert，幂等）。 */
    @Transactional
    public void replaceGlobal(List<Rule> rules) {
        for (Rule r : normalizeRules(rules)) {
            ruleMapper.upsertDefaultRule(r.statusCode(), r.thresholdDays(), r.action(),
                    r.enabled() ? 1 : 0, r.startValue());
        }
    }

    // ── 区域阈值 ──

    /**
     * 当前登录人「能配告警阈值」的区域**树**：
     * 超管=全量真实笼架树（cage_shelf_index 校区→楼层→房间）；
     * 组长=持有能力时给其 LEADER 区域为根的子树（补祖先链定位，只到自己负责的部分）；否则空。
     *
     * <p>区域/名字/配置状态各自一次 SQL（listRoomTreeRows + listConfiguredRegionKeys + leaderRegions），
     * 其余在内存拼树、聚合，不逐节点回查（反 N+1）。
     */
    public List<RegionTreeNode> configurableRegions(String operatorId, boolean asAdmin) {
        if (!asAdmin && !permissionService.hasCapability(operatorId, CAP_ALERT_CONFIG)) {
            return List.of();
        }
        List<CageRegionGrant> leaderRegions = asAdmin ? List.of() : regionGrantService.leaderRegions(operatorId);

        Set<String> configured = new HashSet<>();
        for (Map<String, Object> r : ruleMapper.listConfiguredRegionKeys()) {
            configured.add(str(r.get("regionType")) + ":" + str(r.get("regionId")));
        }
        Tree tree = buildTree(shelfMapper.listRoomTreeRows());

        if (asAdmin) {
            return tree.roots.stream().map(n -> toTreeNode(n, configured)).toList();
        }
        if (leaderRegions.isEmpty()) return List.of();
        return pruneForLeader(tree, leaderRegions, configured);
    }

    // ── 区域树组装（内存） ──

    /** 组装中的可变节点；最后映射成 {@link RegionTreeNode}。 */
    private static final class Node {
        final String type;
        final String id;
        final String name;
        Node parent;
        boolean locationOnly;
        final List<Node> children = new ArrayList<>();

        Node(String type, String id, String name) {
            this.type = type;
            this.id = id;
            this.name = name;
        }

        String key() {
            return type + ":" + id;
        }
    }

    /** 全量树：校区有序根 + 全节点按 "TYPE:id" 索引（campus/floor/room id 各自全局唯一）。 */
    private static final class Tree {
        final List<Node> roots = new ArrayList<>();
        final Map<String, Node> byKey = new HashMap<>();
    }

    private static Tree buildTree(List<Map<String, Object>> rows) {
        Tree tree = new Tree();
        Map<String, Node> campuses = new LinkedHashMap<>();
        Map<String, Node> floors = new LinkedHashMap<>();
        Map<String, Node> rooms = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String campusId = str(r.get("campusId"));
            String floorId = str(r.get("floorId"));
            String roomId = str(r.get("roomId"));
            if (campusId == null || floorId == null || roomId == null) continue;

            String campusName = display(str(r.get("campusName")), campusId);
            String floorName = display(str(r.get("floorName")), floorId);
            String roomName = display(str(r.get("roomName")), roomId);

            Node campus = campuses.computeIfAbsent(campusId, k -> new Node("CAMPUS", k, campusName));
            Node floor = floors.computeIfAbsent(floorId, k -> new Node("FLOOR", k, campusName + " / " + floorName));
            Node room = rooms.computeIfAbsent(roomId, k -> new Node("ROOM", k, floorName + " / " + roomName));

            if (floor.parent == null) {
                floor.parent = campus;
                campus.children.add(floor);
            }
            if (room.parent == null) {
                room.parent = floor;
                floor.children.add(room);
            }
            if (!tree.roots.contains(campus)) tree.roots.add(campus);
        }
        for (Node c : tree.roots) index(c, tree.byKey);
        return tree;
    }

    private static void index(Node n, Map<String, Node> byKey) {
        byKey.put(n.key(), n);
        for (Node c : n.children) index(c, byKey);
    }

    /** 授权区域键集合（"TYPE:id"）。 */
    private static Set<String> grantedKeys(List<CageRegionGrant> grants) {
        Set<String> out = new HashSet<>();
        for (CageRegionGrant g : grants) {
            if (g == null || g.getRegionType() == null || g.getRegionId() == null) continue;
            out.add(g.getRegionType() + ":" + g.getRegionId());
        }
        return out;
    }

    /**
     * 「这个区域整个归我」：直接授权的区域算；**非房间**层还额外允许「子树里的房间全在我名下」——
     * 那种情况配一次整层生效，且不会碰到别人的房间（房间里有一间不是我的就不放行）。
     *
     * <p>可见性（{@link #pruneForLeader} 的 locationOnly）与访问权限（{@link #manageRegionAlertError}）
     * **必须共用这一个判据** —— 两边不一致就会出现「看得到『配置』按钮、点下去 403」。
     */
    private static boolean ownsWholeRegion(Node node, Set<String> granted) {
        if (node == null) return false;
        if (granted.contains(node.key())) return true;
        if ("ROOM".equals(node.type)) return false;   // 房间没直接授权就是别人的
        List<Node> rooms = new ArrayList<>();
        collectRooms(node, rooms);
        if (rooms.isEmpty()) return false;
        for (Node r : rooms) {
            if (!granted.contains(r.key())) return false;   // 有一间不是我的 → 整层不给配
        }
        return true;
    }

    private static void collectRooms(Node n, List<Node> out) {
        if ("ROOM".equals(n.type)) {
            out.add(n);
            return;
        }
        for (Node c : n.children) collectRooms(c, out);
    }

    private RegionTreeNode toTreeNode(Node n, Set<String> configured) {
        List<RegionTreeNode> children = new ArrayList<>(n.children.size());
        for (Node c : n.children) children.add(toTreeNode(c, configured));
        boolean self = configured.contains(n.key());
        boolean desc = children.stream().anyMatch(x -> x.configured() || x.descendantConfigured());
        return new RegionTreeNode(n.type, n.id, n.name, self, desc, n.locationOnly, children);
    }

    /**
     * 组长视角剪枝：只保留「被分配区域 + 其祖先链（locationOnly）+ 其子树」，
     * 兄弟分支（没被分配的子树）一律不给他。
     */
    private List<RegionTreeNode> pruneForLeader(Tree tree, List<CageRegionGrant> grants, Set<String> configured) {
        Set<String> assigned = new HashSet<>();
        List<Node> assignedNodes = new ArrayList<>();
        for (CageRegionGrant g : grants) {
            Node n = tree.byKey.get(g.getRegionType() + ":" + g.getRegionId());
            if (n == null) continue; // 授权指向已不存在的区域（脏数据），跳过
            assigned.add(n.key());
            assignedNodes.add(n);
        }
        if (assignedNodes.isEmpty()) return List.of();

        Set<Node> include = new HashSet<>();
        for (Node n : assignedNodes) {
            include.add(n);
            for (Node a = n.parent; a != null; a = a.parent) include.add(a);
            addSubtree(n, include);
        }

        // 拷贝出只含 include 的新树（父子关系沿用原树）。
        /*
          locationOnly（「仅定位」）在本路径下**一律 false**：按用户 2026-09-14 定的口径，
          「整层」指的是**该层当前可见（归本人）的那些房间**，不是服务端意义上的真整层 ——
          祖先节点下面只要还有本人负责的房间，就允许配置。
          配置动作由前端**按可见房间逐条下发**（不写楼层键的行：楼层行会波及同层别人负责、
          且自己没配规则的房间，那是越界）。字段保留只是为了不改接口形状，不再参与判定。
        */
        Map<Node, Node> copies = new HashMap<>();
        for (Node n : include) {
            Node copy = new Node(n.type, n.id, n.name);
            copy.locationOnly = false;
            copies.put(n, copy);
        }
        for (Node n : include) {
            Node copy = copies.get(n);
            for (Node child : n.children) {
                Node childCopy = copies.get(child);
                if (childCopy != null) {
                    childCopy.parent = copy;
                    copy.children.add(childCopy);
                }
            }
        }
        List<Node> roots = new ArrayList<>();
        for (Node c : tree.roots) {
            Node copy = copies.get(c);
            if (copy != null) roots.add(copy);
        }
        return roots.stream().map(n -> toTreeNode(n, configured)).toList();
    }

    /** 把一棵子树的全部节点收进 include（授权区域下面的房间要一起给，才配得动整层）。 */
    private static void addSubtree(Node n, Set<Node> include) {
        for (Node c : n.children) {
            include.add(c);
            addSubtree(c, include);
        }
    }

    private static String display(String name, String id) {
        return (name == null || name.isBlank()) ? id : name;
    }

    /**
     * 区域阈值访问门槛（读和写共用）：超管放行；否则必须是**本人负责的区域** AND 持有 cage.alert.config。
     *
     * <p>「本人负责」与区域树的 locationOnly 共用 {@link #ownsWholeRegion} 这一个判据：直接授权，
     * 或（非房间层的）子树房间全归本人。两边判据不一致就会出现「看得到『配置』按钮、点下去被 403」。
     * 见类注释——带能力判断是为了让这个能力码真正被消费。
     *
     * @return null = 放行；否则为拒绝原因
     */
    public String manageRegionAlertError(String operatorId, boolean asAdmin, String regionType, String regionId) {
        if (asAdmin) return null;
        Tree tree = buildTree(shelfMapper.listRoomTreeRows());
        Node node = tree.byKey.get(regionType + ":" + regionId);
        if (!ownsWholeRegion(node, grantedKeys(regionGrantService.leaderRegions(operatorId)))) {
            return "这块区域不由你负责，无法配置告警阈值";
        }
        if (!permissionService.hasCapability(operatorId, CAP_ALERT_CONFIG)) {
            return "你没有告警阈值配置权限";
        }
        return null;
    }

    /**
     * 区域阈值读视图（照 CageRegionCapabilityService#regionView 的形状）：
     * mine=操作人自己的行 / others=并集里别人的行（只读）/ defaults=全局默认（「未配置时按此生效」提示）。
     * 超管视角 mine 回该区域的**完整并集**、others 空——超管保存即重置本区。
     */
    public Map<String, Object> regionView(String regionType, String regionId,
                                          String operatorId, boolean asAdmin) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regionType", regionType);
        out.put("regionId", regionId);
        out.put("asAdmin", asAdmin);

        List<Map<String, Object>> rows = ruleMapper.listRegionRules(
                List.of(Map.of("regionType", regionType, "regionId", regionId)));
        // 「本区被配过吗」：有任意一行（含 enabled=0 的关闭行）就算配过。全关的区域同样是「配过」，
        // 前端据此区分「从未配置（回落全局默认）」与「配过但全关」。
        out.put("regionConfigured", !rows.isEmpty());
        out.put("defaults", globalView());

        if (asAdmin) {
            out.put("mine", rows.isEmpty() ? List.of() : adminUnion(regionType, regionId, rows));
            out.put("others", List.of());
        } else {
            Map<String, String> labels = alertRuleService.configurableLabels();
            List<Map<String, Object>> mine = new ArrayList<>();
            List<Map<String, Object>> others = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                String code = str(r.get("statusCode"));
                if (code == null) continue;
                Map<String, Object> e = entry(code, toInt(r.get("thresholdDays"), 0),
                        orDefaultAction(str(r.get("action"))), truthy(r.get("enabled")),
                        toInt(r.get("startValue"), 1), labels);
                if (operatorId.equals(str(r.get("configuredBy")))) mine.add(e);
                else others.add(e);
            }
            out.put("mine", sortByStatus(mine));
            out.put("others", sortByStatus(others));
        }
        return out;
    }

    /** 全量替换**本人在该区域**的告警阈值（先删自己的后插，事务内）。asAdmin 时先清全区域再写。 */
    @Transactional
    public void replaceRegion(String regionType, String regionId, List<Rule> rules,
                              String operatorId, boolean asAdmin) {
        if (!StringUtils.hasText(regionType) || !StringUtils.hasText(regionId)) {
            throw new IllegalArgumentException("区域类型与区域 id 必填");
        }
        List<Rule> ordered = normalizeRules(rules);
        // 动作含 VIOLATION/BOTH 会触发引擎自动发违规，属于比「配告警」更重的能力，单独再卡一道。
        // 必须在删行之前判定：先删后拒会把本区既有配置删光又没写回，留下半残。
        if (!asAdmin && ordered.stream().anyMatch(CageAlertConfigService::wantsViolation)
                && !permissionService.hasCapability(operatorId, CAP_ALERT_VIOLATION)) {
            throw new IllegalArgumentException("你没有违规联动权限，无法将动作设为「发违规」");
        }
        // 计时起点（方向）同级必须一致：阈值能取 min、动作能取并集，方向没有可合并的语义。
        // 同样必须在删行之前判定 —— 先删后拒会把本区既有配置删光又没写回。
        if (!asAdmin) {
            String conflict = findStartValueConflict(regionType, regionId, operatorId, ordered);
            if (conflict != null) throw new IllegalArgumentException(conflict);
        }
        if (asAdmin) {
            ruleMapper.deleteAllRegionRules(regionType, regionId);
        } else {
            ruleMapper.deleteRegionRules(regionType, regionId, operatorId);
        }
        for (Rule r : ordered) {
            ruleMapper.insertRegionRule(regionType, regionId, r.statusCode(), r.thresholdDays(),
                    r.action(), r.enabled() ? 1 : 0, r.startValue(), operatorId);
        }
    }

    // ── 内部 ──

    /**
     * 校验并规整为「五个状态各一条、按 STATUS_CODES 顺序」：状态码必须∈五者、thresholdDays>=0、
     * action∈三值、enabled 必填，且五者齐全。非法值抛错（别静默吞，否则前端只会看到「保存成功」
     * 实则丢了行）。
     */
    private List<Rule> normalizeRules(List<Rule> rules) {
        List<String> codes = alertRuleService.configurableStatusCodes();
        Map<String, Rule> byCode = new LinkedHashMap<>();
        if (rules != null) {
            for (Rule r : rules) {
                if (r == null) continue;
                if (!StringUtils.hasText(r.statusCode()) || !codes.contains(r.statusCode())) {
                    throw new IllegalArgumentException("非法状态码：" + r.statusCode());
                }
                if (r.thresholdDays() == null || r.thresholdDays() < 0) {
                    throw new IllegalArgumentException("thresholdDays 必须 >= 0（状态 " + r.statusCode() + "）");
                }
                if (!ACTIONS.contains(r.action())) {
                    throw new IllegalArgumentException("非法 action：" + r.action() + "（状态 " + r.statusCode() + "）");
                }
                if (r.enabled() == null) {
                    throw new IllegalArgumentException("enabled 缺失（状态 " + r.statusCode() + "）");
                }
                if (r.startValue() == null || (r.startValue() != 0 && r.startValue() != 1)) {
                    throw new IllegalArgumentException("startValue 必须是 0 或 1（状态 " + r.statusCode() + "）");
                }
                if (byCode.putIfAbsent(r.statusCode(), r) != null) {
                    throw new IllegalArgumentException("重复的状态码：" + r.statusCode());
                }
            }
        }
        List<Rule> ordered = new ArrayList<>(codes.size());
        for (String code : codes) {
            Rule r = byCode.get(code);
            if (r == null) throw new IllegalArgumentException("缺少状态：" + code);
            ordered.add(r);
        }
        return ordered;
    }

    /** 超管视角的「完整并集」：每个状态用 T3 的并集解析（enabled 任一开、阈值取最小、动作取并集）。 */
    private List<Map<String, Object>> adminUnion(String regionType, String regionId,
                                                 List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> defaultsByCode = defaultRows();
        Map<String, String> labels = alertRuleService.configurableLabels();
        List<Map<String, String>> keys = List.of(Map.of("regionType", regionType, "regionId", regionId));
        List<String> codes = alertRuleService.configurableStatusCodes();
        List<Map<String, Object>> out = new ArrayList<>(codes.size());
        for (String code : codes) {
            CageAlertRuleService.EffectiveAlertRule r =
                    CageAlertRuleService.resolveOne(keys, code, rows, defaultsByCode);
            out.add(entry(code, r.thresholdDays(), actionOf(r.highlight(), r.violation()), r.enabled(),
                    r.startValue() ? 1 : 0, labels));
        }
        return out;
    }

    private Map<String, Map<String, Object>> defaultRows() {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (Map<String, Object> r : ruleMapper.listDefaultRules()) {
            String code = str(r.get("statusCode"));
            if (code != null) out.put(code, r);
        }
        return out;
    }

    private Map<String, Object> entry(String code, int thresholdDays, String action, boolean enabled,
                                      int startValue, Map<String, String> labels) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("statusCode", code);
        // 中文名走 tags 表：五个固定状态 + 特殊饲养明细（明细名在码表里，可随时改）
        m.put("statusLabel", labels.getOrDefault(code, code));
        m.put("thresholdDays", thresholdDays);
        m.put("action", action);
        m.put("enabled", enabled);
        m.put("startValue", startValue);
        return m;
    }

    /** 计时起点的中文说明，用于拒绝保存时的报错（两个边都写清楚，省得用户去猜终点按哪边算）。 */
    private static String startValueLabel(int startValue) {
        return startValue == 1 ? "出现 1 开始（1→0 结束）" : "出现 0 开始（0→1 结束）";
    }

    /**
     * 同区域**别人**已配的计时起点与本次提交是否冲突。返回 null = 不冲突（该状态别人还没配过，或方向一致）。
     *
     * <p>只比同区域其他人的行：区域与全局不一致是**允许**的（区域可覆盖全局，与阈值/动作同口径）。
     * 阈值能取 min、动作能取并集，方向没有可合并的语义，所以同级分歧只能拒绝，不能并。
     */
    private String findStartValueConflict(String regionType, String regionId, String operatorId,
                                          List<Rule> ordered) {
        List<Map<String, Object>> rows = ruleMapper.listRegionRules(
                List.of(Map.of("regionType", regionType, "regionId", regionId)));
        Map<String, Integer> submitted = new LinkedHashMap<>();
        for (Rule r : ordered) submitted.put(r.statusCode(), r.startValue());
        for (Map<String, Object> row : rows) {
            String code = str(row.get("statusCode"));
            if (code == null || operatorId.equals(str(row.get("configuredBy")))) continue;
            Integer mine = submitted.get(code);
            if (mine == null) continue;
            int theirs = toInt(row.get("startValue"), 1);
            if (theirs != mine) {
                return "「" + alertRuleService.labelOf(code)
                        + "」的计时起点已被本区域其他饲养组长配为 " + startValueLabel(theirs)
                        + "，同一区域必须一致，请与其保持一致后再保存";
            }
        }
        return null;
    }

    private List<Map<String, Object>> sortByStatus(List<Map<String, Object>> entries) {
        List<String> order = alertRuleService.configurableStatusCodes();
        entries.sort((a, b) -> Integer.compare(
                order.indexOf(str(a.get("statusCode"))),
                order.indexOf(str(b.get("statusCode")))));
        return entries;
    }

    private static String actionOf(boolean highlight, boolean violation) {
        if (highlight && violation) return "BOTH";
        if (violation) return "VIOLATION";
        return "HIGHLIGHT";
    }

    /** 该规则的动作是否要求「发违规」（VIOLATION / BOTH 都要）。 */
    private static boolean wantsViolation(Rule r) {
        return "VIOLATION".equals(r.action()) || "BOTH".equals(r.action());
    }

    private static String orDefaultAction(String action) {
        return ACTIONS.contains(action) ? action : "HIGHLIGHT";
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

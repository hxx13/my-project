package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CagePermissionCapability;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CagePermissionMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 区域级学生能力的**唯一入口**（`cage_region_capability`）。
 *
 * <p>动机：学生侧能开哪些功能由**该区域负责的饲养组长**定，而不是全局一刀切。
 * 粒度与区域分配粒度一致——超管把区域分到哪一级（校区/楼层/房间），组长就在哪一级配。
 *
 * <p><b>四层里的第三层</b>：区域归属（谁管哪块）→ 身份矩阵（这类身份最多能用啥）→
 * 区域能力（该区域对学生开哪些）→ 成员勾选（组长逐人）。所以这里只做两件事：
 * 把「学生 → 课题组 → 笼位所在区域」解析出来，再在该区域已配的能力上取并集。
 *
 * <p><b>回落规则（唯一一条，两个调用点共用）</b>：某处（学生全部区域 / 某个笼位所在区域）
 * 一条配置行都没有 = **从未配置**，等于不限制，回落到该学生的身份矩阵上限；只要配过一行，
 * 就以配置为准。这样上线首日（全库无配置）行为与改造前完全一致，而任何一个组长配过之后，
 * 他的口径立即生效——包括横跨两区时「A 区开了、B 区没开」只影响 B 区的笼位。</p>
 *
 * <p><b>同一区域多位饲养组长 → 取并集</b>（2026-09-13 定）：超管完全可以把一个房间同时分给几个组长，
 * 这时生效的是**所有人所开能力的并集** —— 谁开的都算开，任一组长**只增不减**，不会互相覆盖。
 * 表里因此带 `configured_by`（唯一键含它），删除也只删自己那几行。
 * 要收窄只能走两个正当杠杆：超管改**矩阵**（那是上限），或把某个组长的区域撤掉。
 * 与 §7.4「跨区域取并集」同一取向。</p>
 *
 * <p><b>矩阵是总开关，区域只负责「各自独立关闭」</b>（2026-09-13 修）：保存时把矩阵上限里的
 * **每一项**都落一行，勾的 `enabled=1`、没勾的 `enabled=0`。于是「本区被配过」天然有行，
 * 「全关」= 全 0 行 → 并集为空 → 本区全部关闭。
 * （早期只存勾选的行，「配过且全关」与「从未配过」都是零行，组长**永远关不掉** —— 实测确认过。）
 *
 * <p><b>回落规则</b>：只有这些区域**一行都没有**才算「从未配置」，回落矩阵上限；
 * 有任意一行（哪怕全是关闭行）就按行的并集生效。上线首日全库无配置 → 行为与改造前一致。
 */
@Service
public class CageRegionCapabilityService {

    public static final String TYPE_CAMPUS = "CAMPUS";
    public static final String TYPE_FLOOR = "FLOOR";
    public static final String TYPE_ROOM = "ROOM";

    /** 学生**模式**能力码前缀：mode key ↔ 能力码一一对应，如 studentClaim → cage.student.mode.studentClaim。 */
    public static final String STUDENT_MODE_PREFIX = "cage.student.mode.";

    /** 学生侧模式的展示顺序（与前端模式岛一致）。 */
    public static final List<String> STUDENT_MODE_KEYS = List.of("studentClaim", "division", "confirm");

    public static String modeCapability(String modeKey) {
        return STUDENT_MODE_PREFIX + modeKey;
    }

    private final CagePermissionMapper mapper;
    private final CagePermissionService permissionService;
    private final CageShelfLocalAggCache localAggCache;
    private final UserGroupNameResolver groupNameResolver;
    private final CageCellIndexMapper cellIndexMapper;
    private final CageShelfMapper cageShelfMapper;

    public CageRegionCapabilityService(CagePermissionMapper mapper,
                                       CagePermissionService permissionService,
                                       CageShelfLocalAggCache localAggCache,
                                       UserGroupNameResolver groupNameResolver,
                                       CageCellIndexMapper cellIndexMapper,
                                       CageShelfMapper cageShelfMapper) {
        this.mapper = mapper;
        this.permissionService = permissionService;
        this.localAggCache = localAggCache;
        this.groupNameResolver = groupNameResolver;
        this.cellIndexMapper = cellIndexMapper;
        this.cageShelfMapper = cageShelfMapper;
    }

    // ── 解析：学生 → 区域 ──

    /**
     * 该学生课题组笼位分布到的区域，**按笼架分组**（每组是那一架的 房间/楼层/校区 三个键）。
     *
     * <p>必须分组：关闭是**分区域**的，解析也得逐架做。用一张拍平的键集去判，会把
     * 「关了 A 房」错误地扩散到该学生名下别的房间（或反过来被未配置的房间稀释回全开）。
     *
     * <p>走 {@link CageShelfLocalAggCache#attribution()}——笼位→笼架→课题归属已有内存缓存，
     * 不去新建落库列。课题组判定复用 {@link PersonnelProjectGroupUtil#cellBelongsToAnyUserGroup}，
     * 与申请池/认领校验同一口径（PI 或部门任一命中）。
     */
    public List<List<Map<String, String>>> myRegionGroups(User user) {
        if (user == null) return List.of();
        List<String> groups = groupNameResolver.resolve(user.getId());
        if (groups.isEmpty()) return List.of();
        // 按「同一架的三个键」去重：一架上万个笼位会产出大量重复的键组
        Map<String, List<Map<String, String>>> out = new LinkedHashMap<>();
        for (Map<String, Object> row : localAggCache.attribution()) {
            if (!PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groups,
                    str(row.get("projectPiName")), str(row.get("departmentName")))) continue;
            Map<String, Map<String, String>> keys = new LinkedHashMap<>();
            addRegion(keys, TYPE_ROOM, row.get("roomId"));
            addRegion(keys, TYPE_FLOOR, row.get("floorId"));
            addRegion(keys, TYPE_CAMPUS, row.get("campusId"));
            if (!keys.isEmpty()) out.putIfAbsent(String.join("|", keys.keySet()), List.copyOf(keys.values()));
        }
        return List.copyOf(out.values());
    }

    /** 某笼位所在区域的三个键（房间/楼层/校区）。查不到返回空列表。 */
    public List<Map<String, String>> regionsOfCage(Long animalCageId) {
        if (animalCageId == null) return List.of();
        Map<String, Object> loc = cellIndexMapper.lookupByAnimalCageId(animalCageId);
        if (loc == null) return List.of();
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        addRegion(out, TYPE_ROOM, loc.get("roomId"));
        addRegion(out, TYPE_FLOOR, loc.get("floorId"));
        addRegion(out, TYPE_CAMPUS, loc.get("campusId"));
        return List.copyOf(out.values());
    }

    /**
     * 批量取多个笼位的区域键（一次查库，替代逐笼 {@link #regionsOfCage} 的 N+1）。
     * 与 {@link #regionsOfCage} 同口径：房间/楼层/校区三级，缺的级不产键。
     */
    public Map<Long, List<Map<String, String>>> regionsOfCages(Collection<Long> animalCageIds) {
        if (animalCageIds == null || animalCageIds.isEmpty()) return Map.of();
        List<Long> ids = animalCageIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        Map<Long, LinkedHashMap<String, Map<String, String>>> acc = new LinkedHashMap<>();
        for (Map<String, Object> row : cellIndexMapper.lookupByAnimalCageIds(ids)) {
            Long cageId = toLong(row.get("animalCageId"));
            if (cageId == null) continue;
            LinkedHashMap<String, Map<String, String>> keys =
                    acc.computeIfAbsent(cageId, k -> new LinkedHashMap<>());
            addRegion(keys, TYPE_ROOM, row.get("roomId"));
            addRegion(keys, TYPE_FLOOR, row.get("floorId"));
            addRegion(keys, TYPE_CAMPUS, row.get("campusId"));
        }
        Map<Long, List<Map<String, String>>> out = new LinkedHashMap<>();
        for (Map.Entry<Long, LinkedHashMap<String, Map<String, String>>> e : acc.entrySet()) {
            out.put(e.getKey(), List.copyOf(e.getValue().values()));
        }
        return out;
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return Long.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static void addRegion(Map<String, Map<String, String>> acc, String type, Object id) {
        String v = str(id);
        if (!StringUtils.hasText(v)) return;
        acc.putIfAbsent(type + ":" + v, Map.of("regionType", type, "regionId", v));
    }

    // ── 读 ──

    private static String keyOf(Map<String, String> region) {
        return region.get("regionType") + ":" + region.get("regionId");
    }

    /** 把分组拍平去重——只为一次查库用（判定仍按分组做）。 */
    private static List<Map<String, String>> flatten(List<List<Map<String, String>>> groups) {
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        for (List<Map<String, String>> g : groups) {
            for (Map<String, String> r : g) out.putIfAbsent(keyOf(r), r);
        }
        return List.copyOf(out.values());
    }

    /**
     * 区域键 → 该区域的配置。**键出现过就代表这个区域被配过**（值可能是空集 = 本区全关，
     * 或只有几个能力被写行 = 只对这几个表过态）。
     *
     * @param recorded 表过态的能力码（含 enabled=0 的关闭行）
     * @param enabled  其中开着的
     */
    private record RegionConfig(Set<String> recorded, Set<String> enabled) {
    }

    private Map<String, RegionConfig> loadConfigByKey(List<Map<String, String>> regions) {
        Map<String, RegionConfig> out = new LinkedHashMap<>();
        if (regions == null || regions.isEmpty()) return out;
        Map<String, Set<String>> recorded = new LinkedHashMap<>();
        Map<String, Set<String>> enabled = new LinkedHashMap<>();
        for (Map<String, Object> row : mapper.listRegionCapabilityRows(regions)) {
            String key = str(row.get("regionType")) + ":" + str(row.get("regionId"));
            String cap = str(row.get("capabilityCode"));
            if (cap == null) continue;
            recorded.computeIfAbsent(key, k -> new LinkedHashSet<>()).add(cap);
            if ("1".equals(String.valueOf(row.get("enabled")))) {
                enabled.computeIfAbsent(key, k -> new LinkedHashSet<>()).add(cap);
            }
        }
        for (Map.Entry<String, Set<String>> e : recorded.entrySet()) {
            out.put(e.getKey(), new RegionConfig(e.getValue(), enabled.getOrDefault(e.getKey(), Set.of())));
        }
        return out;
    }

    /**
     * 一组区域键的生效能力。
     *
     * <p><b>矩阵是总开关，区域只做「显式关闭」</b>：配过的级里**写过行的能力**才按它的 enabled 算，
     * 没写行 = 本区没表态 = 跟随矩阵。多级之间取并集且只增不减：只要有一个配过的级把它配成 1 就开着，
     * 全部配过的级都配成 0 才关闭（与多组长共管同向）。
     *
     * <p><b>为什么不是「配过就以配过的行为准」</b>：那样一份**保存那一刻的矩阵快照**会永久生效 ——
     * 区域配过之后新注册的能力（如特殊饲养父状态/明细）在这里等于被默默关死，界面上既看不到也解释不清
     * （2026-09-14 用户报「H5/小程序状态模式没有特殊饲养入口」就是这条）。
     * 「配过且全关」仍然成立：那是把上限里每一项都写成 enabled=0，逐项都是显式关闭。
     */
    private Set<String> resolveGroup(List<Map<String, String>> keys,
                                     Map<String, RegionConfig> configByKey, Set<String> ceiling) {
        boolean anyConfigured = keys.stream().anyMatch(k -> configByKey.containsKey(keyOf(k)));
        if (!anyConfigured) return ceiling;
        Set<String> recorded = new LinkedHashSet<>();
        Set<String> enabled = new LinkedHashSet<>();
        for (Map<String, String> k : keys) {
            RegionConfig c = configByKey.get(keyOf(k));
            if (c == null) continue;
            recorded.addAll(c.recorded());
            enabled.addAll(c.enabled());
        }
        Set<String> out = new LinkedHashSet<>(ceiling);
        out.removeAll(recorded);   // 表过态的逐项结账
        out.addAll(enabled);       // 开着的那几项加回来
        out.retainAll(ceiling);    // 矩阵仍是上限
        return out;
    }

    /** 学生的可见能力：**逐架解析后取并集** —— 关了 A 房不影响他在 B 房的功能。 */
    private Set<String> visibleCapabilities(User user) {
        List<List<Map<String, String>>> groups = myRegionGroups(user);
        if (groups.isEmpty()) return Set.of();
        Set<String> ceiling = permissionService.identityCeiling(user.getId());
        Map<String, RegionConfig> config = loadConfigByKey(flatten(groups));
        Set<String> out = new LinkedHashSet<>();
        for (List<Map<String, String>> g : groups) out.addAll(resolveGroup(g, config, ceiling));
        return out;
    }

    /** 该学生可见的学生模式 key 列表。 */
    public List<String> studentModes(User user) {
        if (user == null) return List.of();
        Set<String> eff = visibleCapabilities(user);
        return STUDENT_MODE_KEYS.stream()
                .filter(k -> eff.contains(modeCapability(k)))
                .toList();
    }

    /**
     * 「操作按笼位收口」：对**具体某个笼位**动手时，只看该笼位所在的房间/楼层/校区。
     * 与列表（逐架并集）分工明确：列表保证「别的房间开着就还能看到入口」，
     * 这里保证「关了的那一块点不动」。
     */
    public boolean cageRegionEnabled(User user, Long animalCageId, String capabilityCode) {
        if (user == null) return false;
        List<Map<String, String>> keys = regionsOfCage(animalCageId);
        return resolveGroup(keys, loadConfigByKey(keys),
                permissionService.identityCeiling(user.getId())).contains(capabilityCode);
    }

    /**
     * 该学生在**指定区域**下是否开放了某能力。
     * 三个键都不传 = 不限定区域，取并集（旧行为，供没有「当前房间」上下文的调用方用）。
     */
    public boolean studentCapabilityVisible(User user, String capabilityCode,
                                            String roomId, String floorId, String campusId) {
        return user != null && effectiveForRegion(user, roomId, floorId, campusId).contains(capabilityCode);
    }

    /**
     * 该学生在**当前房间**下可用的学生模式 key 列表 —— 入口按房间判。
     *
     * <p>为什么入口也要按房间：一个学生的笼位可能横跨若干区域。A 房关掉的模式不该在 B 房生效，
     * 也不该因为 B 房开着就让人能从 A 房进去（那样点进去才被按笼位门禁拒 —— 两套口径）。
     * 所以切房间时前端带上当前房间的三个键重算。三个键都不传 = 取并集。
     */
    public List<String> studentModesForRegion(User user, String roomId, String floorId, String campusId) {
        if (user == null) return List.of();
        Set<String> eff = effectiveForRegion(user, roomId, floorId, campusId);
        return STUDENT_MODE_KEYS.stream()
                .filter(k -> eff.contains(modeCapability(k)))
                .toList();
    }

    /** 指定区域（三个键任一非空）→ 生效能力；三个键都空 → 退化为「逐架并集」。 */
    private Set<String> effectiveForRegion(User user, String roomId, String floorId, String campusId) {
        Map<String, Map<String, String>> keys = new LinkedHashMap<>();
        addRegion(keys, TYPE_ROOM, roomId);
        addRegion(keys, TYPE_FLOOR, floorId);
        addRegion(keys, TYPE_CAMPUS, campusId);
        if (keys.isEmpty()) return visibleCapabilities(user);
        // 只知道房间时（移动端只带 roomId）补齐楼层/校区 —— 否则组长配在楼层/校区一级的关闭
        // 这里查不到，会被当成「从未配置」而误放行。
        if (StringUtils.hasText(roomId) && (!StringUtils.hasText(floorId) || !StringUtils.hasText(campusId))) {
            Map<String, Object> up = cageShelfMapper.lookupHierarchyByRoom(roomId.trim());
            if (up != null) {
                if (!StringUtils.hasText(floorId)) addRegion(keys, TYPE_FLOOR, up.get("floorId"));
                if (!StringUtils.hasText(campusId)) addRegion(keys, TYPE_CAMPUS, up.get("campusId"));
            }
        }
        List<Map<String, String>> list = List.copyOf(keys.values());
        return resolveGroup(list, loadConfigByKey(list), permissionService.identityCeiling(user.getId()));
    }

    /**
     * 学生状态动作（合笼等）的按笼位收口。入参是**表单 canonical**（如 `needs_cohabitation`），
     * 不是动作 code —— canonical→动作 code 的反查只有 {@link CageModeVisibilityService#studentActionOfCanonical} 一处，
     * 别在这里自己拼能力码，方向反了会拼出一个永不存在的码、把功能整体锁死。
     * 非学生动作返回 true（调用方此前已用 canStudentEdit 判过，这里不加码）。
     */
    public boolean studentEditEnabledOnCage(User user, Long animalCageId, String canonical) {
        String action = CageModeVisibilityService.studentActionOfCanonical(canonical);
        if (action == null) return true;
        return cageRegionEnabled(user, animalCageId, CageModeVisibilityService.studentEditCapability(action));
    }

    /**
     * 组长配置界面要的：**我勾的**、**别人开的**（只读）、可勾的上限、能力码中文名。
     *
     * <p>一个区域可以有多个饲养组长，生效是**并集**（见类注释）。所以必须把「我勾的」和
     * 「别人开的」分开回：只回并集的话，组长会看到别人开的项被勾上、自己取消却毫无作用
     * （并集里还在），一定会以为界面坏了。
     *
     * <p><b>超管视角不同</b>：{@code asAdmin=true} 时 {@code configured} 回**该区域的完整并集**、
     * {@code others} 空 —— 超管保存即「重置本区域」，否则别人的行在他这里也是只读的，
     * 谁都删不掉，成死锁。
     */
    public Map<String, Object> regionView(String regionType, String regionId,
                                          String operatorId, boolean asAdmin) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regionType", regionType);
        out.put("regionId", regionId);
        // 前端要据此提示「保存会重置本区域」，别让超管以为自己只是在追加
        out.put("asAdmin", asAdmin);
        // 「本区被配过吗」：有任意一行（含 enabled=0 的关闭行）就算配过。前端据此决定要不要显示
        // 「按默认全部开放」——全关的区域同样是「配过」，不能显示成全开。
        out.put("regionConfigured", mapper.countConfiguredRegions(
                List.of(Map.of("regionType", regionType, "regionId", regionId))) > 0);
        List<String> union = mapper.listRegionCapabilities(regionType, regionId);
        if (asAdmin) {
            out.put("configured", union);
            out.put("others", List.of());
        } else {
            List<String> mine = mapper.listRegionCapabilitiesBy(regionType, regionId, operatorId);
            out.put("configured", mine);
            out.put("others", union.stream().filter(c -> !mine.contains(c)).toList());
        }
        Set<String> ceiling = permissionService.studentCeiling();
        Map<String, String> labels = new LinkedHashMap<>();
        List<String> ordered = new ArrayList<>();
        // 顺序按注册表 sort_order 走，别用 Set 的顺序（前端勾选框会跳）
        for (CagePermissionCapability c : permissionService.studentCapabilities()) {
            labels.put(c.getCode(), c.getLabel());
            if (ceiling.contains(c.getCode())) ordered.add(c.getCode());
        }
        out.put("ceiling", ordered);
        out.put("labels", labels);
        return out;
    }

    // ── 写 ──

    /**
     * 全量替换**本人在该区域**的开放能力（先删自己的后插，事务内）。超出**学生侧矩阵上限**的直接拒绝。
     *
     * <p>只删 {@code configured_by = 操作人} 的行：同一区域可以有多个饲养组长，生效是并集，
     * 按区域整片删会把别人的配置一起抹掉（实测过：A 配 3 项 → B 配 1 项 → A 的 3 项全没）。
     *
     * <p><b>{@code asAdmin=true} 时相反</b>：先清掉该区域**所有人**的行，再写自己的 ——
     * 超管保存 = 该区域重置。这是唯一能清掉别人残留配置的路径（组里界面上别人的行是只读的，
     * 没有这条路就成了谁都删不掉的死锁）。
     *
     * <p>空列表 = 本人在本区不贡献任何能力 —— 但注意零行等同于「本人从未配置」，
     * 若其他组长也没配，本区会回落矩阵上限（见类注释的已知边界）。
     */
    @Transactional
    public void replaceRegionCapabilities(String regionType, String regionId,
                                          Collection<String> codes, String operatorId, boolean asAdmin) {
        if (!StringUtils.hasText(regionType) || !StringUtils.hasText(regionId)) {
            throw new IllegalArgumentException("区域类型与区域 id 必填");
        }
        Set<String> ceiling = permissionService.studentCeiling();
        List<String> bad = (codes == null ? List.<String>of() : codes).stream()
                .filter(c -> !ceiling.contains(c))
                .distinct()
                .toList();
        if (!bad.isEmpty()) {
            throw new IllegalArgumentException("以下能力超出学生侧矩阵上限：" + String.join("、", bad));
        }
        if (asAdmin) {
            mapper.deleteAllRegionCapabilities(regionType, regionId);
        } else {
            mapper.deleteRegionCapabilities(regionType, regionId, operatorId);
        }
        // 把**矩阵上限里的每一项**都落一行：勾的 enabled=1、没勾的 enabled=0。
        // 于是「本区被配过」天然有行（不必另设标记表），而「全关」= 全 0 行 → 并集为空 → 本区全关。
        Set<String> picked = new LinkedHashSet<>(codes == null ? List.<String>of() : codes);
        for (String c : ceiling) {
            mapper.insertRegionCapability(regionType, regionId, c, operatorId, picked.contains(c) ? 1 : 0);
        }
    }

    /**
     * 区域分配被撤销 / 改走时，清掉该人在这块区域留下的学生能力配置。
     *
     * <p>不清的后果（实测过）：组长被移出某区域后配置**仍然生效**，而他自己已无权配置、
     * 别人（含超管）看到的又是只读的「其他组长开放」—— 没人能清，配置就此僵死。
     * 区域能力是区域分配的**派生物**，必须跟着分配的生命周期走。
     */
    public int clearRegionForUser(String regionType, String regionId, String accountId) {
        if (!StringUtils.hasText(regionType) || !StringUtils.hasText(regionId)
                || !StringUtils.hasText(accountId)) {
            return 0;
        }
        return mapper.deleteRegionCapabilities(regionType, regionId, accountId);
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }
}

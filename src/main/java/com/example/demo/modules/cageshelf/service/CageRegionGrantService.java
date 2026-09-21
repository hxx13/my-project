package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageRegionGrantMapper;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 区域归属的**唯一入口**，合并了原先的 person_scope（可见范围）与 cage_audit_assignment（审核人归属）。
 *
 * <p>user_id 统一 = personnel.id。鉴权侧传 sys_user.id 时先 {@code resolveIdByAccount} 折算，
 * 与旧 {@code PersonScopeService} 同口径。
 *
 * <p>本期只有 SCOPE / REVIEWER 两种角色（旧表搬来的）；LEADER / MEMBER 由第四期引入。
 * **可见范围只认 SCOPE，审核作用域只认 REVIEWER**，两者互不串——这是合并后最容易写错的地方。
 */
@Service
public class CageRegionGrantService {

    private final CageRegionGrantMapper mapper;
    private final PersonIdentityService identityService;
    private final CageVisibilityPolicy visibilityPolicy;
    private final CagePermissionService permissionService;
    private final CageRegionCapabilityService regionCapabilityService;

    public CageRegionGrantService(CageRegionGrantMapper mapper,
                                  PersonIdentityService identityService,
                                  CageVisibilityPolicy visibilityPolicy,
                                  CagePermissionService permissionService,
                                  CageRegionCapabilityService regionCapabilityService) {
        this.mapper = mapper;
        this.identityService = identityService;
        this.visibilityPolicy = visibilityPolicy;
        this.permissionService = permissionService;
        this.regionCapabilityService = regionCapabilityService;
    }

    /** 区域审核能力码（矩阵列）。**分区域即自带**（矩阵默认勾给饲养组长），组长也可逐人下放给组员。 */
    public static final String CAP_REVIEW_REGION = "cage.review.region";

    /** MEMBER 行的占位 region_type：组员行不表达区域，靠 leader_user_id 派生可见范围。 */
    public static final String REGION_TYPE_LEADER_GROUP = "LEADER_GROUP";

    /**
     * 可见范围（第一层数据范围的「补充放开」部分）；accountId 为 sys_user.id。
     *
     * <p><b>必须同时含 LEADER</b>：分配页自 2026-09-15 起写的就是 LEADER（饲养组长负责区域），
     * 只读 SCOPE 会让「给组长分配区域」对他的可见范围完全无效——4A 上线时就是这么错的，
     * 是回头验可见范围才发现的。SCOPE 是二期迁移遗留，留着兼容老数据。
     *
     * <p><b>组员继承组长整块</b>（设计 5.2「自己的全部行 ∪ 组长的全部行」）：MEMBER 行本身不带区域，
     * 这里按 leader_user_id 实时取组长的行——组长以后改区域，组员自动跟着变，不用同步。
     */
    public Map<String, List<String>> visibilityScopes(String accountId) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        String pid = resolve(accountId);
        if (pid == null) return out;
        List<CageRegionGrant> mine = mapper.listByUser(pid);
        collectVisibility(out, mine);
        for (CageRegionGrant g : mine) {
            if (CageRegionGrant.ROLE_MEMBER.equals(g.getGrantRole()) && g.getLeaderUserId() != null) {
                collectVisibility(out, mapper.listByUser(g.getLeaderUserId()));
            }
        }
        return out;
    }

    private void collectVisibility(Map<String, List<String>> out, List<CageRegionGrant> rows) {
        for (CageRegionGrant g : rows) {
            if (!CageRegionGrant.ROLE_SCOPE.equals(g.getGrantRole())
                    && !CageRegionGrant.ROLE_LEADER.equals(g.getGrantRole())) continue;
            out.computeIfAbsent(g.getRegionType(), k -> new ArrayList<>()).add(g.getRegionId());
        }
    }

    /**
     * 全量替换某组长的组员（组长维护本组；超管可代管任何组）。
     *
     * <p>MEMBER 行**不表达区域**：`region_type` 固定 {@link #REGION_TYPE_LEADER_GROUP}、
     * `region_id` 存组长的 personnel.id 兼作归属键——表的唯一键是
     * `(region_type, region_id, user_id, grant_role)`，这样天然约束「一个人在同一组里只有一行」。
     *
     * @param memberAccountIds 组员的**账号 id**（sys_user.id）列表
     */
    @Transactional
    public void replaceMembers(String leaderAccountId, List<String> memberAccountIds, String operatorId) {
        String leaderPid = resolve(leaderAccountId);
        if (leaderPid == null || leaderPid.isBlank()) throw new IllegalArgumentException("组长不存在，无法维护组员");
        if (memberAccountIds == null) memberAccountIds = List.of();

        // 先解析成 personnel.id：一人一组的口径必须按**人**判定，不能按账号 id——同一个人可能有
        // 两个 sys_user 账号（STAFF_xxx 与他的 aro_user_id），裸 id 比较会把同一个人看成两个。
        // 解析不到的人跳过、把自己加进来也跳过（成员是「他人」的概念）——沿用原行为，不在这里报错。
        List<String> incomingPids = new ArrayList<>();
        for (String acc : memberAccountIds) {
            String memberPid = resolve(acc);
            if (memberPid == null || memberPid.equals(leaderPid)) continue;
            if (!incomingPids.contains(memberPid)) incomingPids.add(memberPid);
        }
        assertNotInAnotherGroup(leaderPid, incomingPids);

        List<Map<String, Object>> before = memberRows(leaderAccountId);
        mapper.deleteMembersByLeader(leaderPid);
        Set<String> kept = new HashSet<>();
        for (String acc : memberAccountIds) {
            String memberPid = resolve(acc);
            // 解析不到的人跳过；把组长自己加进来也跳过（成员是「他人」的概念）
            if (memberPid == null || memberPid.equals(leaderPid)) continue;
            kept.add(acc);
            CageRegionGrant row = new CageRegionGrant();
            row.setRegionType(REGION_TYPE_LEADER_GROUP);
            row.setRegionId(leaderPid);
            row.setUserId(memberPid);
            row.setGrantRole(CageRegionGrant.ROLE_MEMBER);
            row.setLeaderUserId(leaderPid);
            row.setGrantedBy(operatorId);
            mapper.insert(row);
        }
        // 移出组 = 撤销一切「因在组才拿到」的下放能力（模式 / 代认领 / 区域审核）。
        // 不清的后果（实测过）：被移出的人仍按旧的下放能力生效 —— 而成员级勾选对模式是**全量覆盖**，
        // 残留那几条会把他靠身份拿到的模式整片替换掉，越权与降权同时发生。
        for (Map<String, Object> row : before) {
            String acc = str(row.get("memberAccountId"));
            if (acc == null || kept.contains(acc)) continue;
            permissionService.replaceMemberCapabilities(acc, List.of(), operatorId);
        }
    }

    /**
     * 一人只能属于一个饲养组长。这是**唯一**的 MEMBER 行写入口（见 replaceMembers），
     * 所以守卫放这里就覆盖了全部调用方，不必再去每个调用点各写一遍。
     *
     * <p>整包拒绝而不是「悄悄跳过那几个人」：组员是全量替换，静默丢人会让组长以为加上了、
     * 实际没加，下次保存又原样被丢 —— 报错说清是谁、被谁占了，才修得动。
     */
    private void assertNotInAnotherGroup(String leaderPid, List<String> memberPids) {
        if (memberPids.isEmpty()) return;
        List<String> taken = new ArrayList<>();
        for (Map<String, Object> r : mapper.listMemberOwners(leaderPid, memberPids)) {
            taken.add(str(r.get("memberName")) + "（已在 " + str(r.get("leaderName")) + " 的组）");
        }
        if (!taken.isEmpty()) {
            throw new IllegalArgumentException("一个人只能属于一个饲养组长，以下人员已被纳入：" + String.join("、", taken));
        }
    }

    /** 组员候选的默认身份口径：饲养组长的组员就是饲养员。 */
    public static final String MEMBER_IDENTITY_CODE = "BREEDER";

    /**
     * 「加组员」的候选人名单（默认只列饲养员），带每个人的**全部身份标签**与**占用者**。
     *
     * <p>为什么要带身份标签：组长只看得见姓名和工号时判断不了该不该加这个人，而身份（饲养员 /
     * 饲养组长 / 实验员…）才是他判断的依据。标签这里由后端随行下发，前端不必再为每一行单独查一次。
     *
     * <p>{@code boundLeaderName != null} 的人**仍在列表里**——前端置灰并写明占用者。
     */
    public List<Map<String, Object>> memberCandidates(String identityCode) {
        String code = StringUtils.hasText(identityCode) ? identityCode.trim() : MEMBER_IDENTITY_CODE;
        List<Map<String, Object>> rows = mapper.listMemberCandidates(code);
        if (rows.isEmpty()) return List.of();

        List<String> pids = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            String pid = str(r.get("personnelId"));
            if (pid != null) pids.add(pid);
        }
        // 一次批量取全部标签，避免逐行查库（行数 = 饲养员人数，逐行查就是 N+1）
        Map<String, List<IdentityTagVO>> identities = identityService.listByUserIds(pids);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("accountId", str(r.get("accountId")));
            m.put("name", str(r.get("name")));
            m.put("jobNumber", str(r.get("jobNumber")));
            List<Map<String, String>> tags = new ArrayList<>();
            for (IdentityTagVO t : identities.getOrDefault(str(r.get("personnelId")), List.of())) {
                Map<String, String> tag = new LinkedHashMap<>();
                tag.put("code", t.getCode());
                tag.put("label", t.getLabel());
                tags.add(tag);
            }
            m.put("identities", tags);
            m.put("boundLeaderName", str(r.get("boundLeaderName")));
            out.add(m);
        }
        return out;
    }

    /** 审核作用域；accountId 为 sys_user.id。 */
    public Map<String, List<String>> reviewScopes(String accountId) {
        return groupedByType(accountId, List.of(CageRegionGrant.ROLE_REVIEWER));
    }

    /** 某人是否有任何可见范围分配（旧 hasScopeAssignment 的等价物）。 */
    public boolean hasVisibilityScope(String accountId) {
        return !visibilityScopes(accountId).isEmpty();
    }

    private Map<String, List<String>> groupedByType(String accountId, List<String> roles) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        String pid = resolve(accountId);
        if (pid == null) return out;
        for (CageRegionGrant g : mapper.listByUser(pid)) {
            if (!roles.contains(g.getGrantRole())) continue;
            out.computeIfAbsent(g.getRegionType(), k -> new ArrayList<>()).add(g.getRegionId());
        }
        return out;
    }

    /** 全量替换某人某角色的区域（先删后插，事务内）。 */
    @Transactional
    public void replaceByAccount(String accountId, String grantRole, List<CageRegionGrant> grants, String operatorId) {
        String pid = resolve(accountId);
        if (pid == null || pid.isBlank()) throw new IllegalArgumentException("人员不存在，无法分配区域");
        List<CageRegionGrant> before = isLeaderRole(grantRole) ? listByAccount(accountId, grantRole) : List.of();
        mapper.deleteByUserAndRole(pid, grantRole);
        Set<String> kept = new HashSet<>();
        for (CageRegionGrant g : grants) {
            if (g.getRegionType() == null || g.getRegionId() == null) continue;
            kept.add(g.getRegionType() + ":" + g.getRegionId());
            CageRegionGrant row = new CageRegionGrant();
            row.setUserId(pid);
            row.setRegionType(g.getRegionType());
            row.setRegionId(g.getRegionId());
            row.setGrantRole(grantRole);
            row.setGrantedBy(operatorId);
            mapper.insert(row);
        }
        clearCapabilitiesForRemovedRegions(accountId, before, kept);
    }

    /** 撤销某人某角色的全部区域。 */
    @Transactional
    public void clearByAccount(String accountId, String grantRole) {
        String pid = resolve(accountId);
        if (pid == null || pid.isBlank()) return;
        List<CageRegionGrant> before = isLeaderRole(grantRole) ? listByAccount(accountId, grantRole) : List.of();
        mapper.deleteByUserAndRole(pid, grantRole);
        clearCapabilitiesForRemovedRegions(accountId, before, Set.of());
    }

    private static boolean isLeaderRole(String grantRole) {
        return CageRegionGrant.ROLE_LEADER.equals(grantRole);
    }

    /**
     * 区域能力是区域分配的**派生物**：不再负责的区域，把他配的学生能力一并清掉。
     *
     * <p>不清的后果（实测过）：组长被移出该区域后配置**仍然生效**，而他自己已无权配置、
     * 别人（含超管）看到的又是只读的「其他组长开放」—— 没人能清，配置就此僵死。
     */
    private void clearCapabilitiesForRemovedRegions(String accountId, List<CageRegionGrant> before, Set<String> keptKeys) {
        for (CageRegionGrant g : before) {
            if (keptKeys.contains(g.getRegionType() + ":" + g.getRegionId())) continue;
            regionCapabilityService.clearRegionForUser(g.getRegionType(), g.getRegionId(), accountId);
        }
    }

    /** 已分配过的人（带姓名与条目数），供分配页左栏列表。 */
    public List<Map<String, Object>> listAssignees(String grantRole) {
        return mapper.listAssignees(grantRole);
    }

    /** 某人某角色的原始区域列表（供设置页回显）。 */
    public List<CageRegionGrant> listByAccount(String accountId, String grantRole) {
        String pid = resolve(accountId);
        if (pid == null) return List.of();
        return mapper.listByUser(pid).stream()
                .filter(g -> grantRole.equals(g.getGrantRole()))
                .toList();
    }

    /** 某人作为**饲养组长**负责的区域（LEADER 行）；accountId 为 sys_user.id。 */
    public List<CageRegionGrant> leaderRegions(String accountId) {
        return listByAccount(accountId, CageRegionGrant.ROLE_LEADER);
    }

    /** 分配里出现过的真实区域去重（超管配告警/能力时列全部可选区域）。 */
    public List<Map<String, Object>> listDistinctRegions() {
        return mapper.listDistinctRegions();
    }

    /**
     * 覆盖给定区域（ROOM/FLOOR/CAMPUS 任一命中）的审核人**账号 id** 集合 —— 转移待签提醒的收件人来源。
     * 只认 LEADER/REVIEWER：SCOPE 是二期「可见范围」遗留，不是审核授权，不发给它。
     * 收件人要账号 id（pushService 收件人走 resolveIdByAccount），SQL 里已 COALESCE 折算。
     */
    public Set<String> reviewerAccountIdsCovering(Collection<String> roomIds,
                                                  Collection<String> floorIds,
                                                  Collection<String> campusIds) {
        List<String> rooms = nonBlank(roomIds);
        List<String> floors = nonBlank(floorIds);
        List<String> campuses = nonBlank(campusIds);
        if (rooms.isEmpty() && floors.isEmpty() && campuses.isEmpty()) return Set.of();
        Set<String> out = new HashSet<>();
        for (String id : mapper.listReviewerAccountIdsByRegions(rooms, floors, campuses)) {
            if (StringUtils.hasText(id)) out.add(id.trim());
        }
        return out;
    }

    private static List<String> nonBlank(Collection<String> ids) {
        if (ids == null) return List.of();
        return ids.stream().filter(StringUtils::hasText).map(String::trim).distinct().toList();
    }

    /**
     * 挂在该组长名下的组员（带姓名与条目数）。
     * 先把自己的 accountId 折成 personnel.id，因为 MEMBER 行的 leader_user_id 存的是后者。
     */
    public List<Map<String, Object>> memberRows(String leaderAccountId) {
        String pid = resolve(leaderAccountId);
        if (pid == null) return List.of();
        return mapper.listMemberRows(pid);
    }

    private String resolve(String accountId) {
        if (!StringUtils.hasText(accountId)) return null;
        return identityService.resolveIdByAccount(accountId.trim());
    }

    /**
     * 某审核人的生效判定：**能力 + 作用域**各算一次，供列表/角标逐行复用。
     *
     * <p>为什么单独抽出来：{@link #canReview} 每次要查身份、矩阵、成员勾选、可见范围、遗留归属
     * 共五六次库；待审列表是「全量拉取 + 内存过滤」，逐行调 canReview 会把查询数乘上行数。
     */
    public record ReviewAuthority(boolean active, boolean global, Map<String, List<String>> scope) {
        /** 笼位是否落在该审核人的作用域内。id 传字符串化值（null 跳过）。 */
        public boolean covers(String roomId, String floorId, String campusId) {
            // global 单独一个位：超管没有作用域可言，用空 scope 表达会被下面的 contains 判成「不覆盖」，
            // 结果角标和待审列表对超管全空 —— 必须显式短路。
            if (global) return true;
            if (!active) return false;
            return (roomId != null && scope.getOrDefault("ROOM", List.of()).contains(roomId))
                    || (floorId != null && scope.getOrDefault("FLOOR", List.of()).contains(floorId))
                    || (campusId != null && scope.getOrDefault("CAMPUS", List.of()).contains(campusId));
        }
    }

    /**
     * 某审核人是否能审批某笼位。**两段式**（架构设计 §8）：
     *
     * <p>① **能力**（谁有资格审）：矩阵给了该人身份的「区域审核」，或组长在「我的区域」里
     * 逐人下放给他。另外**迁移遗留的 REVIEWER 行本身就是一次显式授权**，也认——否则老数据里
     * 被直接指认过的审核人会突然审不了。
     *
     * <p>② **作用域**（能审哪一块）：笼位落在他自己的区域里——自己的 LEADER/SCOPE 行
     * ∪（若是组员）组长的全部行，再并上迁移遗留的 REVIEWER 行。
     *
     * <p>全局查看者（SUPER_ADMIN+）恒放行，不看这两条。
     *
     * <p>2026-09-13 起把作用域从「只认 REVIEWER 表」换成「认区域归属」：**分了区域就自带审核权**，
     * 不再需要在「审核人归属」里按人再配一遍（那个按人直配的旁路已随本次改动退役）。
     */
    public ReviewAuthority reviewAuthority(User user) {
        if (user == null) return new ReviewAuthority(false, false, Map.of());
        if (visibilityPolicy.isGlobalViewer(user)) {
            return new ReviewAuthority(true, true, Map.of());
        }
        return new ReviewAuthority(canReviewAtAll(user.getId()), false, reviewScopeFor(user.getId()));
    }

    public boolean canReview(User user, String roomId, String floorId, String campusId) {
        return reviewAuthority(user).covers(roomId, floorId, campusId);
    }

    /** ① 能力：矩阵身份 / 组长逐人下放 / 迁移遗留的 REVIEWER 行（后者是显式授权，等同有能力）。 */
    private boolean canReviewAtAll(String accountId) {
        if (permissionService.hasCapability(accountId, CAP_REVIEW_REGION)) return true;
        return !reviewScopes(accountId).isEmpty();
    }

    /** ② 作用域 = 可见范围（自己的 LEADER/SCOPE ∪ 组长的全部行）∪ 迁移遗留的 REVIEWER 行。 */
    private Map<String, List<String>> reviewScopeFor(String accountId) {
        Map<String, List<String>> out = new LinkedHashMap<>(visibilityScopes(accountId));
        reviewScopes(accountId).forEach((type, ids) -> {
            List<String> merged = new ArrayList<>(out.getOrDefault(type, List.of()));
            for (String id : ids) {
                if (!merged.contains(id)) merged.add(id);
            }
            out.put(type, merged);
        });
        return out;
    }

    /**
     * 全部归属，按审核人分组并带显示名 —— 设置中心总览用（否则只看到一张空表，
     * 不知道哪些位置已分配、归谁）。
     *
     * <p>两个 id 口径必须分清：{@code reviewerUserId} 回给前端的是**账号 id**（前端点一行会拿它
     * 去调 {@code GET /cage-audit-assignment/{reviewerUserId}}，那个接口走 resolveIdByAccount），
     * 而分组键是 {@code personnel.id}。名字也由 SQL join 出（{@code personnel.name}），
     * 不能交给 UserDisplayNameService —— 它按 staff_id/aro_user_id 建索引，不认 personnel.id。
     */
    public List<Map<String, Object>> listAllGrouped() {
        List<Map<String, Object>> rows = mapper.listAllWithNames(CageRegionGrant.ROLE_REVIEWER);
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, Map<String, Object>> byReviewer = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String owner = str(r.get("ownerPersonnelId"));
            if (owner == null) continue;
            Map<String, Object> entry = byReviewer.computeIfAbsent(owner, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("reviewerUserId", str(r.get("reviewerUserId")));
                m.put("reviewerName", str(r.get("reviewerName")));
                m.put("scopes", new ArrayList<Map<String, String>>());
                return m;
            });
            @SuppressWarnings("unchecked")
            List<Map<String, String>> scopes = (List<Map<String, String>>) entry.get("scopes");
            Map<String, String> s = new LinkedHashMap<>();
            s.put("scopeType", str(r.get("regionType")));
            s.put("scopeId", str(r.get("regionId")));
            scopes.add(s);
        }
        List<Map<String, Object>> out = new ArrayList<>(byReviewer.values());
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("reviewerName")),
                Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}

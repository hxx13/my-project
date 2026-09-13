package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageRegionGrantMapper;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    public CageRegionGrantService(CageRegionGrantMapper mapper,
                                  PersonIdentityService identityService,
                                  CageVisibilityPolicy visibilityPolicy) {
        this.mapper = mapper;
        this.identityService = identityService;
        this.visibilityPolicy = visibilityPolicy;
    }

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
        mapper.deleteMembersByLeader(leaderPid);
        if (memberAccountIds == null) return;
        for (String acc : memberAccountIds) {
            String memberPid = resolve(acc);
            // 解析不到的人跳过；把组长自己加进来也跳过（成员是「他人」的概念）
            if (memberPid == null || memberPid.equals(leaderPid)) continue;
            CageRegionGrant row = new CageRegionGrant();
            row.setRegionType(REGION_TYPE_LEADER_GROUP);
            row.setRegionId(leaderPid);
            row.setUserId(memberPid);
            row.setGrantRole(CageRegionGrant.ROLE_MEMBER);
            row.setLeaderUserId(leaderPid);
            row.setGrantedBy(operatorId);
            mapper.insert(row);
        }
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
        mapper.deleteByUserAndRole(pid, grantRole);
        for (CageRegionGrant g : grants) {
            if (g.getRegionType() == null || g.getRegionId() == null) continue;
            CageRegionGrant row = new CageRegionGrant();
            row.setUserId(pid);
            row.setRegionType(g.getRegionType());
            row.setRegionId(g.getRegionId());
            row.setGrantRole(grantRole);
            row.setGrantedBy(operatorId);
            mapper.insert(row);
        }
    }

    /** 撤销某人某角色的全部区域。 */
    @Transactional
    public void clearByAccount(String accountId, String grantRole) {
        String pid = resolve(accountId);
        if (pid == null || pid.isBlank()) return;
        mapper.deleteByUserAndRole(pid, grantRole);
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
     * 某审核人是否能审批某笼位（按楼层/房间/校区归属）。
     * 全局可见者（SUPER_ADMIN+）逃生口：全量可审；否则命中 REVIEWER 归属才可审。
     * roomId/floorId/campusId 传字符串化 id（null 跳过）。
     */
    public boolean canReview(User user, String roomId, String floorId, String campusId) {
        if (user == null) return false;
        if (visibilityPolicy.isGlobalViewer(user)) return true;
        Map<String, List<String>> grouped = reviewScopes(user.getId());
        if (grouped.isEmpty()) return false;
        if (roomId != null && grouped.getOrDefault("ROOM", List.of()).contains(roomId)) return true;
        if (floorId != null && grouped.getOrDefault("FLOOR", List.of()).contains(floorId)) return true;
        if (campusId != null && grouped.getOrDefault("CAMPUS", List.of()).contains(campusId)) return true;
        return false;
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

package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
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
    private final UserDisplayNameService displayNameService;

    public CageRegionGrantService(CageRegionGrantMapper mapper,
                                  PersonIdentityService identityService,
                                  CageVisibilityPolicy visibilityPolicy,
                                  UserDisplayNameService displayNameService) {
        this.mapper = mapper;
        this.identityService = identityService;
        this.visibilityPolicy = visibilityPolicy;
        this.displayNameService = displayNameService;
    }

    /** 可见范围（第一层数据范围的「补充放开」部分）；accountId 为 sys_user.id。 */
    public Map<String, List<String>> visibilityScopes(String accountId) {
        return groupedByType(accountId, List.of(CageRegionGrant.ROLE_SCOPE));
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
     */
    public List<Map<String, Object>> listAllGrouped() {
        List<CageRegionGrant> all = mapper.listAll().stream()
                .filter(g -> CageRegionGrant.ROLE_REVIEWER.equals(g.getGrantRole()))
                .toList();
        if (all.isEmpty()) {
            return List.of();
        }
        List<String> reviewerIds = all.stream()
                .map(CageRegionGrant::getUserId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        Map<String, String> names = displayNameService.resolveDisplayNames(reviewerIds);

        Map<String, Map<String, Object>> byReviewer = new LinkedHashMap<>();
        for (CageRegionGrant a : all) {
            String id = a.getUserId();
            if (id == null) continue;
            Map<String, Object> entry = byReviewer.computeIfAbsent(id, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("reviewerUserId", k);
                m.put("reviewerName", names.getOrDefault(k, k));
                m.put("scopes", new ArrayList<Map<String, String>>());
                return m;
            });
            @SuppressWarnings("unchecked")
            List<Map<String, String>> scopes = (List<Map<String, String>>) entry.get("scopes");
            Map<String, String> s = new LinkedHashMap<>();
            s.put("scopeType", a.getRegionType());
            s.put("scopeId", a.getRegionId());
            scopes.add(s);
        }
        List<Map<String, Object>> out = new ArrayList<>(byReviewer.values());
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("reviewerName")),
                Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }
}

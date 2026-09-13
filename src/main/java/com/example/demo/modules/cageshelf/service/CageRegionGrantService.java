package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageRegionGrantMapper;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
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

    public CageRegionGrantService(CageRegionGrantMapper mapper, PersonIdentityService identityService) {
        this.mapper = mapper;
        this.identityService = identityService;
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
}

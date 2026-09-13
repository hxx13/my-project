package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageMemberCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionGrant;
import com.example.demo.modules.cageshelf.mapper.CagePermissionMapper;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 笼架身份权限矩阵的**唯一入口**，取代此前的 cage_mode 逗号串配置。
 *
 * <p>语义变更（重要）：旧配置「某键没配 = 不限制 = 所有人可用」，矩阵改为 **fail-closed**——
 * 某能力一个身份都没勾就是谁也用不了。所以迁移必须保证每个能力至少有一行授权，
 * 否则会直接锁死一个模式。
 *
 * <p>另有**组员级勾选**（{@code cage_member_capability}）：饲养组长给本组组员逐人勾。
 * 语义是**全量覆盖**而非求并——有行就以组长勾的为准；写入时校验 ⊆ 该组员的身份上限。
 */
@Service
public class CagePermissionService {

    private final CagePermissionMapper mapper;
    private final PersonIdentityService identityService;

    public CagePermissionService(CagePermissionMapper mapper, PersonIdentityService identityService) {
        this.mapper = mapper;
        this.identityService = identityService;
    }

    /**
     * 某账号（sys_user.id）持有的身份 code 集合。
     * 身份表 user_id = personnel.id，必须先 resolve，否则身份永远查不到（getByUser 不 resolve）。
     */
    public Set<String> identityCodesOf(String accountId) {
        String pid = resolve(accountId);
        if (pid == null) return Collections.emptySet();
        return identityService.getByUser(pid).stream()
                .map(IdentityTagVO::getCode)
                .collect(Collectors.toSet());
    }

    private String resolve(String accountId) {
        if (!StringUtils.hasText(accountId)) return null;
        return identityService.resolveIdByAccount(accountId.trim());
    }

    /** 能力 code → 允许的身份 code 集合。空集表示该能力无人可用（fail-closed）。 */
    public Map<String, Set<String>> allowedIdentitiesByCapability() {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        for (CagePermissionGrant g : mapper.listGrants()) {
            out.computeIfAbsent(g.getCapabilityCode(), k -> new LinkedHashSet<>()).add(g.getIdentityCode());
        }
        return out;
    }

    /** 某身份集合能否使用某能力。空列/空身份都返回 false。 */
    public boolean canUse(String capabilityCode, Set<String> identityCodes) {
        // 先短路再查库：账号没有任何身份标签是常见情况，不该白查一次矩阵。
        if (capabilityCode == null || identityCodes == null || identityCodes.isEmpty()) return false;
        Set<String> allowed = allowedIdentitiesByCapability().get(capabilityCode);
        if (allowed == null || allowed.isEmpty()) return false;
        return !Collections.disjoint(allowed, identityCodes);
    }

    /** 能力注册表（矩阵的列）。 */
    public List<CagePermissionCapability> listCapabilities() {
        return mapper.listCapabilities();
    }

    /** 全部授权行（矩阵的勾）。 */
    public List<CagePermissionGrant> listGrants() {
        return mapper.listGrants();
    }

    @Transactional
    public void grant(String capabilityCode, String identityCode) {
        CagePermissionGrant row = new CagePermissionGrant();
        row.setCapabilityCode(capabilityCode);
        row.setIdentityCode(identityCode);
        mapper.insertGrant(row);
    }

    @Transactional
    public void revoke(String capabilityCode, String identityCode) {
        mapper.deleteGrant(capabilityCode, identityCode);
    }

    /** 空列检测：供界面标红，也供迁移后自检。 */
    public List<String> emptyCapabilities() {
        Set<String> withGrants = mapper.listGrants().stream()
                .map(CagePermissionGrant::getCapabilityCode)
                .collect(Collectors.toSet());
        return mapper.listCapabilities().stream()
                .map(CagePermissionCapability::getCode)
                .filter(code -> !withGrants.contains(code))
                .toList();
    }

    // ── 组员级勾选（组长逐人勾）──

    /** 某账号被逐人勾选的能力码。**空集 = 没配过**，调用方应回落到矩阵。 */
    public Set<String> memberCapabilities(String accountId) {
        String pid = resolve(accountId);
        if (pid == null) return Collections.emptySet();
        return mapper.listMemberCapabilities(pid).stream()
                .map(CageMemberCapability::getCapabilityCode)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /** 某账号按**身份矩阵**能用的能力码上限（成员级勾选只能落在这个范围里）。 */
    public Set<String> identityCeiling(String accountId) {
        Set<String> mine = identityCodesOf(accountId);
        if (mine.isEmpty()) return Collections.emptySet();
        Set<String> out = new LinkedHashSet<>();
        for (Map.Entry<String, Set<String>> e : allowedIdentitiesByCapability().entrySet()) {
            if (!Collections.disjoint(e.getValue(), mine)) out.add(e.getKey());
        }
        return out;
    }

    /**
     * 全量替换某组员的能力（**覆盖**该组员走矩阵的结果）。空列表 = 全收（不是"不限制"）。
     *
     * <p>超出身份上限的直接拒绝并抛错——组长只能在上限内收窄，不能凭空放大。
     */
    @Transactional
    public void replaceMemberCapabilities(String memberAccountId, Collection<String> codes, String operatorId) {
        String pid = resolve(memberAccountId);
        if (pid == null || pid.isBlank()) throw new IllegalArgumentException("组员不存在，无法配置能力");
        Set<String> ceiling = identityCeiling(memberAccountId);
        List<String> bad = (codes == null ? List.<String>of() : codes).stream()
                .filter(c -> !ceiling.contains(c))
                .distinct()
                .toList();
        if (!bad.isEmpty()) {
            throw new IllegalArgumentException("以下能力超出该组员的身份上限：" + String.join("、", bad));
        }
        mapper.deleteMemberCapabilities(pid);
        if (codes == null) return;
        for (String c : codes) {
            CageMemberCapability row = new CageMemberCapability();
            row.setUserId(pid);
            row.setCapabilityCode(c);
            row.setGrantedBy(operatorId);
            mapper.insertMemberCapability(row);
        }
    }
}

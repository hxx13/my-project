package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CagePermissionCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionGrant;
import com.example.demo.modules.cageshelf.mapper.CagePermissionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
 */
@Service
public class CagePermissionService {

    private final CagePermissionMapper mapper;

    public CagePermissionService(CagePermissionMapper mapper) {
        this.mapper = mapper;
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
}

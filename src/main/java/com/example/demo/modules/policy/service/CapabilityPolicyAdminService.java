package com.example.demo.modules.policy.service;

import com.example.demo.modules.policy.dto.CapabilityPolicyView;
import com.example.demo.modules.policy.dto.PatchCapabilityPolicyRequest;
import com.example.demo.modules.policy.entity.BizCapabilityPolicy;
import com.example.demo.modules.policy.mapper.BizCapabilityPolicyMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CapabilityPolicyAdminService {

    private final BizCapabilityPolicyMapper policyMapper;
    private final CapabilityPolicyService capabilityPolicyService;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public CapabilityPolicyAdminService(BizCapabilityPolicyMapper policyMapper,
                                        CapabilityPolicyService capabilityPolicyService,
                                        JdbcTemplate jdbcTemplate,
                                        ObjectMapper objectMapper) {
        this.policyMapper = policyMapper;
        this.capabilityPolicyService = capabilityPolicyService;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public List<CapabilityPolicyView> listViews() {
        return capabilityPolicyService.listAllResolved().stream().map(this::toView).collect(Collectors.toList());
    }

    @Transactional
    public boolean patch(String bizDomain, PatchCapabilityPolicyRequest req, String operatorId) {
        if (!StringUtils.hasText(bizDomain) || req == null) {
            return false;
        }
        String domain = bizDomain.trim().toUpperCase();
        BizCapabilityPolicy db = policyMapper.selectByDomain(domain);
        if (db == null) {
            return false;
        }
        Map<String, Object> before = snapshot(db);
        if (req.getMinRoleSubmit() != null) {
            db.setMinRoleSubmit(clampRole(req.getMinRoleSubmit()));
        }
        if (req.getMinRoleProcess() != null) {
            db.setMinRoleProcess(clampRole(req.getMinRoleProcess()));
        }
        if (req.getMinRoleViewAllPending() != null) {
            db.setMinRoleViewAllPending(clampRole(req.getMinRoleViewAllPending()));
        }
        if (StringUtils.hasText(req.getApplicantListMode())) {
            db.setApplicantListMode(req.getApplicantListMode().trim().toUpperCase());
        }
        if (req.getVisibilityPublicAllowed() != null) {
            db.setVisibilityPublicAllowed(req.getVisibilityPublicAllowed() > 0 ? 1 : 0);
        }
        if (req.getExtensionJson() != null) {
            db.setExtensionJson(req.getExtensionJson());
        }
        if (req.getEnabled() != null) {
            db.setEnabled(req.getEnabled() > 0 ? 1 : 0);
        }
        if (req.getSortOrder() != null) {
            db.setSortOrder(req.getSortOrder());
        }
        long ver = db.getPolicyVersion() == null ? 1L : db.getPolicyVersion() + 1;
        db.setPolicyVersion(ver);
        policyMapper.updatePolicy(db);
        insertAudit(domain, operatorId, "PATCH", before, snapshot(db));
        capabilityPolicyService.invalidateCache();
        return true;
    }

    private static int clampRole(int level) {
        return Math.min(6, Math.max(1, level));
    }

    private CapabilityPolicyView toView(BizCapabilityPolicy p) {
        CapabilityPolicyView v = new CapabilityPolicyView();
        v.setBizDomain(p.getBizDomain());
        v.setMinRoleSubmit(p.getMinRoleSubmit() == null ? 2 : p.getMinRoleSubmit());
        v.setMinRoleProcess(p.getMinRoleProcess() == null ? 3 : p.getMinRoleProcess());
        v.setMinRoleViewAllPending(p.getMinRoleViewAllPending() == null ? 4 : p.getMinRoleViewAllPending());
        v.setApplicantListMode(p.getApplicantListMode() == null ? "VISIBLE_POOL" : p.getApplicantListMode());
        v.setVisibilityPublicAllowed(p.getVisibilityPublicAllowed() == null ? 1 : p.getVisibilityPublicAllowed());
        v.setExtensionJson(p.getExtensionJson());
        v.setEnabled(p.getEnabled() == null ? 1 : p.getEnabled());
        v.setSortOrder(p.getSortOrder() == null ? 0 : p.getSortOrder());
        v.setPolicyVersion(p.getPolicyVersion() == null ? 0L : p.getPolicyVersion());
        return v;
    }

    private Map<String, Object> snapshot(BizCapabilityPolicy p) {
        Map<String, Object> m = new HashMap<>();
        m.put("minRoleSubmit", p.getMinRoleSubmit());
        m.put("minRoleProcess", p.getMinRoleProcess());
        m.put("minRoleViewAllPending", p.getMinRoleViewAllPending());
        m.put("applicantListMode", p.getApplicantListMode());
        m.put("visibilityPublicAllowed", p.getVisibilityPublicAllowed());
        m.put("extensionJson", p.getExtensionJson());
        m.put("enabled", p.getEnabled());
        m.put("sortOrder", p.getSortOrder());
        return m;
    }

    private void insertAudit(String domain, String operatorId, String action, Map<String, Object> before, Map<String, Object> after) {
        try {
            Map<String, Object> detail = new HashMap<>();
            detail.put("before", before);
            detail.put("after", after);
            String json = objectMapper.writeValueAsString(detail);
            jdbcTemplate.update(
                    "INSERT INTO biz_capability_policy_audit(biz_domain, operator_id, action, detail_json) VALUES (?,?,?,?)",
                    domain,
                    operatorId,
                    action,
                    json);
        } catch (Exception ignored) {
            // 审计失败不影响主事务
        }
    }
}

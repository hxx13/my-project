package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ReportFillService {

    private static final Logger log = LoggerFactory.getLogger(ReportFillService.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ObjectMapper objectMapper;

    public ReportFillService(ReportFormDefinitionMapper definitionMapper,
                             ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * Get available (published) forms for the current user's role and userId.
     * Role and userId are resolved in the controller from the request context
     * and passed in, avoiding direct coupling to AuthContextService internals.
     */
    public List<ReportFormDefinition> getAvailable(String role, Long userId) {
        return definitionMapper.selectPage().stream()
                .filter(f -> "published".equals(f.getStatus()))
                .filter(f -> userHasAccess(f, role, userId))
                .collect(Collectors.toList());
    }

    private boolean userHasAccess(ReportFormDefinition form, String role, Long userId) {
        if (form.getPermissionJson() == null || form.getPermissionJson().isBlank()) {
            return true; // no permission config = visible to all
        }
        try {
            var perm = objectMapper.readTree(form.getPermissionJson());
            var roles = perm.get("visibleRoles");
            if (roles != null) {
                for (var r : roles) {
                    if (r.asText().equals(role)) return true;
                }
            }
            var userIds = perm.get("visibleUserIds");
            if (userIds != null) {
                for (var u : userIds) {
                    if (u.asLong() == userId) return true;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse permission JSON for form id={}", form.getId(), e);
            return false;
        }
        return false;
    }
}

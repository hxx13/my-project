package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageRegionGrantMapper;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 回归：合并 person_scope + cage_audit_assignment 后，
 * ① 可见范围只认 SCOPE（本期没搬 LEADER/MEMBER，不能凭空放开）；
 * ② 审核作用域只认 REVIEWER；
 * ③ 两者互不串——SCOPE 不能让人获得审核权。
 */
@ExtendWith(MockitoExtension.class)
class CageRegionGrantServiceTest {

    private static final String ACCOUNT = "STAFF_abc";
    private static final String PID = "42";

    @Mock private CageRegionGrantMapper mapper;
    @Mock private PersonIdentityService identityService;

    private CageRegionGrantService service;

    @BeforeEach
    void setUp() {
        service = new CageRegionGrantService(mapper, identityService);
        when(identityService.resolveIdByAccount(anyString())).thenReturn(PID);
    }

    private CageRegionGrant grant(String type, String id, String role) {
        CageRegionGrant g = new CageRegionGrant();
        g.setRegionType(type);
        g.setRegionId(id);
        g.setUserId(PID);
        g.setGrantRole(role);
        return g;
    }

    @Test
    void visibilityScopesOnlyLookAtScopeRole() {
        when(mapper.listByUser(PID)).thenReturn(List.of(
                grant("ROOM", "r1", "SCOPE"),
                grant("FLOOR", "f1", "REVIEWER")));
        Map<String, List<String>> grouped = service.visibilityScopes(ACCOUNT);
        assertEquals(List.of("r1"), grouped.get("ROOM"));
        assertTrue(grouped.getOrDefault("FLOOR", List.of()).isEmpty(), "REVIEWER 不应进入可见范围");
    }

    @Test
    void reviewScopesOnlyLookAtReviewerRole() {
        when(mapper.listByUser(PID)).thenReturn(List.of(
                grant("ROOM", "r1", "SCOPE"),
                grant("FLOOR", "f1", "REVIEWER")));
        Map<String, List<String>> grouped = service.reviewScopes(ACCOUNT);
        assertEquals(List.of("f1"), grouped.get("FLOOR"));
        assertTrue(grouped.getOrDefault("ROOM", List.of()).isEmpty(), "SCOPE 不应带出审核权");
    }

    @Test
    void unresolvableAccountYieldsEmptyNotThrow() {
        when(identityService.resolveIdByAccount(anyString())).thenReturn(null);
        assertTrue(service.visibilityScopes(ACCOUNT).isEmpty());
        assertTrue(service.reviewScopes(ACCOUNT).isEmpty());
    }
}

package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CagePermissionGrant;
import com.example.demo.modules.cageshelf.mapper.CagePermissionMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * 回归：矩阵取代 cage_mode 逗号串后，
 * ① 空列语义改为 fail-closed（一个身份都没勾 = 谁也用不了），不再是「不限制=全放开」；
 * ② 授了谁就只有谁能用；
 * ③ 不存在的身份码不会命中。
 */
@ExtendWith(MockitoExtension.class)
class CagePermissionServiceTest {

    @Mock private CagePermissionMapper mapper;

    private CagePermissionService service;

    @BeforeEach
    void setUp() {
        service = new CagePermissionService(mapper);
    }

    private CagePermissionGrant g(String cap, String identity) {
        CagePermissionGrant row = new CagePermissionGrant();
        row.setCapabilityCode(cap);
        row.setIdentityCode(identity);
        return row;
    }

    @Test
    void grantedIdentityCanUseCapability() {
        when(mapper.listGrants()).thenReturn(List.of(g("cage.mode.allocate", "BREEDING_GROUP_LEADER")));
        assertTrue(service.canUse("cage.mode.allocate", Set.of("BREEDING_GROUP_LEADER")));
    }

    @Test
    void ungrantedIdentityCannotUseCapability() {
        when(mapper.listGrants()).thenReturn(List.of(g("cage.mode.allocate", "BREEDING_GROUP_LEADER")));
        assertFalse(service.canUse("cage.mode.allocate", Set.of("BREEDER")));
    }

    @Test
    void emptyColumnIsFailClosed() {
        when(mapper.listGrants()).thenReturn(List.of());
        assertFalse(service.canUse("cage.mode.allocate", Set.of("BREEDING_GROUP_LEADER")),
                "空列必须锁死，不能倒退回「不限制=全放开」");
    }

    @Test
    void identityWithNoTagsCannotUseAnything() {
        when(mapper.listGrants()).thenReturn(List.of(g("cage.mode.allocate", "BREEDING_GROUP_LEADER")));
        assertFalse(service.canUse("cage.mode.allocate", Set.of()));
    }
}

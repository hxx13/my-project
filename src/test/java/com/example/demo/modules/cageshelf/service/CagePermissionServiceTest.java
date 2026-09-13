package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageMemberCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionGrant;
import com.example.demo.modules.cageshelf.mapper.CagePermissionMapper;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
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
    @Mock private PersonIdentityService identityService;

    private CagePermissionService service;

    @BeforeEach
    void setUp() {
        service = new CagePermissionService(mapper, identityService);
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
        // 不 stub listGrants：空身份集合应当短路返回 false，压根不该去查矩阵。
        assertFalse(service.canUse("cage.mode.allocate", Set.of()));
    }

    /**
     * 回归：**代认领必须豁免身份上限**。它由组长逐人授予，若也套「矩阵是上限」，
     * 这个功能会完全无用——身份本来有的不需要授、身份没有的授不了。
     */
    @Test
    void leaderGrantableCapabilityBypassesIdentityCeiling() {
        when(identityService.resolveIdByAccount("ACC")).thenReturn("42");
        when(identityService.getByUser("42")).thenReturn(List.of()); // 无身份 → 上限为空
        service.replaceMemberCapabilities("ACC", List.of("cage.op.claim_on_behalf"), "op");
        verify(mapper).deleteMemberCapabilities("42");
        verify(mapper).insertMemberCapability(any(CageMemberCapability.class));
    }

    /** 反面：模式类能力仍然受身份上限约束，越限必须拒。 */
    @Test
    void modeCapabilityStillBoundedByIdentityCeiling() {
        when(identityService.resolveIdByAccount("ACC")).thenReturn("42");
        when(identityService.getByUser("42")).thenReturn(List.of()); // 上限为空
        assertThrows(IllegalArgumentException.class,
                () -> service.replaceMemberCapabilities("ACC", List.of("cage.mode.allocate"), "op"));
    }
}

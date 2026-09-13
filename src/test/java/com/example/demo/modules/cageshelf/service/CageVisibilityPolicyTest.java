package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 回归：可见范围阈值从 ADMIN 收到 SUPER_ADMIN 后，
 * ADMIN 不得再被当成「能看全部」的人 —— 否则收窄等于没做。
 */
class CageVisibilityPolicyTest {

    private final CageVisibilityPolicy policy = new CageVisibilityPolicy();

    private User withRole(RoleEnum role) {
        User u = new User();
        u.setRole(role);
        return u;
    }

    @Test
    void adminIsNotGlobalViewer() {
        assertFalse(policy.isGlobalViewer(withRole(RoleEnum.ADMIN)));
    }

    @Test
    void superAdminIsGlobalViewer() {
        assertTrue(policy.isGlobalViewer(withRole(RoleEnum.SUPER_ADMIN)));
    }

    @Test
    void platformOwnerIsGlobalViewer() {
        assertTrue(policy.isGlobalViewer(withRole(RoleEnum.PLATFORM_OWNER)));
    }

    @Test
    void nullUserIsNotGlobalViewer() {
        assertFalse(policy.isGlobalViewer(null));
    }

    @Test
    void nullRoleIsNotGlobalViewer() {
        User u = new User();
        u.setRole(null);
        assertFalse(policy.isGlobalViewer(u));
    }
}

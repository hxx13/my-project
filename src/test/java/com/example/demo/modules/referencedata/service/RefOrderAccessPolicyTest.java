package com.example.demo.modules.referencedata.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 订购域后台配置的准入契约：超管（后门）或持「业务」标签。
 *
 * <p>这是本次权限放开的**全部**安全面 —— 「超管 或 业务」这个谓词只此一处，
 * 时间管理与规格模板两组接口都调它，所以这里断言的就是那两处接口的行为。
 *
 * <p>背景（2026-09-23）：业务不是角色而是人员标签，RoleEnum 里没有它；
 * 规格模板原先走 capability 的角色等级 5 阈值，业务必被拒。故谓词必须显式读标签。
 */
class RefOrderAccessPolicyTest {

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("STAFF_1");
        u.setRole(role);
        return u;
    }

    private static RefOrderAccessPolicy policy(boolean isBusiness) {
        PersonIdentityService ids = mock(PersonIdentityService.class);
        when(ids.isBusiness("STAFF_1")).thenReturn(isBusiness);
        return new RefOrderAccessPolicy(ids);
    }

    @Test
    void 超管放行_不看业务标签() {
        assertTrue(policy(false).canManageOrderConfig(user(RoleEnum.SUPER_ADMIN)));
    }

    @Test
    void 平台所有者放行() {
        assertTrue(policy(false).canManageOrderConfig(user(RoleEnum.PLATFORM_OWNER)));
    }

    @Test
    void 普通角色持业务标签_放行() {
        assertTrue(policy(true).canManageOrderConfig(user(RoleEnum.STAFF)));
    }

    @Test
    void 普通角色无业务标签_拒绝() {
        assertFalse(policy(false).canManageOrderConfig(user(RoleEnum.STAFF)));
        assertFalse(policy(false).canManageOrderConfig(user(RoleEnum.ADMIN)));
    }

    @Test
    void 角色为空按MEMBER处理_无标签拒绝() {
        assertFalse(policy(false).canManageOrderConfig(user(null)));
    }

    @Test
    void 用户为空拒绝() {
        assertFalse(policy(true).canManageOrderConfig(null));
    }

    @Test
    void 既有方法不受影响() {
        RefOrderAccessPolicy p = policy(true);
        assertTrue(p.canSeeAll(user(RoleEnum.STAFF)), "canSeeAll 语义不变");
        assertTrue(p.canReview(user(RoleEnum.STAFF)), "canReview 仍是同条件");
        assertFalse(policy(false).canSeeAll(user(RoleEnum.MEMBER)));
    }
}

package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageClaim;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 「本人把自己的笼位转认领给同课题组的人」的准入判据里，唯一新增的那条规则：
 * 什么算「已经占了这笼位」。
 *
 * <p>不构造 {@link CageOperationService}（构造器 28 个依赖），只测抽出来的静态判据。
 * 这条不能放宽：转认领走 {@code claimOnBehalf}，它会**免审核直接建 locked 认领**，
 * 把 `pending_approval` 也算成占用者，等于申请人自己批自己 —— 绕过「申请/预定/确认」那道审批。
 */
class CageOperationServiceReassignOwnerTest {

    private static CageClaim claim(String status) {
        CageClaim c = new CageClaim();
        c.setClaimStatus(status);
        return c;
    }

    @Test
    void 已生效的认领才算占用_locked与confirmed() {
        assertTrue(CageOperationService.isOccupiedClaim(claim("locked")));
        assertTrue(CageOperationService.isOccupiedClaim(claim("confirmed")));
    }

    @Test
    void 审批中与释放审批中都不算占用() {
        assertFalse(CageOperationService.isOccupiedClaim(claim("pending_approval")));
        assertFalse(CageOperationService.isOccupiedClaim(claim("pending_release_approval")));
    }

    @Test
    void 终态与空值不算占用() {
        assertFalse(CageOperationService.isOccupiedClaim(claim("released")));
        assertFalse(CageOperationService.isOccupiedClaim(claim("cancelled")));
        assertFalse(CageOperationService.isOccupiedClaim(claim("rejected")));
        assertFalse(CageOperationService.isOccupiedClaim(new CageClaim()));
        assertFalse(CageOperationService.isOccupiedClaim(null));
    }
}

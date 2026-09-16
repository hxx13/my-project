package com.example.demo.modules.twin.scan.mobile;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MobileEnterGateTest {

    /** 不在任何名单里 → 跟随全局一键开关。 */
    @Test
    void noOverride_followsMasterOff() {
        assertFalse(MobileEnterGrantService.resolveVisible(false, null));
    }

    @Test
    void noOverride_followsMasterOn() {
        assertTrue(MobileEnterGrantService.resolveVisible(true, null));
    }

    /** 白名单不受一键开关控制：全局关了也照样可见。 */
    @Test
    void whitelistWins_overMasterOff() {
        assertTrue(MobileEnterGrantService.resolveVisible(false, Boolean.TRUE));
    }

    /** 黑名单不受一键开关控制：全局开了也照样不可见。 */
    @Test
    void blacklistWins_overMasterOn() {
        assertFalse(MobileEnterGrantService.resolveVisible(true, Boolean.FALSE));
    }

    @Test
    void whitelistWithMasterOn_staysVisible() {
        assertTrue(MobileEnterGrantService.resolveVisible(true, Boolean.TRUE));
    }

    @Test
    void blacklistWithMasterOff_staysHidden() {
        assertFalse(MobileEnterGrantService.resolveVisible(false, Boolean.FALSE));
    }
}

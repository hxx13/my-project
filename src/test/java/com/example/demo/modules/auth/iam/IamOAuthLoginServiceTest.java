package com.example.demo.modules.auth.iam;

import com.example.demo.modules.personnel.entity.Personnel;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class IamOAuthLoginServiceTest {

    @Test
    void resolveAccountId_prefersStaffId_overAroUserId() {
        Personnel p = new Personnel();
        p.setStaffId("STAFF_0001");
        p.setAroUserId("1234567890123456789");
        assertEquals("STAFF_0001", IamOAuthLoginService.resolveAccountId(p));
    }

    @Test
    void resolveAccountId_fallsBackToAroUserId_whenNoStaffId() {
        Personnel p = new Personnel();
        p.setAroUserId("1234567890123456789");
        assertEquals("1234567890123456789", IamOAuthLoginService.resolveAccountId(p));
    }

    @Test
    void resolveAccountId_returnsStaffId_whenOnlyStaffId() {
        Personnel p = new Personnel();
        p.setStaffId("STAFF_0001");
        assertEquals("STAFF_0001", IamOAuthLoginService.resolveAccountId(p));
    }

    @Test
    void resolveAccountId_returnsNull_whenNoAccountId() {
        Personnel p = new Personnel();
        p.setJobNumber("W2026");
        assertNull(IamOAuthLoginService.resolveAccountId(p));
    }
}

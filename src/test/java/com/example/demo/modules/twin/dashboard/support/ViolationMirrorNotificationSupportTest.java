package com.example.demo.modules.twin.dashboard.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ViolationMirrorNotificationSupportTest {

    @Test
    void bizIdIsDecimalString() {
        assertEquals("42", ViolationMirrorNotificationSupport.bizId(42));
        assertEquals("STUDENT_VIOLATION", ViolationMirrorNotificationSupport.BIZ_TYPE);
    }

    @Test
    void terminalStatusesWithdrawMirror() {
        assertTrue(ViolationMirrorNotificationSupport.isTerminalStatus("CLEARED"));
        assertTrue(ViolationMirrorNotificationSupport.isTerminalStatus("expired"));
        assertTrue(ViolationMirrorNotificationSupport.isTerminalStatus("PROCESSED"));
        assertTrue(ViolationMirrorNotificationSupport.isTerminalStatus("SUPERSEDED"));
    }

    @Test
    void activeAndUnknownStay() {
        assertFalse(ViolationMirrorNotificationSupport.isTerminalStatus("ACTIVE"));
        assertFalse(ViolationMirrorNotificationSupport.isTerminalStatus(null));
        assertFalse(ViolationMirrorNotificationSupport.isTerminalStatus(""));
        assertFalse(ViolationMirrorNotificationSupport.isTerminalStatus("DRAFT"));
    }

    @Test
    void deepLinkPaths() {
        assertEquals("/student/obligations?focus=9", ViolationMirrorNotificationSupport.h5SourceUrl(9));
        assertTrue(ViolationMirrorNotificationSupport.mpPath(3).contains("studentObligation"));
        assertTrue(ViolationMirrorNotificationSupport.isViolationBiz("STUDENT_VIOLATION"));
        assertFalse(ViolationMirrorNotificationSupport.isViolationBiz("ARO"));
    }
}

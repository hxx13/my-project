package com.example.demo.modules.twin.obligation.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ObligationSupportTest {

    @Test
    void sourceIdAndTerminalStatuses() {
        assertEquals("42", ObligationSupport.sourceIdForViolation(42));
        assertTrue(ObligationSupport.isTerminal("COMPLETED"));
        assertTrue(ObligationSupport.isTerminal("expired"));
        assertTrue(ObligationSupport.isTerminal("REVOKED"));
        assertFalse(ObligationSupport.isTerminal("PENDING_DISPOSITION"));
        assertFalse(ObligationSupport.isTerminal(null));
        assertEquals("9", ObligationSupport.sourceIdForAnnouncement(9));
        assertEquals("UNBOUND", ObligationSupport.SOURCE_UNBOUND);
    }
}

package com.example.demo.modules.twin.dashboard.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EnterSuccessCountSemanticsTest {

    @Test
    void probeConclusionKeepsPhysicalEnterCount() {
        assertEquals("successful_enter_count", EnterSuccessCountSemantics.PHYSICAL_MEANING);
        assertTrue(EnterSuccessCountSemantics.subqueryMustNotAliasAsEnterSuccessCount());
    }
}

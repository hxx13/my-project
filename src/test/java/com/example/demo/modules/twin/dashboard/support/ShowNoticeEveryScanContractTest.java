package com.example.demo.modules.twin.dashboard.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShowNoticeEveryScanContractTest {

    @Test
    void nullResolvesToDefaultTrue() {
        assertTrue(ShowNoticeEveryScanContract.resolve(null));
        assertTrue(ShowNoticeEveryScanContract.DEFAULT);
    }

    @Test
    void explicitValuesPassThrough() {
        assertTrue(ShowNoticeEveryScanContract.resolve(Boolean.TRUE));
        assertFalse(ShowNoticeEveryScanContract.resolve(Boolean.FALSE));
    }
}

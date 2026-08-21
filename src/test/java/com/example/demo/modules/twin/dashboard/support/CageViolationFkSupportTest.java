package com.example.demo.modules.twin.dashboard.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class CageViolationFkSupportTest {

    @Test
    void constraintNameStableForMigrations() {
        assertEquals("fk_tsv_cage_violation", CageViolationFkSupport.CONSTRAINT_NAME);
        assertEquals("twin_student_violation", CageViolationFkSupport.CHILD_TABLE);
        assertEquals("twin_cage_status_violation", CageViolationFkSupport.PARENT_TABLE);
        assertEquals("cage_violation_id", CageViolationFkSupport.CHILD_COLUMN);
        assertFalse(CageViolationFkSupport.CONSTRAINT_NAME.isBlank());
    }
}

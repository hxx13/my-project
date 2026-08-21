package com.example.demo.modules.twin.dashboard.support;

/**
 * T1-2 笼架父子 FK 约定：约束名与级联语义集中在一处，避免迁移脚本与 Java 漂移。
 */
public final class CageViolationFkSupport {

    public static final String CONSTRAINT_NAME = "fk_tsv_cage_violation";
    public static final String CHILD_TABLE = "twin_student_violation";
    public static final String PARENT_TABLE = "twin_cage_status_violation";
    public static final String CHILD_COLUMN = "cage_violation_id";

    private CageViolationFkSupport() {
    }
}

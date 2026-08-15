package com.example.demo.modules.aup.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.aup.entity.AupRecord;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * AUP 数据级权限（统一 where 作用域 + 阶段/操作人校验）。
 *
 * IACUC 角色不依赖 RoleEnum（其单值 role 无法表达「既是 PI 又是专家」），
 * 秘书/专家用 aup_reviewer 名册承载；此处直接以 JdbcTemplate 读取，
 * 避免与并行开发的审批/授权子模块的 Mapper 耦合。
 */
@Service
public class AupAccessPolicy {

    public static final String ROLE_LAB = "lab";
    public static final String ROLE_PI = "PI";
    public static final String ROLE_SECRETARY = "secretary";
    public static final String ROLE_EXPERT = "expert";
    public static final String ROLE_ADMIN = "admin";

    private final JdbcTemplate jdbcTemplate;

    public AupAccessPolicy(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean isAdmin(User user) {
        if (user == null) {
            return false;
        }
        RoleEnum role = user.getRole();
        return role != null && role.getLevel() >= RoleEnum.ADMIN.getLevel();
    }

    public boolean isSecretary(String userId) {
        return isReviewer(userId, "secretary");
    }

    public boolean isExpert(String userId) {
        return isReviewer(userId, "expert");
    }

    private boolean isReviewer(String userId, String reviewerRole) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        try {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM aup_reviewer WHERE user_id = ? AND reviewer_role = ? AND enabled = 1",
                    Integer.class, userId, reviewerRole);
            return n != null && n > 0;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isAssignedExpert(Long aupId, String userId) {
        if (aupId == null || userId == null || userId.isBlank()) {
            return false;
        }
        try {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM aup_review_assignment WHERE aup_id = ? AND reviewer_id = ?",
                    Integer.class, aupId, userId);
            return n != null && n > 0;
        } catch (Exception e) {
            return false;
        }
    }

    /** 该用户是否经手过该计划（出现在留痕中） */
    public boolean isActor(Long aupId, String userId) {
        if (aupId == null || userId == null || userId.isBlank()) {
            return false;
        }
        try {
            Integer n = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM aup_audit_log WHERE aup_id = ? AND actor = ?",
                    Integer.class, aupId, userId);
            return n != null && n > 0;
        } catch (Exception e) {
            return false;
        }
    }

    /** 用户所属课题组名（aro_personnel） */
    private String projectGroupNameOf(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT project_group_name FROM aro_personnel WHERE user_id = ?",
                    String.class, userId);
        } catch (Exception e) {
            return null;
        }
    }

    /** 用户与计划书是否同课题组（课题组成员协作查看/编辑用） */
    private boolean sameProjectGroup(AupRecord record, User user) {
        String pg = projectGroupNameOf(user != null ? user.getId() : null);
        return pg != null && !pg.isBlank() && pg.equals(record.getProjectGroupName());
    }

    public boolean canView(AupRecord record, User user) {
        if (record == null || user == null) {
            return false;
        }
        String uid = user.getId();
        if (isAdmin(user)) {
            return true;
        }
        if (uid != null && uid.equals(record.getCreatedBy())) {
            return true;
        }
        if (uid != null && uid.equals(record.getPiUserId())) {
            return true;
        }
        if (sameProjectGroup(record, user)) {
            return true;
        }
        if (isSecretary(uid) && ("formatReview".equals(record.getCurrentStage()) || isActor(record.getId(), uid))) {
            return true;
        }
        return isExpert(uid) && isAssignedExpert(record.getId(), uid);
    }

    public void assertViewable(AupRecord record, User user) {
        if (!canView(record, user)) {
            throw TwinBusinessException.of(403, "无权查看该计划书");
        }
    }

    /** 草稿可写：本人（实验员）或管理员；且计划处于 draft 阶段由调用方另行校验 */
    public void assertDraftWritable(AupRecord record, User user) {
        if (record == null || user == null) {
            throw TwinBusinessException.of(403, "无权操作该计划书");
        }
        if (isAdmin(user)) {
            return;
        }
        String uid = user.getId();
        if (uid != null && uid.equals(record.getCreatedBy())) {
            return;
        }
        if (sameProjectGroup(record, user)) {
            return;
        }
        throw TwinBusinessException.of(403, "仅申请人或同课题组成员可编辑该计划书");
    }

    /** 提交鉴权：组长（PI）或管理员可提交；组长「提交」即通过，直接进入格式审查 */
    public void assertCanSubmit(AupRecord record, User user) {
        if (record == null || user == null) {
            throw TwinBusinessException.of(403, "无权提交该计划书");
        }
        if (isAdmin(user)) {
            return;
        }
        String uid = user.getId();
        if (uid != null && uid.equals(record.getPiUserId())) {
            return;
        }
        throw TwinBusinessException.of(403, "仅组长或管理员可提交计划书");
    }

    /** 列表作用域角色：admin > secretary > expert > PI > lab */
    public String resolveScopeRole(User user) {
        if (isAdmin(user)) {
            return ROLE_ADMIN;
        }
        String uid = user.getId();
        if (isSecretary(uid)) {
            return ROLE_SECRETARY;
        }
        if (isExpert(uid)) {
            return ROLE_EXPERT;
        }
        if (user.getRole() == RoleEnum.PI) {
            return ROLE_PI;
        }
        return ROLE_LAB;
    }

    /** 写留痕/流转用的操作人角色：admin > 申请人(lab) > 组长(PI) > 秘书 > 专家 */
    public String resolveOperatorRole(AupRecord record, User user) {
        if (isAdmin(user)) {
            return ROLE_ADMIN;
        }
        String uid = user.getId();
        if (uid != null && uid.equals(record.getCreatedBy())) {
            return ROLE_LAB;
        }
        if (uid != null && uid.equals(record.getPiUserId())) {
            return ROLE_PI;
        }
        if (isSecretary(uid)) {
            return ROLE_SECRETARY;
        }
        if (isAssignedExpert(record.getId(), uid)) {
            return ROLE_EXPERT;
        }
        return ROLE_LAB;
    }

    /** 全量秘书 userId（通知用） */
    public java.util.List<String> listSecretaryUserIds() {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT DISTINCT user_id FROM aup_reviewer WHERE reviewer_role = 'secretary' AND enabled = 1",
                    String.class);
        } catch (Exception e) {
            return java.util.List.of();
        }
    }
}

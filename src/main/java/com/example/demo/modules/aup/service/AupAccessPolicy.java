package com.example.demo.modules.aup.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * AUP 数据级权限（统一 where 作用域 + 阶段/操作人校验）。
 *
 * IACUC 角色不依赖 RoleEnum（其单值 role 无法表达「既是 PI 又是专家」）；
 * 组长/秘书/专家改由人员身份标识系统（PersonIdentityService）按 code 动态判定，
 * 留痕/课题组/专家指派仍以 JdbcTemplate 读取。
 */
@Service
public class AupAccessPolicy {

    public static final String ROLE_LAB = "lab";
    public static final String ROLE_PI = "PI";
    public static final String ROLE_SECRETARY = "secretary";
    public static final String ROLE_EXPERT = "expert";
    public static final String ROLE_ADMIN = "admin";

    private final JdbcTemplate jdbcTemplate;
    private final PersonIdentityService personIdentityService;

    @Value("${aup.identity.pi-code:PI}")
    private String piCode;

    @Value("${aup.identity.secretary-code:SECRETARY}")
    private String secretaryCode;

    @Value("${aup.identity.expert-code:EXPERT}")
    private String expertCode;

    public AupAccessPolicy(JdbcTemplate jdbcTemplate, PersonIdentityService personIdentityService) {
        this.jdbcTemplate = jdbcTemplate;
        this.personIdentityService = personIdentityService;
    }

    public boolean isAdmin(User user) {
        if (user == null) {
            return false;
        }
        RoleEnum role = user.getRole();
        return role != null && role.getLevel() >= RoleEnum.ADMIN.getLevel();
    }

    /** 平台管理者（最高权限）：删除已提交计划书等敏感操作需此权限。 */
    public boolean isPlatformOwner(User user) {
        if (user == null) {
            return false;
        }
        RoleEnum role = user.getRole();
        return role != null && role.getLevel() >= RoleEnum.PLATFORM_OWNER.getLevel();
    }

    /** 组长（PI）：身份标识统一体系持有「组长」标签（key=staff_id）。 */
    public boolean isPi(User user) {
        if (user == null) {
            return false;
        }
        String uid = user.getId();
        if (uid == null || uid.isBlank()) {
            return false;
        }
        return hasTag(personIdentityService.getByUser(uid), piCode);
    }

    /** 秘书：STAFF 视角下持有「秘书」标签 code（sys_user.id）。 */
    public boolean isSecretary(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        return hasTag(personIdentityService.getByUser(userId), secretaryCode);
    }

    /** 专家：STAFF 视角下持有「专家」标签 code（sys_user.id）。 */
    public boolean isExpert(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        return hasTag(personIdentityService.getByUser(userId), expertCode);
    }

    /** 标签列表是否命中目标 code（null 安全）。 */
    private boolean hasTag(List<IdentityTagVO> tags, String target) {
        if (tags == null || target == null) {
            return false;
        }
        for (IdentityTagVO tag : tags) {
            if (tag != null && Objects.equals(tag.getCode(), target)) {
                return true;
            }
        }
        return false;
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

    /** 提交鉴权：申请人（createdBy）/同课题组/组长（PI）/管理员均可提交；提交后目标阶段由 AupService.submit 按身份区分 */
    public void assertCanSubmit(AupRecord record, User user) {
        if (record == null || user == null) {
            throw TwinBusinessException.of(403, "无权提交该计划书");
        }
        if (isAdmin(user)) {
            return;
        }
        if (isPi(user)) {
            return;
        }
        String uid = user.getId();
        if (uid != null && uid.equals(record.getCreatedBy())) {
            return;
        }
        if (sameProjectGroup(record, user)) {
            return;
        }
        throw TwinBusinessException.of(403, "仅申请人、同课题组、组长或管理员可提交计划书");
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
        if (isPi(user)) {
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
        if (isPi(user)) {
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

    /** 全量秘书 userId（通知用，来自 STAFF 视角身份标识） */
    public List<String> listSecretaryUserIds() {
        try {
            Map<String, List<IdentityTagVO>> byScope =
                    personIdentityService.listByUserIds(null);
            List<String> result = new ArrayList<>();
            for (Map.Entry<String, List<IdentityTagVO>> entry : byScope.entrySet()) {
                if (hasTag(entry.getValue(), secretaryCode)) {
                    result.add(entry.getKey());
                }
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }
}

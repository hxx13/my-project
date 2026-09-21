package com.example.demo.modules.personnel.service;

import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 人员人工合并：把「同一自然人的教职工行」与「学生行」并成一行。
 *
 * <p>为什么必须真合并：{@link PersonKeyResolver#toPersonKey} 取 {@code get(0)}，
 * 同一人两行会让写入落到随机的行上。
 *
 * <p>两类别名的区别很关键：历史数据若按**账号 id**（staff_id / aro_user_id）存，靠
 * {@code lookupKeys()} 的三键并集天然命中，**无需搬迁**；但若按 **personnel.id** 存，
 * 被合并行的 id 删除后那些行就是孤儿，而 {@code lookupKeys()} 不含被删的 id，**查不回来**。
 * 后者必须逐个改指，见 {@link #PERSONNEL_ID_TABLES}。
 */
@Service
public class PersonnelMergeService {

    private static final Logger log = LoggerFactory.getLogger(PersonnelMergeService.class);

    /**
     * 存 {@code personnel.id}（而非账号 id）、合并时必须改指的表。
     *
     * <p><b>维护义务：任何新表若存 {@code personnel.id}，必须加进这里。</b>
     * 漏掉的后果是静默丢数据——被合并行的 id 删除后，那些行成为孤儿，
     * 而 {@link PersonKeyResolver#lookupKeys} 返回的键里**不含被删的 id**，查不回来。
     *
     * <p>清单由实测得出（取值形态 + DDL 注释 + 写入口代码三路互证，2026-09-19）：
     * {@code person_identity.user_id} 2531/2532 行为 personnel.id、{@code cage_region_grant.user_id} 64/64、
     * {@code cage_transfer_log.occupant_id} 38/38。
     * 注意 {@code health_survey_response.person_id} 与 {@code person_qualification.person_id} 是**混合列**
     * （旧行 = 账号 id、新行 = personnel.id），改指只会命中新式行，旧式行不受影响。
     *
     * <p>以下表存的是**账号 id**（不是 personnel.id），故不在清单内：
     * {@code exam_submission.person_id}（19 位 aro_user_id）、
     * {@code door_swipe_rule_record.person_id} / {@code twin_dahua_swing_record.person_id}（大华平台自带 person id）、
     * {@code report_form_submission.user_id}（sys_user.id）、{@code cage_op_request.applicant_id / reviewer_id}（sys_user.id）。
     */
    private static final String[][] PERSONNEL_ID_TABLES = {
            {"personnel_notify_binding", "personnel_id"},
            {"crf_dag_user", "personnel_id"},
            {"team_member", "personnel_id"},
            {"team_join_request", "personnel_id"},
            {"team_join_request", "reviewer_personnel_id"},
            {"team", "owner_personnel_id"},
            {"team_audit_log", "actor_personnel_id"},
            {"cage_transfer_log", "occupant_id"},
            {"cage_transfer_log", "operator_id"},
            {"person_identity", "user_id"},
            {"cage_region_grant", "user_id"},
            {"cage_region_grant", "leader_user_id"},
            {"cage_member_capability", "user_id"},
            {"health_survey_response", "person_id"},
            {"person_qualification", "person_id"},
            {"crf_data_audit_log", "operator_id"},
            {"crf_import_batch", "operator_id"},
            {"crf_record_snapshot", "created_by"},
            {"crf_signature", "signer_id"},
            {"person_scope", "user_id"},
    };

    private final PersonnelMapper personnelMapper;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelMergeService(PersonnelMapper personnelMapper, JdbcTemplate jdbcTemplate) {
        this.personnelMapper = personnelMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(rollbackFor = Exception.class)
    public void merge(Long survivorId, Long mergedId, String operatorId) {
        if (survivorId == null || mergedId == null) {
            throw new IllegalArgumentException("人员 id 不能为空");
        }
        if (survivorId.equals(mergedId)) {
            throw new IllegalArgumentException("不能合并自己");
        }
        Personnel survivor = personnelMapper.findById(survivorId);
        Personnel merged = personnelMapper.findById(mergedId);
        if (survivor == null || merged == null) {
            throw new IllegalArgumentException("人员不存在");
        }

        if (!StringUtils.hasText(survivor.getStaffId())) survivor.setStaffId(merged.getStaffId());
        if (!StringUtils.hasText(survivor.getAroUserId())) survivor.setAroUserId(merged.getAroUserId());
        if (!StringUtils.hasText(survivor.getJobNumber())) survivor.setJobNumber(merged.getJobNumber());
        personnelMapper.update(survivor);

        for (String[] t : PERSONNEL_ID_TABLES) {
            jdbcTemplate.update("UPDATE " + t[0] + " SET " + t[1] + " = ? WHERE " + t[1] + " = ?",
                    survivorId, mergedId);
        }

        if (StringUtils.hasText(survivor.getStaffId()) && StringUtils.hasText(survivor.getAroUserId())) {
            jdbcTemplate.update(
                    "INSERT INTO user_aro_binding(user_id, aro_user_id) VALUES(?, ?) "
                            + "ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), aro_user_id = VALUES(aro_user_id)",
                    survivor.getStaffId(), survivor.getAroUserId());
        }

        jdbcTemplate.update(
                "INSERT INTO personnel_merge_log(survivor_id, merged_id, survivor_name, merged_name, "
                        + "survivor_staff_id, merged_staff_id, survivor_aro_user_id, merged_aro_user_id, operator_id) "
                        + "VALUES(?,?,?,?,?,?,?,?,?)",
                survivorId, mergedId, survivor.getName(), merged.getName(),
                survivor.getStaffId(), merged.getStaffId(),
                survivor.getAroUserId(), merged.getAroUserId(), operatorId);

        personnelMapper.deleteById(mergedId);
        log.info("[personnel-merge] {} 合并 {} 到 {}，操作人 {}", mergedId, merged.getName(), survivorId, operatorId);
    }
}

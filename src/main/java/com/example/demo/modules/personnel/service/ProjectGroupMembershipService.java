package com.example.demo.modules.personnel.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.entity.ProjectGroupJoinRequest;
import com.example.demo.modules.personnel.entity.ProjectGroupMemberLog;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import com.example.demo.modules.personnel.mapper.ProjectGroupJoinRequestMapper;
import com.example.demo.modules.personnel.mapper.ProjectGroupMemberLogMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 课题组归属与 PI 管理（子系统4）。
 *
 * <p>人 ↔ 课题组关系已存在（personnel.project_group_id），成员名单即
 * {@code SELECT * FROM personnel WHERE project_group_id = ?}，不新建成员表。
 *
 * <p>PI 判定不硬关联：一个账号是「某组的 PI」= ① 他属于该组（project_group_id 命中）
 * ② 他有 PI 身份标签（person_identity）。两步都由管理员手动完成，组合产生管理能力。
 */
@Service
public class ProjectGroupMembershipService {

    private static final Logger log = LoggerFactory.getLogger(ProjectGroupMembershipService.class);
    private static final String BIZ_TYPE = "PROJECT_GROUP";

    private final PersonnelMapper personnelMapper;
    private final ProjectGroupJoinRequestMapper joinRequestMapper;
    private final ProjectGroupMemberLogMapper memberLogMapper;
    private final PersonIdentityService personIdentityService;
    private final NotificationService notificationService;
    private final JdbcTemplate jdbcTemplate;

    public ProjectGroupMembershipService(PersonnelMapper personnelMapper,
                                         ProjectGroupJoinRequestMapper joinRequestMapper,
                                         ProjectGroupMemberLogMapper memberLogMapper,
                                         PersonIdentityService personIdentityService,
                                         NotificationService notificationService,
                                         JdbcTemplate jdbcTemplate) {
        this.personnelMapper = personnelMapper;
        this.joinRequestMapper = joinRequestMapper;
        this.memberLogMapper = memberLogMapper;
        this.personIdentityService = personIdentityService;
        this.notificationService = notificationService;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * 该账号是不是 targetGroupId 这个组的 PI。
     * 两个条件缺一不可：① 他属于这个组（personnel.project_group_id）② 他有 PI 身份标签。
     * 组合判定而非硬关联 —— 组的存在与谁是 PI 无关，靠管理员"分到组 + 打 PI 标签"两步产生。
     */
    public boolean isPiOfGroup(String accountId, Long targetGroupId) {
        if (accountId == null || accountId.isBlank() || targetGroupId == null) {
            return false;
        }
        Personnel p = findByAccount(accountId);
        if (p == null || !targetGroupId.equals(p.getProjectGroupId())) {
            return false;
        }
        return personIdentityService.isPi(accountId);
    }

    /** 我的课题组：组名 / 人数 / 我是不是这组的 PI / 我有没有组。 */
    public Map<String, Object> myGroup(String accountId) {
        Personnel p = requirePersonnel(accountId);
        if (p.getProjectGroupId() == null) {
            Map<String, Object> none = new LinkedHashMap<>();
            none.put("hasGroup", false);
            none.put("isPi", false);
            return none;
        }
        Long gid = p.getProjectGroupId();
        String name = groupName(gid);
        if (name == null) {
            name = p.getProjectGroupName();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("hasGroup", true);
        result.put("projectGroupId", gid);
        result.put("projectGroupName", name);
        result.put("memberCount", countMembers(gid));
        result.put("isPi", personIdentityService.isPi(accountId));
        return result;
    }

    /** 可申请的课题组（active=1），排除自己已在的组。 */
    public List<Map<String, Object>> applyOptions(String accountId) {
        Personnel p = requirePersonnel(accountId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT CAST(id AS CHAR) AS value, name AS label FROM project_group "
                        + "WHERE active = 1 ORDER BY sort_order ASC, id ASC");
        Long own = p.getProjectGroupId();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (own != null && row.get("value") != null && own.toString().equals(row.get("value").toString())) {
                continue;
            }
            result.add(row);
        }
        return result;
    }

    /** 提交申请。只有无课题组者可申请；同人同组已有 PENDING 时拒绝。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> apply(String accountId, Long groupId, String message) {
        if (groupId == null) {
            throw new TwinBusinessException(400, "请选择要加入的课题组");
        }
        Personnel p = requirePersonnel(accountId);
        if (p.getProjectGroupId() != null) {
            throw new TwinBusinessException(400, "你已在课题组中，不能重复申请");
        }
        String name = activeGroupName(groupId);
        if (name == null) {
            throw new TwinBusinessException(404, "课题组不存在或已停用");
        }
        if (joinRequestMapper.selectPendingByGroupAndPersonnel(groupId, p.getId()) != null) {
            throw new TwinBusinessException(409, "已有待处理的申请");
        }

        ProjectGroupJoinRequest r = new ProjectGroupJoinRequest();
        r.setProjectGroupId(groupId);
        r.setPersonnelId(p.getId());
        r.setStatus("PENDING");
        r.setMessage(message);
        joinRequestMapper.insert(r);

        notifyPisOfGroup(groupId, accountId, name, "「" + p.getName() + "」申请加入课题组「" + name + "」");
        return Map.of("requestId", r.getId());
    }

    /** 我的申请记录与状态。 */
    public List<Map<String, Object>> myApplications(String accountId) {
        Personnel p = requirePersonnel(accountId);
        List<ProjectGroupJoinRequest> rows = joinRequestMapper.listByPersonnel(p.getId());
        List<Map<String, Object>> result = new ArrayList<>();
        for (ProjectGroupJoinRequest r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("projectGroupId", r.getProjectGroupId());
            m.put("projectGroupName", groupName(r.getProjectGroupId()));
            m.put("status", r.getStatus());
            m.put("message", r.getMessage());
            m.put("rejectReason", r.getRejectReason());
            m.put("reviewedAt", r.getReviewedAt());
            m.put("createdAt", r.getCreatedAt());
            result.add(m);
        }
        return result;
    }

    /** 本组成员名单（仅该组 PI 可调）。 */
    public List<Map<String, Object>> listMembers(String accountId) {
        Long gid = requirePi(accountId).getProjectGroupId();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Personnel m : personnelMapper.listByProjectGroup(gid)) {
            Map<String, Object> x = new LinkedHashMap<>();
            x.put("id", m.getId());
            x.put("name", m.getName());
            x.put("jobNumber", m.getJobNumber());
            x.put("staffId", m.getStaffId());
            x.put("aroUserId", m.getAroUserId());
            result.add(x);
        }
        return result;
    }

    /** 本组待审申请（仅该组 PI）。 */
    public List<Map<String, Object>> listPendingRequests(String accountId) {
        Long gid = requirePi(accountId).getProjectGroupId();
        List<Map<String, Object>> result = new ArrayList<>();
        for (ProjectGroupJoinRequest r : joinRequestMapper.listPendingByGroup(gid)) {
            Personnel applicant = personnelMapper.findById(r.getPersonnelId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("personnelId", r.getPersonnelId());
            m.put("applicantName", applicant == null ? null : applicant.getName());
            m.put("message", r.getMessage());
            m.put("createdAt", r.getCreatedAt());
            result.add(m);
        }
        return result;
    }

    /** 批准：申请人归入该组 + 写 aro_personnel + 留痕 + 通知申请人。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approve(String accountId, Long requestId) {
        if (requestId == null) {
            throw new TwinBusinessException(400, "缺少申请 id");
        }
        Personnel pi = requirePi(accountId);
        Long gid = pi.getProjectGroupId();
        ProjectGroupJoinRequest r = joinRequestMapper.selectById(requestId);
        if (r == null || !gid.equals(r.getProjectGroupId())) {
            throw new TwinBusinessException(404, "申请不存在");
        }
        if (!"PENDING".equals(r.getStatus())) {
            throw new TwinBusinessException(400, "当前状态不可审批");
        }
        // 并发保护：带 WHERE status='PENDING' 的条件更新，影响行数为 0 即被并发处理过。
        int updated = joinRequestMapper.updateStatus(requestId, "APPROVED", pi.getId(), null);
        if (updated == 0) {
            throw new TwinBusinessException(409, "该申请已被处理");
        }
        // 该人已入组，其余待处理申请（不论哪个组）一律作废：
        // ① 他在业务上只能有一个课题组，别的申请已无意义；
        // ② 申请时的重复检查是「先查后插」，并发双击理论上能留下第二条 PENDING，这里一并关掉。
        jdbcTemplate.update(
                "UPDATE project_group_join_request SET status = 'CANCELLED', reviewer_personnel_id = ?, reviewed_at = NOW() "
                        + "WHERE personnel_id = ? AND status = 'PENDING' AND id <> ?",
                pi.getId(), r.getPersonnelId(), requestId);

        String name = groupName(gid);
        Personnel applicant = personnelMapper.findById(r.getPersonnelId());
        // ① personnel 归属 + 文本快照
        personnelMapper.updateProjectGroupRef(r.getPersonnelId(), gid, name);
        // ② 学生端个人信息页读 aro_personnel
        writeAroProjectGroupName(applicant, name);
        // ③ 留痕
        insertMemberLog(gid, r.getPersonnelId(), "JOIN", pi.getId(), null);
        // ④ 通知申请人
        publishNotify("PG_APPROVED", accountId, notifyAccountId(applicant), gid, name,
                "你申请加入课题组「" + name + "」已通过");
        return Map.of("requestId", requestId, "status", "APPROVED");
    }

    /** 拒绝：写审核人/时间/原因，通知申请人。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> reject(String accountId, Long requestId, String reason) {
        if (requestId == null) {
            throw new TwinBusinessException(400, "缺少申请 id");
        }
        Personnel pi = requirePi(accountId);
        Long gid = pi.getProjectGroupId();
        ProjectGroupJoinRequest r = joinRequestMapper.selectById(requestId);
        if (r == null || !gid.equals(r.getProjectGroupId())) {
            throw new TwinBusinessException(404, "申请不存在");
        }
        if (!"PENDING".equals(r.getStatus())) {
            throw new TwinBusinessException(400, "当前状态不可审批");
        }
        if (reason == null || reason.isBlank()) {
            throw new TwinBusinessException(400, "拒绝理由不能为空");
        }

        int updated = joinRequestMapper.updateStatus(requestId, "REJECTED", pi.getId(), reason.trim());
        if (updated == 0) {
            throw new TwinBusinessException(409, "该申请已被处理");
        }

        String name = groupName(gid);
        Personnel applicant = personnelMapper.findById(r.getPersonnelId());
        publishNotify("PG_REJECTED", accountId, notifyAccountId(applicant), gid, name,
                "你申请加入课题组「" + name + "」被拒绝：" + reason.trim());
        return Map.of("requestId", requestId, "status", "REJECTED");
    }

    /** 踢人：仅该组 PI 可移出本组成员；置空归属 + 留痕 + 通知被踢的人。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> removeMember(String accountId, Long personnelId, String reason) {
        if (personnelId == null) {
            throw new TwinBusinessException(400, "缺少成员 id");
        }
        Personnel pi = requirePi(accountId);
        Long gid = pi.getProjectGroupId();
        Personnel target = personnelMapper.findById(personnelId);
        if (target == null) {
            throw new TwinBusinessException(404, "成员不存在");
        }
        if (!gid.equals(target.getProjectGroupId())) {
            throw new TwinBusinessException(400, "该成员不在你的课题组中");
        }

        String name = groupName(gid);
        // 并发保护：带 WHERE project_group_id=? 的条件清空，影响行数为 0 即被并发移出/换组过。
        int cleared = personnelMapper.clearProjectGroupRefIfInGroup(personnelId, gid);
        if (cleared == 0) {
            throw new TwinBusinessException(409, "该成员已被移出或已换组");
        }
        clearAroProjectGroupName(target);
        insertMemberLog(gid, personnelId, "REMOVE", pi.getId(), reason);
        publishNotify("PG_REMOVED", accountId, notifyAccountId(target), gid, name,
                "你已被移出课题组「" + name + "」"
                        + (reason == null || reason.isBlank() ? "" : "：" + reason.trim()));
        return Map.of("personnelId", personnelId, "removed", true);
    }

    // ═══════════════════════════════════════════
    // 内部助手
    // ═══════════════════════════════════════════

    private Personnel findByAccount(String accountId) {
        Personnel p = personnelMapper.findByStaffId(accountId);
        if (p == null) {
            p = personnelMapper.findByAroUserId(accountId);
        }
        return p;
    }

    private Personnel requirePersonnel(String accountId) {
        if (accountId == null || accountId.isBlank()) {
            throw new TwinBusinessException(401, "未登录或登录已过期");
        }
        Personnel p = findByAccount(accountId);
        if (p == null) {
            throw new TwinBusinessException(400, "当前账号未关联人员档案");
        }
        return p;
    }

    /** 该账号须是本组 PI；返回其 Personnel（含组 id）。 */
    private Personnel requirePi(String accountId) {
        Personnel p = requirePersonnel(accountId);
        if (p.getProjectGroupId() == null) {
            throw new TwinBusinessException(403, "你还没有加入课题组");
        }
        if (!isPiOfGroup(accountId, p.getProjectGroupId())) {
            throw new TwinBusinessException(403, "无权限：你不是该课题组的 PI");
        }
        return p;
    }

    /** 只认启用的课题组：申请不能让已停用的组还能被加入。 */
    private String activeGroupName(Long groupId) {
        if (groupId == null) {
            return null;
        }
        List<String> names = jdbcTemplate.queryForList(
                "SELECT name FROM project_group WHERE id = ? AND active = 1", String.class, groupId);
        return names.isEmpty() ? null : names.get(0);
    }

    private String groupName(Long groupId) {
        if (groupId == null) {
            return null;
        }
        List<String> names = jdbcTemplate.queryForList(
                "SELECT name FROM project_group WHERE id = ?", String.class, groupId);
        return names.isEmpty() ? null : names.get(0);
    }

    private int countMembers(Long groupId) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM personnel WHERE project_group_id = ?", Integer.class, groupId);
        return n == null ? 0 : n;
    }

    /** 该人的通知账号 id：有教职工账号用 staff_id，否则用学生账号 aro_user_id（与人员授权页写入口径一致）。 */
    private String notifyAccountId(Personnel p) {
        if (p == null) {
            return null;
        }
        if (p.getStaffId() != null && !p.getStaffId().isBlank()) {
            return p.getStaffId().trim();
        }
        if (p.getAroUserId() != null && !p.getAroUserId().isBlank()) {
            return p.getAroUserId().trim();
        }
        return null;
    }

    private void writeAroProjectGroupName(Personnel p, String name) {
        if (p == null || p.getAroUserId() == null || p.getAroUserId().isBlank()) {
            return;
        }
        jdbcTemplate.update("UPDATE aro_personnel SET project_group_name = ? WHERE user_id = ?",
                name, p.getAroUserId().trim());
    }

    private void clearAroProjectGroupName(Personnel p) {
        if (p == null || p.getAroUserId() == null || p.getAroUserId().isBlank()) {
            return;
        }
        jdbcTemplate.update("UPDATE aro_personnel SET project_group_name = NULL WHERE user_id = ?",
                p.getAroUserId().trim());
    }

    private void insertMemberLog(Long groupId, Long personnelId, String action, Long actorId, String reason) {
        ProjectGroupMemberLog log = new ProjectGroupMemberLog();
        log.setProjectGroupId(groupId);
        log.setPersonnelId(personnelId);
        log.setAction(action);
        log.setActorPersonnelId(actorId);
        log.setReason(reason);
        memberLogMapper.insert(log);
    }

    private void notifyPisOfGroup(Long groupId, String senderId, String groupName, String summary) {
        for (Personnel m : personnelMapper.listByProjectGroup(groupId)) {
            String acct = notifyAccountId(m);
            if (acct != null && personIdentityService.isPi(acct)) {
                publishNotify("PG_APPLIED", senderId, acct, groupId, groupName, summary);
            }
        }
    }

    private void publishNotify(String eventType, String senderId, String recipientAccountId,
                               Long groupId, String groupName, String summary) {
        if (recipientAccountId == null || recipientAccountId.isBlank()) {
            return;
        }
        try {
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType(eventType);
            event.setBizType(BIZ_TYPE);
            event.setBizId(String.valueOf(groupId));
            event.setSenderId(senderId);
            event.setRelatedUserIds(Set.of(recipientAccountId));
            Map<String, String> vars = new HashMap<>();
            vars.put("groupName", groupName == null ? "" : groupName);
            vars.put("summary", summary);
            event.setVariables(vars);
            notificationService.publish(event);
        } catch (Exception e) {
            log.warn("[project-group] 通知发布失败: {}", e.getMessage());
        }
    }
}

package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.entity.ReportFormSubmissionLog;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionLogMapper;
import com.example.demo.modules.reportform.util.ReportFormBlocks;
import com.example.demo.modules.reportform.util.ReportFormPeriods;
import com.example.demo.modules.reportform.validator.FieldValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Service
public class ReportFillService {

    private static final Logger log = LoggerFactory.getLogger(ReportFillService.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ReportFormSubmissionLogMapper logMapper;
    private final ObjectMapper objectMapper;
    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;

    public ReportFillService(ReportFormDefinitionMapper definitionMapper,
                             ReportFormSubmissionMapper submissionMapper,
                             ReportFormSubmissionLogMapper logMapper,
                             ObjectMapper objectMapper,
                             UserMapper userMapper,
                             UserDisplayNameService userDisplayNameService) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.logMapper = logMapper;
        this.objectMapper = objectMapper;
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    /**
     * 获取当前用户可填报的已发布表单列表。
     */
    /**
     * 角色层级映射（数值越大权限越高）。
     * 发布时选择"最低可见角色"，>= 该角色的用户可编辑。
     */
    private static final Map<String, Integer> ROLE_LEVEL = Map.of(
        "MEMBER", 1,
        "STAFF", 2,
        "SENIOR", 3,
        "ADMIN", 4,
        "SUPER_ADMIN", 5,
        "PLATFORM_OWNER", 6
    );

    /** 获取当前用户可查看的已发布表单（附带填报时间摘要） */
    public List<com.example.demo.modules.reportform.dto.ReportFormAvailableVo> getAvailableEnriched(String role, Long userId, User currentUser) {
        List<ReportFormDefinition> published = getAvailable(role, userId);
        List<com.example.demo.modules.reportform.dto.ReportFormAvailableVo> out = new ArrayList<>();
        for (ReportFormDefinition form : published) {
            if (!readAllowUnboundView(form) && !isUserBound(form, role, userId)) {
                continue;
            }
            com.example.demo.modules.reportform.dto.ReportFormAvailableVo vo =
                    objectMapper.convertValue(form, com.example.demo.modules.reportform.dto.ReportFormAvailableVo.class);
            String mode = readFillMode(form);
            boolean multi = readAllowMultipleInstances(form);
            vo.setAllowMultipleInstances(multi);
            boolean publisher = isFormPublisher(form, currentUser);
            vo.setPublisher(publisher);

            if ("individual".equals(mode)) {
                int myCount = submissionMapper.countByFormAndUserId(form.getId(), userId);
                vo.setMyInstanceCount(myCount);
                List<ReportFormSubmission> mine = submissionMapper.selectByFormAndUserId(form.getId(), userId);
                if (!mine.isEmpty()) {
                    ReportFormSubmission latest = mine.get(0);
                    vo.setLastFillUpdatedAt(latest.getUpdatedAt());
                    vo.setLastSubmittedAt(latest.getSubmittedAt());
                    vo.setMyFillStatus(latest.getStatus());
                    vo.setMySubmissionId(latest.getId());
                }
                if (publisher) {
                    vo.setTotalSubmissionCount(submissionMapper.countByFormId(form.getId()));
                    vo.setTotalFillerCount(submissionMapper.countDistinctFillersByFormId(form.getId()));
                }
            } else {
                Long effectiveUserId = 0L;
                // 周期表：记录带周期键，selectDefaultByFormAndUser（过滤 instance_label=''）取不到，
                // 必须按「当前期」找。用只读版本，避免列表接口产生写副作用。
                ReportFormSubmission sub = ReportFormPeriods.isPeriodic(readPeriod(form))
                        ? findPeriodSubmission(form.getId(), effectiveUserId, LocalDate.now())
                        : submissionMapper.selectDefaultByFormAndUser(form.getId(), effectiveUserId);
                if (sub != null) {
                    vo.setLastFillUpdatedAt(sub.getUpdatedAt());
                    vo.setLastSubmittedAt(sub.getSubmittedAt());
                    vo.setMyFillStatus(sub.getStatus());
                    vo.setMySubmissionId(sub.getId());
                }
                if (publisher) {
                    vo.setTotalSubmissionCount(submissionMapper.countByFormId(form.getId()));
                    vo.setTotalFillerCount(sub != null ? 1 : 0);
                }
            }
            out.add(vo);
        }
        return out;
    }

    public boolean readAllowMultipleInstances(ReportFormDefinition form) {
        if (form == null || form.getFillPolicyJson() == null) return false;
        try {
            var node = objectMapper.readTree(form.getFillPolicyJson());
            return node.has("allowMultipleInstances") && node.get("allowMultipleInstances").asBoolean(false);
        } catch (Exception ignored) {
            return false;
        }
    }

    public boolean isFormPublisher(ReportFormDefinition form, User user) {
        if (form == null || user == null) return false;
        String uid = user.getId();
        String username = user.getUsername();
        if (StringUtils.hasText(form.getPublishedBy())) {
            if (form.getPublishedBy().equals(uid) || form.getPublishedBy().equals(username)) return true;
        }
        if (StringUtils.hasText(form.getCreatedBy())) {
            if (form.getCreatedBy().equals(uid) || form.getCreatedBy().equals(username)) return true;
        }
        return false;
    }

    /** fillPolicyJson.allowEditAfterSubmit，缺省 true（老表单零回归）。 */
    public boolean readAllowEditAfterSubmit(ReportFormDefinition form) {
        if (form == null || form.getFillPolicyJson() == null) return true;
        try {
            var node = objectMapper.readTree(form.getFillPolicyJson());
            return !node.has("allowEditAfterSubmit") || node.get("allowEditAfterSubmit").asBoolean(true);
        } catch (Exception e) {
            return true;
        }
    }

    /**
     * 用户是否"绑定"在该表单上（在名单里，或角色达标）。
     * 管理员及以上恒为 true（与 canEdit 的口径一致，避免"改得了却看不见"）。
     */
    public boolean isUserBound(ReportFormDefinition form, String role, Long userId) {
        if (form == null) return false;
        if (ROLE_LEVEL.getOrDefault(role, 0) >= 4) return true;
        if (form.getPermissionJson() == null || form.getPermissionJson().isBlank()) return true;
        try {
            var perm = objectMapper.readTree(form.getPermissionJson());
            var userIds = perm.get("visibleUserIds");
            if (userIds != null && userIds.isArray()) {
                for (var u : userIds) {
                    if (u.asLong() == userId) return true;
                }
            }
            var roles = perm.get("visibleRoles");
            if (roles == null || !roles.isArray() || roles.isEmpty()) return false;
            int userLevel = ROLE_LEVEL.getOrDefault(role, 0);
            for (var r : roles) {
                Integer lv = ROLE_LEVEL.get(r.asText());
                if (lv != null && userLevel >= lv) return true;
            }
            return false;
        } catch (Exception e) {
            return true;
        }
    }

    /** permissionJson.allowUnboundView，缺省 true（老表单零回归）。 */
    public boolean readAllowUnboundView(ReportFormDefinition form) {
        if (form == null || form.getPermissionJson() == null) return true;
        try {
            var node = objectMapper.readTree(form.getPermissionJson());
            return !node.has("allowUnboundView") || node.get("allowUnboundView").asBoolean(true);
        } catch (Exception e) {
            return true;
        }
    }

    /** 已提交且表单禁止提交后编辑时，拦下非发布者/管理员。 */
    private void guardEditAfterSubmit(ReportFormDefinition form, ReportFormSubmission sub,
                                      String role, User currentUser) {
        if (form == null || sub == null) return;
        if (!"submitted".equals(sub.getStatus())) return;
        if (readAllowEditAfterSubmit(form)) return;
        if (isFormPublisher(form, currentUser)) return;
        if (ROLE_LEVEL.getOrDefault(role, 0) >= 4) return;
        throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NO_PERMISSION,
                "该报表已提交且不允许提交后修改");
    }

    public boolean canAccessSubmission(ReportFormDefinition form, String role, Long userId, User currentUser,
                                       ReportFormSubmission sub) {
        if (form == null || sub == null || !Objects.equals(sub.getFormId(), form.getId())) return false;
        if (isFormPublisher(form, currentUser)) return true;
        Integer userLevel = ROLE_LEVEL.getOrDefault(role, 0);
        if (userLevel >= 4) return true;
        String mode = readFillMode(form);
        if ("shared".equals(mode)) {
            return sub.getUserId() == null || sub.getUserId() == 0L;
        }
        return Objects.equals(sub.getUserId(), userId);
    }

    public boolean canEditSubmission(ReportFormDefinition form, String role, Long userId, User currentUser,
                                     ReportFormSubmission sub) {
        if (!canAccessSubmission(form, role, userId, currentUser, sub)) return false;
        if (isFormPublisher(form, currentUser)) return true;
        Integer userLevel = ROLE_LEVEL.getOrDefault(role, 0);
        if (userLevel >= 4) return true;
        return canEdit(form, role, userId);
    }

    public ReportFormSubmission requireAccessibleSubmission(Long formId, Long submissionId, String role,
                                                          Long userId, User currentUser) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null || !Objects.equals(sub.getFormId(), formId)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "填报记录不存在");
        }
        if (!canAccessSubmission(form, role, userId, currentUser, sub)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NO_PERMISSION, "无权访问该填报记录");
        }
        return sub;
    }

    public List<Map<String, Object>> listMySubmissions(Long formId, Long userId) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        // 协同表（含周期表）的记录 user_id=0，按当前用户查会一条都查不到
        Long effectiveUserId = form != null && "shared".equals(readFillMode(form)) ? 0L : userId;
        List<ReportFormSubmission> subs = submissionMapper.selectByFormAndUserId(formId, effectiveUserId);
        return toSubmissionRows(subs);
    }

    public ReportFormSubmission createSubmissionInstance(Long formId, Long userId, String instanceLabel) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        if (!"published".equals(form.getStatus())) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_PUBLISHED, "报表未发布");
        }
        if (!"individual".equals(readFillMode(form))) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "仅个人表支持创建多份子文件");
        }
        if (!readAllowMultipleInstances(form)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "该报表未开启多份子文件");
        }
        String windowError = checkTimeWindow(form);
        if (windowError != null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_OUT_OF_WINDOW, windowError);
        }
        String label = normalizeInstanceLabel(instanceLabel, formId, userId);
        if (submissionMapper.selectByFormUserAndLabel(formId, userId, label) != null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "子文件名称已存在");
        }
        ReportFormSubmission sub = new ReportFormSubmission();
        sub.setFormId(formId);
        sub.setUserId(userId);
        sub.setInstanceLabel(label);
        sub.setStatus("draft");
        sub.setFieldValuesJson("{}");
        sub.setVersion(0);
        stampNewSubmission(sub);
        submissionMapper.insert(sub);
        return submissionMapper.selectById(sub.getId());
    }

    // ──────────── 周期表：每期一份 ────────────

    /** 读 scheduleJson，返回 period（缺省 manual）。 */
    public String readPeriod(ReportFormDefinition form) {
        if (form == null || form.getScheduleJson() == null || form.getScheduleJson().isBlank()) return "manual";
        try {
            return objectMapper.readTree(form.getScheduleJson()).path("period").asText("manual");
        } catch (Exception e) {
            return "manual";
        }
    }

    /** 该表单在给定日期上的周期键；非周期表返回 null。 */
    public String periodKeyOf(ReportFormDefinition form, LocalDate date) {
        if (form == null) return null;
        String period = readPeriod(form);
        if (!ReportFormPeriods.isPeriodic(period)) return null;
        Integer dow = null;
        Integer dom = null;
        try {
            var s = objectMapper.readTree(form.getScheduleJson());
            if (s.has("dayOfWeek") && !s.get("dayOfWeek").isNull()) dow = s.get("dayOfWeek").asInt();
            if (s.has("dayOfMonth") && !s.get("dayOfMonth").isNull()) dom = s.get("dayOfMonth").asInt();
        } catch (Exception ignored) {
            // 缺省即可
        }
        return ReportFormPeriods.keyFor(period, dow, dom, date);
    }

    /**
     * 周期表：解析「当前期」的记录，不存在则创建。
     * 非周期表返回 null，调用方据此走旧的 selectDefaultByFormAndUser 路径。
     *
     * @param effectiveUserId 协同表传 0L，个人表传当前用户
     */
    public ReportFormSubmission resolvePeriodSubmission(Long formId, Long effectiveUserId, LocalDate date) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        String key = periodKeyOf(form, date);
        if (key == null) return null;

        ReportFormSubmission sub = submissionMapper.selectByFormUserAndLabel(formId, effectiveUserId, key);
        if (sub != null) return sub;

        sub = new ReportFormSubmission();
        sub.setFormId(formId);
        sub.setUserId(effectiveUserId);
        sub.setInstanceLabel(key);
        sub.setStatus("draft");
        sub.setFieldValuesJson(ReportFormBlocks.toJson(ReportFormBlocks.normalize("{}")));
        sub.setVersion(0);
        stampNewSubmission(sub);
        submissionMapper.insert(sub);
        log.info("[report-form] 周期实例创建: form={} user={} period={}", formId, effectiveUserId, key);
        return sub;
    }

    /**
     * 周期表的「当前期」记录，**只读**（不存在返回 null，不创建）。
     * 列表类接口用它，避免浏览行为产生写副作用。
     */
    public ReportFormSubmission findPeriodSubmission(Long formId, Long effectiveUserId, LocalDate date) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        String key = periodKeyOf(form, date);
        if (key == null) return null;
        return submissionMapper.selectByFormUserAndLabel(formId, effectiveUserId, key);
    }

    /** 删除个人多份子文件：填报人可删自己的，发布者可删任意一份 */
    public void deleteSubmissionInstance(Long formId, Long submissionId, String role, Long userId, User currentUser) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        boolean multiInstance = "individual".equals(readFillMode(form)) && readAllowMultipleInstances(form);
        boolean periodic = ReportFormPeriods.isPeriodic(readPeriod(form));
        // 周期表也允许删单期（用户明确要求：这一期不需要时要能删掉，别留空档表）
        if (!multiInstance && !periodic) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "当前报表不支持删除单份记录");
        }
        ReportFormSubmission sub = requireAccessibleSubmission(formId, submissionId, role, userId, currentUser);
        boolean owner = Objects.equals(sub.getUserId(), userId);
        boolean publisher = isFormPublisher(form, currentUser);
        Integer userLevel = ROLE_LEVEL.getOrDefault(role, 0);
        if (!owner && !publisher && userLevel < 4) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NO_PERMISSION, "无权删除该子文件");
        }
        if (submissionMapper.deleteById(submissionId) <= 0) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "删除失败");
        }
    }

    // ──────────── 重复表格：块级操作 ────────────

    /** fillPolicyJson.repeatable，缺省 false。 */
    public boolean readRepeatable(ReportFormDefinition form) {
        if (form == null || form.getFillPolicyJson() == null) return false;
        try {
            return objectMapper.readTree(form.getFillPolicyJson()).path("repeatable").asBoolean(false);
        } catch (Exception e) {
            return false;
        }
    }

    /** 加一块：任何有编辑权的人都能加。 */
    @Transactional
    public Map<String, Object> addBlock(Long formId, Long submissionId, String role,
                                        Long userId, User currentUser) {
        ReportFormDefinition form = requireRepeatableForm(formId);
        ReportFormSubmission sub = loadLockedForEdit(formId, submissionId, form, role, userId, currentUser);
        String json = ReportFormBlocks.addBlock(sub.getFieldValuesJson());
        persistBlocks(sub, json);
        ObjectNode root = ReportFormBlocks.normalize(json);
        JsonNode last = root.path(ReportFormBlocks.BLOCKS_KEY)
                .get(ReportFormBlocks.blockCount(root) - 1);
        writeLog(sub.getId(), userId, "add-block", json);
        return blockToMap(last);
    }

    /** 按块保存：块级版本号校验，两人改不同块互不干扰。 */
    @Transactional
    public Map<String, Object> saveBlock(Long formId, Long submissionId, String blockId,
                                         JsonNode values, Integer expectedVersion, String displayNickname,
                                         String role, Long userId, User currentUser) {
        ReportFormDefinition form = requireRepeatableForm(formId);
        ReportFormSubmission sub = loadLockedForEdit(formId, submissionId, form, role, userId, currentUser);
        guardEditAfterSubmit(form, sub, role, currentUser);

        ObjectNode mutable = values != null && values.isObject()
                ? (ObjectNode) values.deepCopy()
                : objectMapper.createObjectNode();
        injectAutoUser(form, mutable, userId, displayNickname);
        validateValues(form, mutable);

        ObjectNode current = ReportFormBlocks.normalize(sub.getFieldValuesJson());
        if (ReportFormBlocks.blockValues(current, blockId) == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "表格不存在");
        }
        int expected = expectedVersion != null
                ? expectedVersion
                : ReportFormBlocks.blockVersion(current, blockId);

        ReportFormBlocks.WriteResult result =
                ReportFormBlocks.updateBlock(sub.getFieldValuesJson(), blockId, mutable, expected);
        if (result.status() == ReportFormBlocks.WriteStatus.CONFLICT) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_VERSION_CONFLICT,
                    "数据冲突：这张表格已被他人修改，请刷新后重试");
        }
        persistBlocks(sub, result.json());
        writeLog(sub.getId(), userId, "save-block", result.json());
        return blockToMap(ReportFormBlocks.normalize(result.json()), blockId);
    }

    /** 删块：空表谁都能删；非空表仅发布者/管理员。最后一块不可删。 */
    @Transactional
    public void deleteBlock(Long formId, Long submissionId, String blockId,
                            String role, Long userId, User currentUser) {
        ReportFormDefinition form = requireRepeatableForm(formId);
        ReportFormSubmission sub = loadLockedForEdit(formId, submissionId, form, role, userId, currentUser);

        JsonNode values = ReportFormBlocks.blockValues(
                ReportFormBlocks.normalize(sub.getFieldValuesJson()), blockId);
        if (values == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "表格不存在");
        }
        boolean privileged = isFormPublisher(form, currentUser)
                || ROLE_LEVEL.getOrDefault(role, 0) >= 4;
        if (!privileged && !ReportFormBlocks.isBlankValues(values)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NO_PERMISSION, "只能删除空白表格");
        }

        ReportFormBlocks.WriteResult result =
                ReportFormBlocks.deleteBlock(sub.getFieldValuesJson(), blockId);
        switch (result.status()) {
            case LAST_BLOCK -> throw TwinBusinessException.of(
                    ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "至少要保留一张表格");
            case NOT_FOUND -> throw TwinBusinessException.of(
                    ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "表格不存在");
            default -> {
                persistBlocks(sub, result.json());
                writeLog(sub.getId(), userId, "delete-block", result.json());
            }
        }
    }

    private ReportFormDefinition requireRepeatableForm(Long formId) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        if (!readRepeatable(form)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "该报表未开启重复表格");
        }
        return form;
    }

    /** 行锁读取 + 编辑权限校验。 */
    private ReportFormSubmission loadLockedForEdit(Long formId, Long submissionId, ReportFormDefinition form,
                                                   String role, Long userId, User currentUser) {
        ReportFormSubmission sub = submissionMapper.selectByIdForUpdate(submissionId);
        if (sub == null || !Objects.equals(sub.getFormId(), formId)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "填报记录不存在");
        }
        if (!canEditSubmission(form, role, userId, currentUser, sub)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NO_PERMISSION, "无权编辑该填报记录");
        }
        return sub;
    }

    private void persistBlocks(ReportFormSubmission sub, String json) {
        int rows = submissionMapper.updateFieldValues(sub.getId(), json, LocalDateTime.now());
        if (rows == 0) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_VERSION_CONFLICT, "保存失败，请重试");
        }
        sub.setFieldValuesJson(json);
    }

    private Map<String, Object> blockToMap(JsonNode block) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", block.path("id").asText());
        m.put("version", block.path("version").asInt(0));
        m.put("values", objectMapper.convertValue(block.path("values"), Map.class));
        return m;
    }

    private Map<String, Object> blockToMap(ObjectNode root, String blockId) {
        for (JsonNode b : root.path(ReportFormBlocks.BLOCKS_KEY)) {
            if (blockId.equals(b.path("id").asText())) return blockToMap(b);
        }
        throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "表格不存在");
    }

    private void stampNewSubmission(ReportFormSubmission sub) {
        LocalDateTime now = LocalDateTime.now();
        sub.setCreatedAt(now);
        sub.setUpdatedAt(now);
    }

    private String normalizeInstanceLabel(String raw, Long formId, Long userId) {
        String label = raw != null ? raw.trim() : "";
        if (!label.isBlank()) return label;
        int n = submissionMapper.countByFormAndUserId(formId, userId) + 1;
        return "子文件 " + n;
    }

    /** 发布者视角：按填报人分组 */
    public List<Map<String, Object>> listPublisherOverview(Long formId) {
        List<ReportFormSubmission> subs = submissionMapper.selectByFormId(formId);
        Map<Long, String> nickByStoredUserId = buildStoredUserIdNicknameMap();
        Map<Long, List<ReportFormSubmission>> byUser = new LinkedHashMap<>();
        for (ReportFormSubmission sub : subs) {
            if (sub.getUserId() == null || sub.getUserId() == 0L) continue;
            byUser.computeIfAbsent(sub.getUserId(), k -> new ArrayList<>()).add(sub);
        }
        List<Map<String, Object>> groups = new ArrayList<>();
        for (Map.Entry<Long, List<ReportFormSubmission>> e : byUser.entrySet()) {
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("userId", e.getKey());
            group.put("displayNickname", resolveSubmissionDisplayName(e.getKey(), nickByStoredUserId));
            group.put("instanceCount", e.getValue().size());
            group.put("instances", toSubmissionRows(e.getValue()));
            groups.add(group);
        }
        return groups;
    }

    private List<Map<String, Object>> toSubmissionRows(List<ReportFormSubmission> subs) {
        Map<Long, String> nickByStoredUserId = buildStoredUserIdNicknameMap();
        List<Map<String, Object>> out = new ArrayList<>();
        for (ReportFormSubmission sub : subs) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", sub.getId());
            row.put("formId", sub.getFormId());
            row.put("userId", sub.getUserId());
            row.put("instanceLabel", sub.getInstanceLabel());
            row.put("status", sub.getStatus());
            row.put("fieldValuesJson", sub.getFieldValuesJson());
            row.put("version", sub.getVersion());
            row.put("submittedAt", sub.getSubmittedAt());
            row.put("createdAt", sub.getCreatedAt());
            row.put("updatedAt", sub.getUpdatedAt());
            row.put("displayNickname", resolveSubmissionDisplayName(sub.getUserId(), nickByStoredUserId));
            out.add(row);
        }
        return out;
    }

    private String readFillMode(ReportFormDefinition form) {
        try {
            if (form.getFillPolicyJson() != null) {
                var node = objectMapper.readTree(form.getFillPolicyJson());
                if (node.has("mode")) return node.get("mode").asText();
            }
        } catch (Exception ignored) {}
        return "shared";
    }

    /** 获取当前用户可查看的已发布表单（所有人可见，权限仅控制编辑） */
    public List<ReportFormDefinition> getAvailable(String role, Long userId) {
        List<ReportFormDefinition> all = definitionMapper.selectPage();
        List<ReportFormDefinition> published = all.stream()
                .filter(f -> "published".equals(f.getStatus()))
                .collect(java.util.stream.Collectors.toList());
        log.info("[report-form] getAvailable: total={} published={} role={} userId={}",
                all.size(), published.size(), role, userId);
        // 所有已发布表单均可见，编辑权限由 canEdit 控制
        return published;
    }

    /** 检查用户是否有编辑权限（角色 >= 表单配置的最低角色，或在指定用户列表中） */
    public boolean canEdit(ReportFormDefinition form, String role, Long userId) {
        if (form.getPermissionJson() == null || form.getPermissionJson().isBlank()) {
            return true;
        }
        try {
            var perm = objectMapper.readTree(form.getPermissionJson());
            var roles = perm.get("visibleRoles");
            var userIds = perm.get("visibleUserIds");
            boolean rolesEmpty = roles == null || !roles.isArray() || roles.isEmpty();

            // 平台所有者/超级管理员/管理员始终可编辑
            Integer userLevel = ROLE_LEVEL.getOrDefault(role, 0);
            if (userLevel >= 4) return true; // ADMIN=4, SUPER_ADMIN=5, PLATFORM_OWNER=6

            // 指定用户列表中有该用户
            if (userIds != null && userIds.isArray()) {
                for (var u : userIds) {
                    if (u.asLong() == userId) return true;
                }
            }

            // 未设置最低角色 → 所有人可编辑。
            // 但显式关闭「未绑定可见」时，空角色列表 = 无任何角色绑定，此时未绑定的用户不该还改得动
            // （否则会出现「列表里看不见、直链进来却改得了」）。与 isUserBound 保持同一口径。
            if (rolesEmpty) return readAllowUnboundView(form);

            // 角色层级：>= 配置的最低角色即可编辑
            int minLevel = Integer.MAX_VALUE;
            for (var r : roles) {
                Integer lv = ROLE_LEVEL.get(r.asText());
                if (lv != null) minLevel = Math.min(minLevel, lv);
            }
            if (userLevel >= minLevel) return true;

            return false;
        } catch (Exception e) {
            log.warn("Failed to parse permission JSON for form id={}", form.getId(), e);
            return false;
        }
    }

    /**
     * 检查当前是否在填报时间窗口内。
     * @return null 表示 OK，否则返回错误信息字符串。
     */
    private String checkTimeWindow(ReportFormDefinition form) {
        try {
            var schedule = objectMapper.readTree(form.getScheduleJson());
            String period = schedule.has("period") ? schedule.get("period").asText() : "manual";
            if ("manual".equals(period)) return null;

            String timeStart = schedule.has("timeWindowStart") ? schedule.get("timeWindowStart").asText() : null;
            String timeEnd = schedule.has("timeWindowEnd") ? schedule.get("timeWindowEnd").asText() : null;
            if (timeStart == null || timeEnd == null || timeStart.isEmpty() || timeEnd.isEmpty()) {
                return null;
            }

            LocalTime now = LocalTime.now();
            LocalTime start = LocalTime.parse(timeStart);
            LocalTime end = LocalTime.parse(timeEnd);

            if (now.isBefore(start) || now.isAfter(end)) {
                int graceDays = schedule.has("graceDays") ? schedule.get("graceDays").asInt() : 0;
                if (graceDays > 0 && now.isAfter(end)) {
                    LocalDateTime endDateTime = LocalDateTime.of(LocalDate.now(), end);
                    LocalDateTime graceEnd = endDateTime.plusDays(graceDays);
                    if (LocalDateTime.now().isBefore(graceEnd)) {
                        return null;
                    }
                }
                return "当前不在填报时间窗口内（" + timeStart + " - " + timeEnd + "）";
            }
            return null;
        } catch (Exception e) {
            log.warn("[report-form] 解析时间窗口失败 form={}: {}", form.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * 获取或创建用户的填报记录。
     */
    public ReportFormSubmission getOrCreateSubmission(Long formId, Long userId) {
        ReportFormSubmission sub = submissionMapper.selectDefaultByFormAndUser(formId, userId);
        if (sub == null) {
            ReportFormDefinition form = definitionMapper.selectById(formId);
            if (form == null) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
            }
            if (!"published".equals(form.getStatus())) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_PUBLISHED, "报表未发布");
            }
            if ("individual".equals(readFillMode(form)) && readAllowMultipleInstances(form)) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "请先在填报中心创建子文件");
            }
            String windowError = checkTimeWindow(form);
            if (windowError != null) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_OUT_OF_WINDOW, windowError);
            }
            sub = new ReportFormSubmission();
            sub.setFormId(formId);
            sub.setUserId(userId);
            sub.setInstanceLabel("");
            sub.setStatus("draft");
            sub.setFieldValuesJson("{}");
            sub.setVersion(0);
            stampNewSubmission(sub);
            submissionMapper.insert(sub);
        }
        return sub;
    }

    /**
     * 保存草稿（含乐观锁 + 字段校验 + 日志）。
     */
    public ReportFormSubmission saveSubmission(Long formId, Long userId, String fieldValuesJson, Integer expectedVersion) {
        return saveSubmission(formId, userId, fieldValuesJson, expectedVersion, null);
    }

    public ReportFormSubmission saveSubmissionById(Long submissionId, Long actorUserId, String fieldValuesJson,
                                                 Integer expectedVersion, String displayNickname,
                                                 String role, User currentUser) {
        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "填报记录不存在");
        }
        ReportFormDefinition form = definitionMapper.selectById(sub.getFormId());
        if (!canEditSubmission(form, role, actorUserId, currentUser, sub)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NO_PERMISSION, "无权编辑该填报记录");
        }
        guardEditAfterSubmit(form, sub, role, currentUser);
        return doSaveSubmission(form, sub, actorUserId, fieldValuesJson, expectedVersion, displayNickname);
    }

    public ReportFormSubmission saveSubmission(Long formId, Long userId, String fieldValuesJson, Integer expectedVersion, String displayNickname) {
        ReportFormSubmission sub = submissionMapper.selectDefaultByFormAndUser(formId, userId);
        if (sub == null) {
            ReportFormDefinition form = definitionMapper.selectById(formId);
            if (form != null) {
                String windowError = checkTimeWindow(form);
                if (windowError != null) {
                    throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_OUT_OF_WINDOW, windowError);
                }
            }
            sub = getOrCreateSubmission(formId, userId);
        }
        ReportFormDefinition form = definitionMapper.selectById(formId);
        return doSaveSubmission(form, sub, userId, fieldValuesJson, expectedVersion, displayNickname);
    }

    private ReportFormSubmission doSaveSubmission(ReportFormDefinition form, ReportFormSubmission sub, Long userId,
                                                  String fieldValuesJson, Integer expectedVersion, String displayNickname) {
        if (expectedVersion != null && !expectedVersion.equals(sub.getVersion())) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_VERSION_CONFLICT,
                    "数据冲突：报表已被他人修改，请刷新后重试");
        }

        validateValues(form, readValuesNode(fieldValuesJson));

        ObjectNode mutableValues = (ObjectNode) readValuesNode(fieldValuesJson);
        injectAutoUser(form, mutableValues, userId, displayNickname);
        fieldValuesJson = ReportFormBlocks.toJson(mutableValues);

        sub.setFieldValuesJson(fieldValuesJson);
        sub.setUpdatedAt(LocalDateTime.now());
        int rows = submissionMapper.updateWithVersion(sub);
        if (rows == 0) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_VERSION_CONFLICT,
                    "数据冲突：保存失败，请刷新后重试");
        }

        // 写入提交日志
        writeLog(sub.getId(), userId, "save", fieldValuesJson);

        return submissionMapper.selectById(sub.getId());
    }

    /**
     * 提交（含必填校验 + 日志）。
     */
    public ReportFormSubmission submitSubmission(Long formId, Long userId) {
        ReportFormSubmission sub = submissionMapper.selectDefaultByFormAndUser(formId, userId);
        if (sub == null) {
            sub = getOrCreateSubmission(formId, userId);
        }
        return doSubmitSubmission(sub, userId);
    }

    public ReportFormSubmission submitSubmissionById(Long submissionId, Long actorUserId, String role, User currentUser) {
        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "填报记录不存在");
        }
        ReportFormDefinition form = definitionMapper.selectById(sub.getFormId());
        if (!canEditSubmission(form, role, actorUserId, currentUser, sub)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NO_PERMISSION, "无权提交该填报记录");
        }
        return doSubmitSubmission(sub, actorUserId);
    }

    private ReportFormSubmission doSubmitSubmission(ReportFormSubmission sub, Long userId) {
        Long formId = sub.getFormId();
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form != null) {
            List<String> missing = checkRequiredAllBlocks(form, sub.getFieldValuesJson());
            if (!missing.isEmpty()) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_REQUIRED,
                        "必填字段未填写: " + String.join("，", missing));
            }
        }

        LocalDateTime now = LocalDateTime.now();
        submissionMapper.submit(sub.getId(), now, now);

        // 写入提交日志（快照提交时的数据）
        writeLog(sub.getId(), userId, "submit", sub.getFieldValuesJson());

        return submissionMapper.selectById(sub.getId());
    }

    /** 提交列表附带填报人昵称（个人表展示用） */
    public List<Map<String, Object>> listSubmissionsWithUserDisplay(Long formId) {
        return toSubmissionRows(submissionMapper.selectByFormId(formId));
    }

    private Map<Long, String> buildStoredUserIdNicknameMap() {
        Map<Long, String> map = new HashMap<>();
        List<User> users = userMapper.listEnabledUsersByMinRoleLevel(0);
        if (users == null) {
            return map;
        }
        for (User user : users) {
            if (user == null || !StringUtils.hasText(user.getId())) {
                continue;
            }
            String label = userDisplayNameService.resolveDisplayName(user.getId());
            if (!StringUtils.hasText(label)) {
                label = StringUtils.hasText(user.getDisplayNickname())
                        ? user.getDisplayNickname().trim()
                        : (StringUtils.hasText(user.getUsername()) ? user.getUsername().trim() : user.getId());
            }
            map.put(parseStoredUserId(user.getId()), label);
        }
        return map;
    }

    private String resolveSubmissionDisplayName(Long storedUserId, Map<Long, String> nickByStoredUserId) {
        if (storedUserId == null || storedUserId == 0L) {
            return "协同填报";
        }
        String nick = nickByStoredUserId.get(storedUserId);
        if (StringUtils.hasText(nick)) {
            return nick;
        }
        return "用户 #" + storedUserId;
    }

    /** 与 ReportFillController.parseUserId 保持一致 */
    private static Long parseStoredUserId(String id) {
        if (id == null) {
            return 0L;
        }
        try {
            return Long.parseLong(id);
        } catch (NumberFormatException e) {
            return (long) Math.abs(id.hashCode() % 1_000_000);
        }
    }

    // ──────────── 提交日志 ────────────

    private void writeLog(Long submissionId, Long userId, String action, String fieldValuesJson) {
        try {
            ReportFormSubmissionLog logEntry = new ReportFormSubmissionLog();
            logEntry.setSubmissionId(submissionId);
            logEntry.setUserId(userId);
            logEntry.setAction(action);
            logEntry.setFieldValuesSnapshotJson(fieldValuesJson);
            logMapper.insert(logEntry);
        } catch (Exception e) {
            log.warn("[report-form] 写入提交日志失败 submission={}: {}", submissionId, e.getMessage());
        }
    }

    /** 解析字段值 JSON；非法或空返回空对象。 */
    private JsonNode readValuesNode(String json) {
        if (json == null || json.isBlank()) return objectMapper.createObjectNode();
        try {
            JsonNode node = objectMapper.readTree(json);
            return node != null && node.isObject() ? node : objectMapper.createObjectNode();
        } catch (Exception e) {
            return objectMapper.createObjectNode();
        }
    }

    /** 逐字段规则校验（按字段 type），不校验必填。 */
    private void validateValues(ReportFormDefinition form, JsonNode valuesNode) {
        if (form == null || form.getLayoutJson() == null || valuesNode == null) return;
        try {
            JsonNode fields = objectMapper.readTree(form.getLayoutJson()).path("fields");
            if (!fields.isObject()) return;
            var iter = fields.fields();
            while (iter.hasNext()) {
                var entry = iter.next();
                String fk = entry.getKey();
                if (!valuesNode.has(fk) || valuesNode.get(fk).isNull()) continue;
                JsonNode v = valuesNode.get(fk);
                Object value;
                if (v.isBoolean()) value = v.asBoolean();
                else if (v.isNumber()) value = v.asDouble();
                else if (v.isArray()) value = v.toString();
                else value = v.asText();
                FieldValidator.validate(fk, entry.getValue(), value);
            }
        } catch (TwinBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[report-form] 保存时字段校验异常 form={}: {}", form.getId(), e.getMessage());
        }
    }

    /** AUTO_USER 字段自动注入：写入「昵称 · 时间」。对每张表各盖一次。 */
    private void injectAutoUser(ReportFormDefinition form, ObjectNode values, Long userId, String displayNickname) {
        if (form == null || values == null || form.getLayoutJson() == null) return;
        try {
            JsonNode fields = objectMapper.readTree(form.getLayoutJson()).path("fields");
            if (!fields.isObject()) return;
            var iter = fields.fields();
            while (iter.hasNext()) {
                var entry = iter.next();
                if (!"AUTO_USER".equals(entry.getValue().path("type").asText())) continue;
                String name = displayNickname != null && !displayNickname.isBlank()
                        ? displayNickname
                        : ("用户#" + userId);
                values.put(entry.getKey(), name + " · " + LocalDateTime.now()
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")));
            }
        } catch (Exception e) {
            log.warn("[report-form] AUTO_USER 自动注入异常: {}", e.getMessage());
        }
    }

    /**
     * 逐块必填校验。多张表时错误信息带序号，便于定位是第几张。
     *
     * @return 缺失项描述列表；空列表表示全部通过
     */
    private List<String> checkRequiredAllBlocks(ReportFormDefinition form, String fieldValuesJson) {
        List<String> missing = new ArrayList<>();
        if (form == null || form.getLayoutJson() == null) return missing;
        try {
            JsonNode fields = objectMapper.readTree(form.getLayoutJson()).path("fields");
            if (!fields.isObject()) return missing;
            List<JsonNode> blocks = ReportFormBlocks.blockValues(
                    ReportFormBlocks.normalize(fieldValuesJson));
            boolean multi = blocks.size() > 1;
            for (int i = 0; i < blocks.size(); i++) {
                @SuppressWarnings("unchecked")
                Map<String, Object> values = objectMapper.convertValue(blocks.get(i), Map.class);
                List<String> blockMissing = FieldValidator.checkRequired(fields, values);
                if (multi) {
                    int no = i + 1;
                    blockMissing.replaceAll(label -> "第 " + no + " 张表：" + label);
                }
                missing.addAll(blockMissing);
            }
        } catch (Exception e) {
            log.warn("[report-form] 提交时必填校验异常 form={}: {}", form.getId(), e.getMessage());
        }
        return missing;
    }
}

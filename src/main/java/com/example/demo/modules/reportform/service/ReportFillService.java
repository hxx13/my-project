package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.entity.ReportFormSubmissionLog;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionLogMapper;
import com.example.demo.modules.reportform.validator.FieldValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
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

    public ReportFillService(ReportFormDefinitionMapper definitionMapper,
                             ReportFormSubmissionMapper submissionMapper,
                             ReportFormSubmissionLogMapper logMapper,
                             ObjectMapper objectMapper,
                             UserMapper userMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.logMapper = logMapper;
        this.objectMapper = objectMapper;
        this.userMapper = userMapper;
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
                ReportFormSubmission sub = submissionMapper.selectDefaultByFormAndUser(form.getId(), effectiveUserId);
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
        List<ReportFormSubmission> subs = submissionMapper.selectByFormAndUserId(formId, userId);
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

    /** 删除个人多份子文件：填报人可删自己的，发布者可删任意一份 */
    public void deleteSubmissionInstance(Long formId, Long submissionId, String role, Long userId, User currentUser) {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        if (!"individual".equals(readFillMode(form)) || !readAllowMultipleInstances(form)) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_INVALID, "当前报表未开启多份子文件，无法删除");
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

            // 未设置最低角色 → 所有人可编辑
            if (rolesEmpty) return true;

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
        Long formId = sub.getFormId();
        if (expectedVersion != null && !expectedVersion.equals(sub.getVersion())) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_VERSION_CONFLICT,
                    "数据冲突：报表已被他人修改，请刷新后重试");
        }

        // 乐观锁检查
        if (form != null && form.getLayoutJson() != null) {
            try {
                var layout = objectMapper.readTree(form.getLayoutJson());
                var fields = layout.get("fields");
                if (fields != null) {
                    var valuesNode = objectMapper.readTree(fieldValuesJson);
                    var iter = fields.fields();
                    while (iter.hasNext()) {
                        var entry = iter.next();
                        String fk = entry.getKey();
                        if (valuesNode.has(fk) && !valuesNode.get(fk).isNull()) {
                            JsonNode valueNode = valuesNode.get(fk);
                            Object value;
                            if (valueNode.isBoolean()) value = valueNode.asBoolean();
                            else if (valueNode.isNumber()) value = valueNode.asDouble();
                            else if (valueNode.isArray()) value = valueNode.toString();
                            else value = valueNode.asText();
                            FieldValidator.validate(fk, entry.getValue(), value);
                        }
                    }
                }
            } catch (TwinBusinessException e) {
                throw e;
            } catch (Exception e) {
                log.warn("[report-form] 保存时字段校验异常 form={}: {}", formId, e.getMessage());
            }
        }

        // AUTO_USER 字段自动注入：编辑人ID + 时间戳
        if (form != null && form.getLayoutJson() != null) {
            try {
                var layout = objectMapper.readTree(form.getLayoutJson());
                var fields = layout.get("fields");
                if (fields != null) {
                    var valuesNode = objectMapper.readTree(fieldValuesJson);
                    com.fasterxml.jackson.databind.node.ObjectNode mutableValues =
                        (com.fasterxml.jackson.databind.node.ObjectNode) valuesNode;
                    boolean modified = false;
                    var iter = fields.fields();
                    while (iter.hasNext()) {
                        var entry = iter.next();
                        String fk = entry.getKey();
                        JsonNode fieldDef = entry.getValue();
                        if (fieldDef.has("type") && "AUTO_USER".equals(fieldDef.get("type").asText())) {
                            String name = displayNickname != null && !displayNickname.isBlank()
                                ? displayNickname
                                : ("用户#" + userId);
                            String autoValue = name + " · " + LocalDateTime.now()
                                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
                            mutableValues.put(fk, autoValue);
                            modified = true;
                        }
                    }
                    if (modified) {
                        fieldValuesJson = objectMapper.writeValueAsString(mutableValues);
                    }
                }
            } catch (Exception e) {
                log.warn("[report-form] AUTO_USER 自动注入异常: {}", e.getMessage());
            }
        }

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
        if (form != null && form.getLayoutJson() != null) {
            try {
                var layout = objectMapper.readTree(form.getLayoutJson());
                var fields = layout.get("fields");
                if (fields != null) {
                    var valuesMap = objectMapper.readValue(
                        sub.getFieldValuesJson(),
                        new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}
                    );
                    List<String> missing = FieldValidator.checkRequired(fields, valuesMap);
                    if (!missing.isEmpty()) {
                        throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_FIELD_REQUIRED,
                                "必填字段未填写: " + String.join(", ", missing));
                    }
                }
            } catch (TwinBusinessException e) {
                throw e;
            } catch (Exception e) {
                log.warn("[report-form] 提交时必填校验异常 form={}: {}", formId, e.getMessage());
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
            String label = StringUtils.hasText(user.getDisplayNickname())
                    ? user.getDisplayNickname().trim()
                    : (StringUtils.hasText(user.getUsername()) ? user.getUsername().trim() : user.getId());
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
}

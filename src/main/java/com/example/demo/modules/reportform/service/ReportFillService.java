package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
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

    public ReportFillService(ReportFormDefinitionMapper definitionMapper,
                             ReportFormSubmissionMapper submissionMapper,
                             ReportFormSubmissionLogMapper logMapper,
                             ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.logMapper = logMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 获取当前用户可填报的已发布表单列表。
     */
    /**
     * 角色层级映射（数值越大权限越高）。
     * 发布时选择"最低可见角色"，>= 该角色的用户可编辑。
     */
    private static final Map<String, Integer> ROLE_LEVEL = Map.of(
        "STUDENT", 1,
        "STAFF", 2,
        "SENIOR", 3,
        "ADMIN", 4,
        "SUPER_ADMIN", 5,
        "PLATFORM_OWNER", 6
    );

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
        ReportFormSubmission sub = submissionMapper.selectByFormAndUser(formId, userId);
        if (sub == null) {
            ReportFormDefinition form = definitionMapper.selectById(formId);
            if (form == null) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
            }
            if (!"published".equals(form.getStatus())) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_PUBLISHED, "报表未发布");
            }
            String windowError = checkTimeWindow(form);
            if (windowError != null) {
                throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_OUT_OF_WINDOW, windowError);
            }
            sub = new ReportFormSubmission();
            sub.setFormId(formId);
            sub.setUserId(userId);
            sub.setStatus("draft");
            sub.setFieldValuesJson("{}");
            sub.setVersion(0);
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

    public ReportFormSubmission saveSubmission(Long formId, Long userId, String fieldValuesJson, Integer expectedVersion, String displayNickname) {
        ReportFormSubmission sub = submissionMapper.selectByFormAndUser(formId, userId);
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

        // 乐观锁检查
        if (expectedVersion != null && !expectedVersion.equals(sub.getVersion())) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_VERSION_CONFLICT,
                    "数据冲突：报表已被他人修改，请刷新后重试");
        }

        // 获取表单定义（校验 + AUTO_USER 注入共用）
        ReportFormDefinition form = definitionMapper.selectById(formId);

        // 字段校验
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
        // 自动创建提交记录（首次提交无需先保存）
        ReportFormSubmission sub = submissionMapper.selectByFormAndUser(formId, userId);
        if (sub == null) {
            sub = getOrCreateSubmission(formId, userId);
        }

        // 校验必填字段
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

        submissionMapper.submit(sub.getId());

        // 写入提交日志（快照提交时的数据）
        writeLog(sub.getId(), userId, "submit", sub.getFieldValuesJson());

        return submissionMapper.selectById(sub.getId());
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

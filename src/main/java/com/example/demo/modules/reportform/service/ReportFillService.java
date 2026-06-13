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
    public List<ReportFormDefinition> getAvailable(String role, Long userId) {
        return definitionMapper.selectPage().stream()
                .filter(f -> "published".equals(f.getStatus()))
                .filter(f -> userHasAccess(f, role, userId))
                .collect(java.util.stream.Collectors.toList());
    }

    private boolean userHasAccess(ReportFormDefinition form, String role, Long userId) {
        if (form.getPermissionJson() == null || form.getPermissionJson().isBlank()) {
            return true;
        }
        try {
            var perm = objectMapper.readTree(form.getPermissionJson());
            var roles = perm.get("visibleRoles");
            if (roles != null) {
                for (var r : roles) {
                    if (r.asText().equals(role)) return true;
                }
            }
            var userIds = perm.get("visibleUserIds");
            if (userIds != null) {
                for (var u : userIds) {
                    if (u.asLong() == userId) return true;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to parse permission JSON for form id={}", form.getId(), e);
            return false;
        }
        return false;
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

        // 字段校验
        ReportFormDefinition form = definitionMapper.selectById(formId);
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
                            // Pass appropriate Java type based on JSON node type
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
        ReportFormSubmission sub = submissionMapper.selectByFormAndUser(formId, userId);
        if (sub == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "请先保存再提交");
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

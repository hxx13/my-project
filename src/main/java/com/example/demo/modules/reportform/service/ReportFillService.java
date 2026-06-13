package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ReportFillService {

    private static final Logger log = LoggerFactory.getLogger(ReportFillService.class);

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper;

    public ReportFillService(ReportFormDefinitionMapper definitionMapper,
                             ReportFormSubmissionMapper submissionMapper,
                             ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * Get available (published) forms for the current user's role and userId.
     * Role and userId are resolved in the controller from the request context
     * and passed in, avoiding direct coupling to AuthContextService internals.
     */
    public List<ReportFormDefinition> getAvailable(String role, Long userId) {
        return definitionMapper.selectPage().stream()
                .filter(f -> "published".equals(f.getStatus()))
                .filter(f -> userHasAccess(f, role, userId))
                .collect(Collectors.toList());
    }

    private boolean userHasAccess(ReportFormDefinition form, String role, Long userId) {
        if (form.getPermissionJson() == null || form.getPermissionJson().isBlank()) {
            return true; // no permission config = visible to all
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
     * Check if the form is currently within its fill time window.
     * Returns null if OK, or an error message string if outside the window.
     */
    private String checkTimeWindow(ReportFormDefinition form) {
        try {
            var schedule = objectMapper.readTree(form.getScheduleJson());
            String period = schedule.has("period") ? schedule.get("period").asText() : "manual";

            // Manual period always allows fill
            if ("manual".equals(period)) return null;

            String timeStart = schedule.has("timeWindowStart") ? schedule.get("timeWindowStart").asText() : null;
            String timeEnd = schedule.has("timeWindowEnd") ? schedule.get("timeWindowEnd").asText() : null;

            // No time window configured = always open
            if (timeStart == null || timeEnd == null || timeStart.isEmpty() || timeEnd.isEmpty()) {
                return null;
            }

            LocalTime now = LocalTime.now();
            LocalTime start = LocalTime.parse(timeStart);
            LocalTime end = LocalTime.parse(timeEnd);

            if (now.isBefore(start) || now.isAfter(end)) {
                // Check grace period
                int graceDays = schedule.has("graceDays") ? schedule.get("graceDays").asInt() : 0;
                if (graceDays > 0 && now.isAfter(end)) {
                    // Allow fill within grace period after the window closes
                    LocalDateTime endDateTime = LocalDateTime.of(LocalDate.now(), end);
                    LocalDateTime graceEnd = endDateTime.plusDays(graceDays);
                    if (LocalDateTime.now().isBefore(graceEnd)) {
                        return null; // Within grace period
                    }
                }
                return "当前不在填报时间窗口内（" + timeStart + " - " + timeEnd + "）";
            }
            return null;
        } catch (Exception e) {
            // If schedule JSON is malformed, allow fill (fail-open for safety)
            log.warn("[report-form] 解析时间窗口失败 form={}: {}", form.getId(), e.getMessage());
            return null;
        }
    }

    public ReportFormSubmission getOrCreateSubmission(Long formId, Long userId) {
        ReportFormSubmission sub = submissionMapper.selectByFormAndUser(formId, userId);
        if (sub == null) {
            // Check form exists and is published
            ReportFormDefinition form = definitionMapper.selectById(formId);
            if (form == null || !"published".equals(form.getStatus())) {
                throw new RuntimeException("报表不存在或未发布");
            }
            // Check time window before creating new submission
            String windowError = checkTimeWindow(form);
            if (windowError != null) {
                throw new RuntimeException(windowError);
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

    public ReportFormSubmission saveSubmission(Long formId, Long userId, String fieldValuesJson, Integer expectedVersion) {
        ReportFormSubmission sub = submissionMapper.selectByFormAndUser(formId, userId);
        if (sub == null) {
            // Check time window before auto-creating
            ReportFormDefinition form = definitionMapper.selectById(formId);
            if (form != null) {
                String windowError = checkTimeWindow(form);
                if (windowError != null) {
                    throw new RuntimeException(windowError);
                }
            }
            // Auto-create on first save
            sub = getOrCreateSubmission(formId, userId);
        }
        // Optimistic lock check
        if (expectedVersion != null && !expectedVersion.equals(sub.getVersion())) {
            throw new RuntimeException("数据冲突：报表已被他人修改，请刷新后重试");
        }
        sub.setFieldValuesJson(fieldValuesJson);
        int rows = submissionMapper.updateWithVersion(sub);
        if (rows == 0) {
            throw new RuntimeException("数据冲突：保存失败，请刷新后重试");
        }
        // Reload to get updated version
        return submissionMapper.selectById(sub.getId());
    }

    public ReportFormSubmission submitSubmission(Long formId, Long userId) {
        ReportFormSubmission sub = submissionMapper.selectByFormAndUser(formId, userId);
        if (sub == null) {
            throw new RuntimeException("请先保存再提交");
        }
        // Validate required fields
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form != null) {
            try {
                var layout = objectMapper.readTree(form.getLayoutJson());
                var fields = layout.get("fields");
                var values = objectMapper.readTree(sub.getFieldValuesJson());
                if (fields != null) {
                    var missing = new ArrayList<String>();
                    var iter = fields.fields();
                    while (iter.hasNext()) {
                        var entry = iter.next();
                        var fieldDef = entry.getValue();
                        if (fieldDef.has("required") && fieldDef.get("required").asBoolean()) {
                            String fieldKey = entry.getKey();
                            if (!values.has(fieldKey) || values.get(fieldKey).isNull()
                                    || values.get(fieldKey).asText().isEmpty()) {
                                String label = fieldDef.has("label") ? fieldDef.get("label").asText() : fieldKey;
                                missing.add(label);
                            }
                        }
                    }
                    if (!missing.isEmpty()) {
                        throw new RuntimeException("必填字段未填写: " + String.join(", ", missing));
                    }
                }
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                // validation parse error, allow submit
            }
        }
        submissionMapper.submit(sub.getId());
        return submissionMapper.selectById(sub.getId());
    }
}

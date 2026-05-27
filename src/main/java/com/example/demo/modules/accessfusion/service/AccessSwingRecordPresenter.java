package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.twin.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.support.DahuaSwingDepartmentSupport;
import com.example.demo.modules.twin.support.DahuaSwingEnterExitSupport;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 门禁记录库列表展示：标签、进出文案、受众（与清洗表对齐） */
public final class AccessSwingRecordPresenter {

    public static final String TAG_MISSING_ENTER_EXIT = "MISSING_ENTER_EXIT";
    public static final String TAG_NO_MAPPING = "NO_MAPPING";
    public static final String TAG_STUDENT = "STUDENT";
    public static final String TAG_STAFF = "STAFF";
    public static final String TAG_OPEN_FAILED = "OPEN_FAILED";

    private AccessSwingRecordPresenter() {}

    public static Map<String, Object> toViewRow(DahuaSwingRecord r, DahuaSwingDepartmentSupport departmentSupport) {
        if (r == null) {
            return Map.of();
        }
        DahuaSwingRecord row = r;
        var dept =
                departmentSupport != null
                        ? departmentSupport.resolveForClassification(row)
                        : DahuaSwingDepartmentSupport.resolveForDisplay(row);
        if (StringUtils.hasText(dept.id())) {
            row.setDepartmentId(dept.id());
        }
        if (StringUtils.hasText(dept.name())) {
            row.setDepartmentName(dept.name());
        }
        DahuaSwingEnterExitSupport.applyResolved(row);
        String audience =
                departmentSupport != null
                        ? departmentSupport.classifyAudienceForRecord(row)
                        : AccessAudienceConstants.audienceFromDepartment(row.getDepartmentId(), row.getDepartmentName());

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", row.getId());
        m.put("taskId", row.getTaskId());
        m.put("pullTaskType", row.getPullTaskType());
        m.put("recordId", row.getRecordId());
        m.put("cardNumber", row.getCardNumber());
        m.put("channelCode", row.getChannelCode());
        m.put("channelName", row.getChannelName());
        m.put("personCode", row.getPersonCode());
        m.put("personName", row.getPersonName());
        m.put("departmentId", row.getDepartmentId());
        m.put("departmentName", row.getDepartmentName());
        m.put("openType", row.getOpenType());
        m.put("openTypeLabel", openTypeLabel(row.getOpenType()));
        m.put("openResult", row.getOpenResult());
        m.put("openResultLabel", openResultLabel(row.getOpenResult()));
        m.put("mappingHitLabel", mappingHitLabel(row.getMappingHit()));
        m.put("enterOrExit", row.getEnterOrExit());
        m.put("enterOrExitLabel", enterOrExitLabel(row.getEnterOrExit()));
        m.put("audienceType", audience);
        m.put("audienceLabel", audienceLabel(audience));
        m.put("swingTime", row.getSwingTime());
        m.put("mappingUserId", row.getMappingUserId());
        m.put("mappingHit", row.getMappingHit());
        m.put("tags", buildTags(row, audience));
        return m;
    }

    public static List<Map<String, Object>> toViewRows(
            List<DahuaSwingRecord> rows, DahuaSwingDepartmentSupport departmentSupport) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (DahuaSwingRecord r : rows) {
            out.add(toViewRow(r, departmentSupport));
        }
        return out;
    }

    public static List<String> buildTags(DahuaSwingRecord r, String audience) {
        List<String> tags = new ArrayList<>();
        if (r.getEnterOrExit() == null || r.getEnterOrExit() == 0) {
            tags.add(TAG_MISSING_ENTER_EXIT);
        }
        if (r.getMappingHit() == null || r.getMappingHit() != 1) {
            tags.add(TAG_NO_MAPPING);
        }
        if (AccessAudienceConstants.AUDIENCE_STUDENT.equals(audience)) {
            tags.add(TAG_STUDENT);
        } else {
            tags.add(TAG_STAFF);
        }
        if (r.getOpenResult() != null && r.getOpenResult() != 1) {
            tags.add(TAG_OPEN_FAILED);
        }
        return tags;
    }

    public static String enterOrExitLabel(Integer enterOrExit) {
        if (enterOrExit == null) {
            return "-";
        }
        return switch (enterOrExit) {
            case 1 -> "进入";
            case 2 -> "离开";
            default -> String.valueOf(enterOrExit);
        };
    }

    public static String audienceLabel(String audience) {
        if (AccessAudienceConstants.AUDIENCE_STUDENT.equals(audience)) {
            return "学生";
        }
        if (AccessAudienceConstants.AUDIENCE_STAFF.equals(audience)) {
            return "工作人员";
        }
        return "-";
    }

    /** 大华 openResult：1=刷卡开门成功，0=失败 */
    public static String openResultLabel(Integer openResult) {
        if (openResult == null) {
            return "-";
        }
        return openResult == 1 ? "成功" : openResult == 0 ? "失败" : String.valueOf(openResult);
    }

    public static String openTypeLabel(Integer openType) {
        if (openType == null) {
            return "-";
        }
        return switch (openType) {
            case 51 -> "合法刷卡开门";
            case 52 -> "非法刷卡开门";
            case 48 -> "远程开门";
            case 49 -> "按钮开门";
            default -> String.valueOf(openType);
        };
    }

    public static String mappingHitLabel(Integer mappingHit) {
        if (mappingHit == null) {
            return "-";
        }
        return mappingHit == 1 ? "已映射" : "未映射";
    }
}

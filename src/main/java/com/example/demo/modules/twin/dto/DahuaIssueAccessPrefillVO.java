package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class DahuaIssueAccessPrefillVO {
    private String aroUserId;
    /** ARO 官方「可进房间」接口原始列表（含未命中规则的房间） */
    private List<Map<String, Object>> officialRooms = new ArrayList<>();
    /** 在可进房间上命中门禁子项的匹配结果，供勾选 */
    private List<RuleMatchRow> ruleMatches = new ArrayList<>();
    /** 默认勾选的全部通道编码并集 */
    private List<String> defaultChannelResourceCodes = new ArrayList<>();
    /** 默认勾选的全部门组 id 并集 */
    private List<Long> defaultDoorGroupIds = new ArrayList<>();

    @Data
    public static class RuleMatchRow {
        private String matchKey;
        private long itemId;
        private long ruleId;
        private String ruleName;
        private String roomId;
        private String roomName;
        private List<String> channelResourceCodes = new ArrayList<>();
        private List<Long> doorGroupIds = new ArrayList<>();
        private boolean hasPrivilege;
        private boolean defaultSelected;
    }

    /**
     * 便于 JSON 序列化：将官方房间规范为 id/name 字段。
     */
    public List<Map<String, String>> getOfficialRoomsNormalized() {
        List<Map<String, String>> out = new ArrayList<>();
        for (Map<String, Object> r : officialRooms) {
            if (r == null) {
                continue;
            }
            Map<String, String> one = new LinkedHashMap<>();
            Object id = r.get("id") != null ? r.get("id") : r.get("roomId");
            one.put("roomId", id != null ? String.valueOf(id).trim() : "");
            Object nm = r.get("name");
            if (nm == null) {
                nm = r.get("roomName");
            }
            if (nm == null) {
                nm = r.get("title");
            }
            one.put("roomName", nm != null ? String.valueOf(nm).trim() : "");
            out.add(one);
        }
        return out;
    }
}

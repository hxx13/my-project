package com.example.demo.modules.twin.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.accessrule.entity.AccessRule;
import com.example.demo.modules.accessrule.entity.AccessRuleItem;
import com.example.demo.modules.accessrule.mapper.AccessRuleMapper;
import com.example.demo.modules.accessrule.service.AccessRuleService;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.twin.dto.DahuaIssueAccessPrefillVO;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 大华发卡前：按 ARO 官方可进房间拉取列表，并匹配门禁规则子项，生成通道/门组预填数据。
 */
@Service
public class DahuaIssueAccessRulePrefillService {

    private final AroService aroService;
    private final AccessRuleService accessRuleService;
    private final AccessRuleMapper accessRuleMapper;

    public DahuaIssueAccessRulePrefillService(
            AroService aroService,
            AccessRuleService accessRuleService,
            AccessRuleMapper accessRuleMapper) {
        this.aroService = aroService;
        this.accessRuleService = accessRuleService;
        this.accessRuleMapper = accessRuleMapper;
    }

    public DahuaIssueAccessPrefillVO build(String aroUserId) {
        DahuaIssueAccessPrefillVO vo = new DahuaIssueAccessPrefillVO();
        if (!StringUtils.hasText(aroUserId)) {
            vo.setAroUserId("");
            return vo;
        }
        String uid = aroUserId.trim();
        vo.setAroUserId(uid);
        List<Map<String, Object>> rooms = aroService.getExamOfflineRoom(uid);
        if (rooms == null) {
            rooms = new ArrayList<>();
        }
        vo.setOfficialRooms(rooms);

        Set<String> seenMatchKeys = new LinkedHashSet<>();
        LinkedHashSet<String> unionChannels = new LinkedHashSet<>();
        LinkedHashSet<Long> unionDoorGroups = new LinkedHashSet<>();

        for (Map<String, Object> room : rooms) {
            if (room == null) {
                continue;
            }
            String roomId = firstNonBlank(room, "id", "roomId");
            if (!StringUtils.hasText(roomId)) {
                continue;
            }
            String roomName = firstNonBlank(room, "name", "roomName", "title");
            AccessRuleItem item = accessRuleService.findMatchingItem(roomId, uid);
            if (item == null || item.getId() == null) {
                continue;
            }
            String matchKey = item.getId() + "_" + roomId;
            if (!seenMatchKeys.add(matchKey)) {
                continue;
            }
            List<String> ch = parseChannelCodes(item.getChannelCodesJson());
            List<Long> dg = parseDoorGroupIds(item.getDoorGroupIdsJson());
            boolean hasPriv = !ch.isEmpty() || !dg.isEmpty();

            DahuaIssueAccessPrefillVO.RuleMatchRow row = new DahuaIssueAccessPrefillVO.RuleMatchRow();
            row.setMatchKey(matchKey);
            row.setItemId(item.getId());
            row.setRuleId(item.getRuleId() != null ? item.getRuleId() : 0L);
            row.setRuleName(resolveRuleName(item.getRuleId()));
            row.setRoomId(roomId);
            row.setRoomName(roomName);
            row.setChannelResourceCodes(ch);
            row.setDoorGroupIds(dg);
            row.setHasPrivilege(hasPriv);
            row.setDefaultSelected(hasPriv);
            vo.getRuleMatches().add(row);

            if (hasPriv) {
                unionChannels.addAll(ch);
                unionDoorGroups.addAll(dg);
            }
        }

        vo.setDefaultChannelResourceCodes(new ArrayList<>(unionChannels));
        vo.setDefaultDoorGroupIds(new ArrayList<>(unionDoorGroups));
        return vo;
    }

    private String resolveRuleName(Long ruleId) {
        if (ruleId == null || ruleId <= 0) {
            return "";
        }
        AccessRule r = accessRuleMapper.selectById(ruleId);
        return r != null && StringUtils.hasText(r.getName()) ? r.getName().trim() : ("规则#" + ruleId);
    }

    private static String firstNonBlank(Map<String, Object> map, String... keys) {
        for (String k : keys) {
            Object v = map.get(k);
            if (v == null) {
                continue;
            }
            String s = String.valueOf(v).trim();
            if (StringUtils.hasText(s)) {
                return s;
            }
        }
        return "";
    }

    private static List<String> parseChannelCodes(String json) {
        List<String> out = new ArrayList<>();
        if (!StringUtils.hasText(json)) {
            return out;
        }
        try {
            List<String> arr = JSON.parseArray(json, String.class);
            if (arr != null) {
                for (String c : arr) {
                    if (StringUtils.hasText(c)) {
                        out.add(c.trim());
                    }
                }
            }
        } catch (Exception ignored) {
            // ignore
        }
        return out;
    }

    private static List<Long> parseDoorGroupIds(String json) {
        List<Long> out = new ArrayList<>();
        if (!StringUtils.hasText(json)) {
            return out;
        }
        try {
            List<Long> arr = JSON.parseArray(json, Long.class);
            if (arr != null) {
                for (Long id : arr) {
                    if (id != null) {
                        out.add(id);
                    }
                }
            }
        } catch (Exception ignored) {
            // ignore
        }
        return out;
    }
}

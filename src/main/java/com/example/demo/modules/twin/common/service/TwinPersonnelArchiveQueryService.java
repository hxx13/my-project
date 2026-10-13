package com.example.demo.modules.twin.common.service;

import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class TwinPersonnelArchiveQueryService {

    private final TwinDashboardMapper dashboardMapper;

    public TwinPersonnelArchiveQueryService(TwinDashboardMapper dashboardMapper) {
        this.dashboardMapper = dashboardMapper;
    }

    public List<String> searchProjectGroupNames(String keyword, int limit) {
        String kw = keyword == null ? "" : keyword.trim();
        if (!StringUtils.hasText(kw)) {
            return List.of();
        }
        int lim = Math.min(Math.max(limit, 1), 80);
        List<String> fields = dashboardMapper.searchPersonnelProjectGroupFields(kw, lim * 4);
        List<String> exact = PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(fields, kw, lim);
        if (!exact.isEmpty()) {
            return exact;
        }
        // 一个字都没命中 → 多半是打错了字（「郑均克」vs「郑俊克」）。**别退回按姓氏搜** ——
        // 那样回来的全是只共一个姓、跟要找的人无关的组（2026-10-13 真机：三字名收到两个两字名的组）。
        // 按姓名相似度捞：先宽口径取候选（首字 + 尾字各捞一批），再按「同字优先、同音次之」排。
        List<String> wide = new ArrayList<>();
        for (String key : fuzzyKeys(kw)) {
            List<String> part = dashboardMapper.searchPersonnelProjectGroupFields(key, lim * 20);
            if (part != null) {
                wide.addAll(part);
            }
        }
        return PersonnelProjectGroupUtil.rankGroupsBySimilarity(wide, kw, lim);
    }

    /**
     * 模糊兜底时用来捞候选的两个字。
     *
     * <p>取**首字和尾字**而不是整个关键词：打错的那个字可能在中间（「郑均克」→「郑俊克」），
     * 而首尾两个字一般是对的 —— 只要有一个还在，候选就进得来，后面靠相似度筛。
     */
    private static List<String> fuzzyKeys(String kw) {
        List<String> keys = new ArrayList<>();
        keys.add(String.valueOf(kw.charAt(0)));
        String last = String.valueOf(kw.charAt(kw.length() - 1));
        if (!keys.contains(last)) {
            keys.add(last);
        }
        return keys;
    }

    public List<Map<String, Object>> listMembersByProjectGroup(String projectGroupName, int limit) {
        if (!StringUtils.hasText(projectGroupName)) {
            return List.of();
        }
        String group = projectGroupName.trim();
        int lim = Math.min(Math.max(limit, 1), 500);
        List<Map<String, Object>> loose = dashboardMapper.listPersonnelLooseByProjectGroup(group, lim * 2);
        if (loose == null || loose.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : loose) {
            if (row == null) {
                continue;
            }
            String pg = stringVal(row.get("project_group_name"));
            if (!PersonnelProjectGroupUtil.belongsToGroup(pg, group)) {
                continue;
            }
            String userId = stringVal(row.get("user_id"));
            if (!StringUtils.hasText(userId)) {
                continue;
            }
            Map<String, Object> m = new HashMap<>();
            m.put("user_id", userId);
            m.put("name", stringVal(row.get("name")));
            m.put("head", row.get("head"));
            m.put("project_group_name", pg);
            out.add(m);
            if (out.size() >= lim) {
                break;
            }
        }
        return out;
    }

    private static String stringVal(Object o) {
        if (o == null) {
            return "";
        }
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }
}

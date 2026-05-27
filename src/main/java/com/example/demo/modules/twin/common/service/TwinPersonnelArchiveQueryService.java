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
        return PersonnelProjectGroupUtil.distinctGroupsMatchingKeyword(fields, kw, lim);
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

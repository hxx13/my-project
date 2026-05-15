package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDoorGroupCache;
import com.example.demo.modules.dahua.mapper.DahuaDoorGroupCacheMapper;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaDoorGroupCacheService {
    private final DahuaDoorGroupCacheMapper mapper;
    private final DahuaOpenApiService openApiService;

    public DahuaDoorGroupCacheService(DahuaDoorGroupCacheMapper mapper, DahuaOpenApiService openApiService) {
        this.mapper = mapper;
        this.openApiService = openApiService;
    }

    public Map<String, Object> refreshFromUpstream() {
        List<Map<String, Object>> all = openApiService.fetchAllDoorGroups();
        int synced = 0;
        for (Map<String, Object> item : all) {
            DahuaDoorGroupCache d = new DahuaDoorGroupCache();
            d.setId(DahuaOpenApiService.parseLong(item.get("id")));
            d.setName(item.get("name") == null ? null : String.valueOf(item.get("name")));
            d.setOrgCode(item.get("orgCode") == null ? null : String.valueOf(item.get("orgCode")));
            d.setOrgName(item.get("orgName") == null ? null : String.valueOf(item.get("orgName")));
            Object hasChild = item.get("hasChildChannel");
            d.setHasChildChannel(Boolean.TRUE.equals(hasChild) ? 1 : 0);
            d.setMemo(item.get("memo") == null ? null : String.valueOf(item.get("memo")));
            if (d.getId() == null) continue;
            synced += mapper.upsert(d);
        }
        Map<String, Object> stats = new HashMap<>();
        stats.put("upstreamCount", all.size());
        stats.put("syncedRows", synced);
        return stats;
    }

    public Map<String, Object> list(String keyword, int page, int pageSize) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(pageSize, 1);
        int offset = (safePage - 1) * safeSize;
        List<DahuaDoorGroupCache> rows = mapper.list(keyword, offset, safeSize);
        int total = mapper.count(keyword);
        Map<String, Object> data = new HashMap<>();
        data.put("list", rows);
        data.put("total", total);
        data.put("page", safePage);
        data.put("pageSize", safeSize);
        return data;
    }
}

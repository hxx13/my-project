package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDepartmentCache;
import com.example.demo.modules.dahua.mapper.DahuaDepartmentCacheMapper;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaDepartmentCacheService {
    private final DahuaDepartmentCacheMapper mapper;
    private final DahuaOpenApiService openApiService;

    public DahuaDepartmentCacheService(DahuaDepartmentCacheMapper mapper, DahuaOpenApiService openApiService) {
        this.mapper = mapper;
        this.openApiService = openApiService;
    }

    public Map<String, Object> refreshFromUpstream() {
        List<Map<String, Object>> all = openApiService.fetchAllDepartments();
        int synced = 0;
        for (Map<String, Object> item : all) {
            DahuaDepartmentCache d = new DahuaDepartmentCache();
            d.setId(DahuaOpenApiService.parseLong(item.get("id")));
            d.setParentId(DahuaOpenApiService.parseLong(item.get("parentId")));
            d.setName(item.get("name") == null ? null : String.valueOf(item.get("name")));
            d.setMemo(item.get("memo") == null ? null : String.valueOf(item.get("memo")));
            d.setSort(DahuaOpenApiService.parseInt(item.get("sort"), 0));
            d.setParentIds(item.get("parentIds") == null ? null : String.valueOf(item.get("parentIds")));
            d.setDepartmentSn(item.get("departmentSn") == null ? null : String.valueOf(item.get("departmentSn")));
            d.setDomainId(item.get("domainId") == null ? null : String.valueOf(item.get("domainId")));
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
        List<DahuaDepartmentCache> rows = mapper.list(keyword, offset, safeSize);
        int total = mapper.count(keyword);
        Map<String, Object> data = new HashMap<>();
        data.put("list", rows);
        data.put("total", total);
        data.put("page", safePage);
        data.put("pageSize", safeSize);
        return data;
    }
}

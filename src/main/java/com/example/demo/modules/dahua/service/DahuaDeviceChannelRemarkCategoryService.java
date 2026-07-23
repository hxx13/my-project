package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelRemarkCategory;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelRemarkCategoryMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaDeviceChannelRemarkCategoryService {
    private final DahuaDeviceChannelRemarkCategoryMapper mapper;

    public DahuaDeviceChannelRemarkCategoryService(DahuaDeviceChannelRemarkCategoryMapper mapper) {
        this.mapper = mapper;
    }

    public List<DahuaDeviceChannelRemarkCategory> listAll() {
        return mapper.listAll();
    }

    public Map<String, Object> create(String name, Integer sortOrder) {
        String n = normalizeName(name);
        DahuaDeviceChannelRemarkCategory row = new DahuaDeviceChannelRemarkCategory();
        row.setName(n);
        row.setSortOrder(sortOrder != null ? sortOrder : 0);
        mapper.insert(row);
        Map<String, Object> out = new HashMap<>();
        out.put("id", row.getId());
        return out;
    }

    public void update(long id, String name, Integer sortOrder) {
        DahuaDeviceChannelRemarkCategory existing = mapper.findById(id);
        if (existing == null) {
            throw new IllegalArgumentException("备注分类不存在");
        }
        DahuaDeviceChannelRemarkCategory row = new DahuaDeviceChannelRemarkCategory();
        row.setId(id);
        row.setName(normalizeName(name));
        row.setSortOrder(sortOrder != null ? sortOrder : existing.getSortOrder() != null ? existing.getSortOrder() : 0);
        mapper.update(row);
    }

    public void delete(long id) {
        int n = mapper.deleteById(id);
        if (n == 0) {
            throw new IllegalArgumentException("备注分类不存在");
        }
    }

    public DahuaDeviceChannelRemarkCategory requireExists(long id) {
        DahuaDeviceChannelRemarkCategory c = mapper.findById(id);
        if (c == null) {
            throw new IllegalArgumentException("备注分类不存在");
        }
        return c;
    }

    private static String normalizeName(String name) {
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("分类名称不能为空");
        }
        String t = name.trim();
        if (t.length() > 128) {
            throw new IllegalArgumentException("分类名称过长");
        }
        return t;
    }
}

package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelRemarkCategory;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelRemarkCategoryMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class DahuaDeviceChannelRemarkCategoryService {
    private final DahuaDeviceChannelRemarkCategoryMapper mapper;
    private final DahuaDeviceChannelCacheMapper channelMapper;

    public DahuaDeviceChannelRemarkCategoryService(DahuaDeviceChannelRemarkCategoryMapper mapper,
                                                   DahuaDeviceChannelCacheMapper channelMapper) {
        this.mapper = mapper;
        this.channelMapper = channelMapper;
    }

    public List<DahuaDeviceChannelRemarkCategory> listAll() {
        return mapper.listAll();
    }

    public DahuaDeviceChannelRemarkCategory findByName(String name) {
        return StringUtils.hasText(name) ? mapper.findByName(name.trim()) : null;
    }

    public Map<String, Object> create(String name, Integer sortOrder, Long parentId) {
        String n = normalizeName(name);
        Long parent = normalizeParent(parentId);
        assertSiblingNameFree(parent, n, null);
        DahuaDeviceChannelRemarkCategory row = new DahuaDeviceChannelRemarkCategory();
        row.setName(n);
        row.setParentId(parent);
        row.setSortOrder(sortOrder != null ? sortOrder : 0);
        mapper.insert(row);
        Map<String, Object> out = new HashMap<>();
        out.put("id", row.getId());
        return out;
    }

    public void update(long id, String name, Integer sortOrder, Long parentId) {
        DahuaDeviceChannelRemarkCategory existing = mapper.findById(id);
        if (existing == null) {
            throw new IllegalArgumentException("备注分类不存在");
        }
        Long parent = normalizeParent(parentId);
        if (parent != null) {
            if (parent == id) {
                throw new IllegalArgumentException("不能把文件夹挂到自己下面");
            }
            assertNoCycle(id, parent);
        }
        String n = normalizeName(name);
        assertSiblingNameFree(parent, n, id);
        DahuaDeviceChannelRemarkCategory row = new DahuaDeviceChannelRemarkCategory();
        row.setId(id);
        row.setName(n);
        row.setParentId(parent);
        row.setSortOrder(sortOrder != null ? sortOrder : existing.getSortOrder() != null ? existing.getSortOrder() : 0);
        mapper.update(row);
    }

    /** 删除文件夹：子文件夹与通道都上移到父文件夹，避免整棵子树消失 */
    public void delete(long id) {
        DahuaDeviceChannelRemarkCategory existing = mapper.findById(id);
        if (existing == null) {
            throw new IllegalArgumentException("备注分类不存在");
        }
        Long parentId = existing.getParentId();
        for (DahuaDeviceChannelRemarkCategory child : mapper.listByParent(id)) {
            DahuaDeviceChannelRemarkCategory row = new DahuaDeviceChannelRemarkCategory();
            row.setId(child.getId());
            row.setName(child.getName());
            row.setParentId(parentId);
            row.setSortOrder(child.getSortOrder() != null ? child.getSortOrder() : 0);
            mapper.update(row);
        }
        channelMapper.reassignRemarkCategory(id, parentId);
        mapper.deleteById(id);
    }

    public DahuaDeviceChannelRemarkCategory requireExists(long id) {
        DahuaDeviceChannelRemarkCategory c = mapper.findById(id);
        if (c == null) {
            throw new IllegalArgumentException("备注分类不存在");
        }
        return c;
    }

    /** 门组种子用：同父级下同名文件夹已存在就复用，必要时修正父节点 */
    public DahuaDeviceChannelRemarkCategory ensureFolder(String name, Long parentId, int sortOrder) {
        String n = normalizeName(name);
        DahuaDeviceChannelRemarkCategory existing = mapper.findByParentAndName(parentId, n);
        if (existing != null) {
            return existing;
        }
        DahuaDeviceChannelRemarkCategory row = new DahuaDeviceChannelRemarkCategory();
        row.setName(n);
        row.setParentId(parentId);
        row.setSortOrder(sortOrder);
        mapper.insert(row);
        return row;
    }

    private void assertNoCycle(long id, long newParentId) {
        Set<Long> seen = new HashSet<>();
        Long cursor = newParentId;
        while (cursor != null) {
            if (!seen.add(cursor)) break;
            if (cursor == id) {
                throw new IllegalArgumentException("不能把文件夹移动到自己的子文件夹下");
            }
            DahuaDeviceChannelRemarkCategory parent = mapper.findById(cursor);
            cursor = parent == null ? null : parent.getParentId();
        }
    }

    private Long normalizeParent(Long parentId) {
        if (parentId == null || parentId <= 0) return null;
        if (mapper.findById(parentId) == null) {
            throw new IllegalArgumentException("父文件夹不存在");
        }
        return parentId;
    }

    private void assertSiblingNameFree(Long parentId, String name, Long excludeId) {
        DahuaDeviceChannelRemarkCategory dup = mapper.findByParentAndName(parentId, name);
        if (dup != null && (excludeId == null || !dup.getId().equals(excludeId))) {
            throw new IllegalArgumentException("同级下已有同名文件夹");
        }
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

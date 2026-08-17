package com.example.demo.modules.inventory.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.inventory.dto.CategoryNodeView;
import com.example.demo.modules.inventory.dto.CategoryUpsertReq;
import com.example.demo.modules.inventory.entity.InvCategory;
import com.example.demo.modules.inventory.mapper.CategoryMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class CategoryService {

    private final CategoryMapper categoryMapper;

    public CategoryService(CategoryMapper categoryMapper) {
        this.categoryMapper = categoryMapper;
    }

    public Result<List<CategoryNodeView>> tree() {
        List<InvCategory> all = categoryMapper.selectAll();
        Map<Long, List<InvCategory>> childrenByParent = new LinkedHashMap<>();
        Set<Long> ids = new HashSet<>();
        for (InvCategory c : all) {
            if (c.getId() != null) ids.add(c.getId());
            childrenByParent.computeIfAbsent(c.getParentId(), k -> new ArrayList<>()).add(c);
        }
        List<CategoryNodeView> roots = new ArrayList<>();
        for (InvCategory c : all) {
            if (c.getParentId() == null || !ids.contains(c.getParentId())) {
                roots.add(toNode(c, childrenByParent, new HashSet<>()));
            }
        }
        return Result.success(roots);
    }

    public Result<InvCategory> create(CategoryUpsertReq req) {
        if (req == null || !StringUtils.hasText(req.getName())) {
            return Result.error("分类名称不能为空");
        }
        if (wouldCreateCycle(null, req.getParentId())) {
            return Result.error("父节点非法，不能形成循环");
        }
        InvCategory category = new InvCategory();
        category.setParentId(req.getParentId());
        category.setName(req.getName());
        category.setIconType(req.getIconType() != null ? req.getIconType() : "builtin");
        category.setIconValue(req.getIconValue());
        category.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        categoryMapper.insert(category);
        return Result.success(categoryMapper.selectById(category.getId()));
    }

    public Result<InvCategory> update(Long id, CategoryUpsertReq req) {
        InvCategory category = categoryMapper.selectById(id);
        if (category == null) return Result.error("分类不存在");
        if (req.getParentId() != null) {
            if (wouldCreateCycle(id, req.getParentId())) {
                return Result.error("父节点非法，不能形成循环");
            }
            category.setParentId(req.getParentId());
        }
        if (req.getName() != null) category.setName(req.getName());
        if (req.getIconType() != null) category.setIconType(req.getIconType());
        if (req.getIconValue() != null) category.setIconValue(req.getIconValue());
        if (req.getSortOrder() != null) category.setSortOrder(req.getSortOrder());
        categoryMapper.updateById(category);
        return Result.success(categoryMapper.selectById(id));
    }

    public Result<?> delete(Long id) {
        if (categoryMapper.selectById(id) == null) return Result.error("分类不存在");
        if (categoryMapper.countChildren(id) > 0 || categoryMapper.countItemsInCategory(id) > 0) {
            return Result.error("该分类下仍有子分类或物品，无法删除");
        }
        categoryMapper.softDelete(id);
        return Result.success(null);
    }

    private CategoryNodeView toNode(InvCategory c, Map<Long, List<InvCategory>> childrenByParent, Set<Long> visited) {
        CategoryNodeView v = new CategoryNodeView();
        v.setId(c.getId());
        v.setParentId(c.getParentId());
        v.setName(c.getName());
        v.setIconType(c.getIconType());
        v.setIconValue(c.getIconValue());
        v.setSortOrder(c.getSortOrder());
        List<CategoryNodeView> childViews = new ArrayList<>();
        if (c.getId() != null && visited.add(c.getId())) {
            List<InvCategory> children = childrenByParent.get(c.getId());
            if (children != null) {
                for (InvCategory child : children) {
                    childViews.add(toNode(child, childrenByParent, visited));
                }
            }
        }
        v.setChildren(childViews);
        return v;
    }

    /** 判断把 nodeId 的父节点设为 parentId 是否会成环（父节点是自身或其后代）。nodeId 为 null 表示新建。 */
    private boolean wouldCreateCycle(Long nodeId, Long parentId) {
        if (parentId == null) return false;
        if (parentId.equals(nodeId)) return true;
        Map<Long, Long> parentOf = new HashMap<>();
        for (InvCategory c : categoryMapper.selectAll()) {
            if (c.getId() != null) parentOf.put(c.getId(), c.getParentId());
        }
        Long cur = parentOf.get(parentId);
        Set<Long> visited = new HashSet<>();
        while (cur != null && visited.add(cur)) {
            if (cur.equals(nodeId)) return true;
            cur = parentOf.get(cur);
        }
        return false;
    }
}

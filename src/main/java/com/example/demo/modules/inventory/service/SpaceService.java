package com.example.demo.modules.inventory.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.inventory.dto.SpaceNodeView;
import com.example.demo.modules.inventory.dto.SpaceUpsertReq;
import com.example.demo.modules.inventory.entity.InvSpace;
import com.example.demo.modules.inventory.mapper.SpaceMapper;
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
public class SpaceService {

    private final SpaceMapper spaceMapper;

    public SpaceService(SpaceMapper spaceMapper) {
        this.spaceMapper = spaceMapper;
    }

    public Result<List<SpaceNodeView>> tree() {
        List<InvSpace> all = spaceMapper.selectAll();
        Map<Long, List<InvSpace>> childrenByParent = new LinkedHashMap<>();
        Set<Long> ids = new HashSet<>();
        for (InvSpace s : all) {
            if (s.getId() != null) ids.add(s.getId());
            childrenByParent.computeIfAbsent(s.getParentId(), k -> new ArrayList<>()).add(s);
        }
        List<SpaceNodeView> roots = new ArrayList<>();
        for (InvSpace s : all) {
            if (s.getParentId() == null || !ids.contains(s.getParentId())) {
                roots.add(toNode(s, childrenByParent, new HashSet<>()));
            }
        }
        return Result.success(roots);
    }

    public Result<InvSpace> create(SpaceUpsertReq req) {
        if (req == null || !StringUtils.hasText(req.getName())) {
            return Result.error("空间名称不能为空");
        }
        if (wouldCreateCycle(null, req.getParentId())) {
            return Result.error("父节点非法，不能形成循环");
        }
        InvSpace space = new InvSpace();
        space.setParentId(req.getParentId());
        space.setName(req.getName());
        space.setType(req.getType() != null ? req.getType() : "room");
        space.setIcon(req.getIcon());
        space.setPosX(req.getPosX());
        space.setPosY(req.getPosY());
        space.setWidth(req.getWidth());
        space.setHeight(req.getHeight());
        space.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        space.setCode(req.getCode());
        spaceMapper.insert(space);
        return Result.success(spaceMapper.selectById(space.getId()));
    }

    public Result<InvSpace> update(Long id, SpaceUpsertReq req) {
        InvSpace space = spaceMapper.selectById(id);
        if (space == null) return Result.error("空间不存在");
        if (Boolean.TRUE.equals(req.getMoveToRoot())) {
            space.setParentId(null);
        } else if (req.getParentId() != null) {
            if (wouldCreateCycle(id, req.getParentId())) {
                return Result.error("父节点非法，不能形成循环");
            }
            space.setParentId(req.getParentId());
        }
        if (Boolean.TRUE.equals(req.getClearGeometry())) {
            space.setPosX(null);
            space.setPosY(null);
            space.setWidth(null);
            space.setHeight(null);
        } else {
            if (req.getPosX() != null) space.setPosX(req.getPosX());
            if (req.getPosY() != null) space.setPosY(req.getPosY());
            if (req.getWidth() != null) space.setWidth(req.getWidth());
            if (req.getHeight() != null) space.setHeight(req.getHeight());
        }
        if (StringUtils.hasText(req.getName())) space.setName(req.getName());
        if (req.getType() != null) space.setType(req.getType());
        if (req.getIcon() != null) space.setIcon(req.getIcon());
        if (req.getSortOrder() != null) space.setSortOrder(req.getSortOrder());
        if (req.getCode() != null) space.setCode(req.getCode());
        spaceMapper.updateById(space);
        return Result.success(spaceMapper.selectById(id));
    }

    public Result<?> delete(Long id) {
        if (spaceMapper.selectById(id) == null) return Result.error("空间不存在");
        if (spaceMapper.countChildren(id) > 0 || spaceMapper.countItemsInSpace(id) > 0) {
            return Result.error("该空间下仍有子空间或物品，无法删除");
        }
        spaceMapper.softDelete(id);
        return Result.success(null);
    }

    private SpaceNodeView toNode(InvSpace s, Map<Long, List<InvSpace>> childrenByParent, Set<Long> visited) {
        SpaceNodeView v = new SpaceNodeView();
        v.setId(s.getId());
        v.setParentId(s.getParentId());
        v.setName(s.getName());
        v.setType(s.getType());
        v.setIcon(s.getIcon());
        v.setPosX(s.getPosX());
        v.setPosY(s.getPosY());
        v.setWidth(s.getWidth());
        v.setHeight(s.getHeight());
        v.setSortOrder(s.getSortOrder());
        v.setCode(s.getCode());
        v.setItemCount(spaceMapper.countItemsInSpace(s.getId()));
        List<SpaceNodeView> childViews = new ArrayList<>();
        if (s.getId() != null && visited.add(s.getId())) {
            List<InvSpace> children = childrenByParent.get(s.getId());
            if (children != null) {
                for (InvSpace child : children) {
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
        for (InvSpace s : spaceMapper.selectAll()) {
            if (s.getId() != null) parentOf.put(s.getId(), s.getParentId());
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

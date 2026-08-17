package com.example.demo.modules.inventory.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.inventory.dto.ItemLogView;
import com.example.demo.modules.inventory.dto.ItemRetireReq;
import com.example.demo.modules.inventory.dto.ItemTransferReq;
import com.example.demo.modules.inventory.dto.ItemUpsertReq;
import com.example.demo.modules.inventory.dto.ItemView;
import com.example.demo.modules.inventory.entity.InvItem;
import com.example.demo.modules.inventory.entity.InvItemLog;
import com.example.demo.modules.inventory.entity.InvSpace;
import com.example.demo.modules.inventory.mapper.CategoryMapper;
import com.example.demo.modules.inventory.mapper.ItemLogMapper;
import com.example.demo.modules.inventory.mapper.ItemMapper;
import com.example.demo.modules.inventory.mapper.SpaceMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ItemService {

    private final ItemMapper itemMapper;
    private final ItemLogMapper itemLogMapper;
    private final SpaceMapper spaceMapper;
    private final CategoryMapper categoryMapper;

    public ItemService(ItemMapper itemMapper, ItemLogMapper itemLogMapper,
                       SpaceMapper spaceMapper, CategoryMapper categoryMapper) {
        this.itemMapper = itemMapper;
        this.itemLogMapper = itemLogMapper;
        this.spaceMapper = spaceMapper;
        this.categoryMapper = categoryMapper;
    }

    // ==================== 查询 ====================

    public Result<Map<String, Object>> list(String keyword, Long spaceId, Long categoryId, String granularity,
                                            String status, Boolean hasCode, int page, int size) {
        page = Math.max(1, page);
        size = Math.min(Math.max(1, size), 200);
        int offset = (page - 1) * size;
        List<Long> spaceIds = spaceId != null ? collectSpaceIdsWithDescendants(spaceId) : null;
        List<InvItem> items = itemMapper.selectList(keyword, spaceIds, categoryId, granularity, status, hasCode, offset, size);
        int total = itemMapper.countList(keyword, spaceIds, categoryId, granularity, status, hasCode);

        Map<Long, InvSpace> spaceById = loadSpaceById();
        List<ItemView> list = items.stream().map(i -> toView(i, spaceById)).collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("total", total);
        return Result.success(result);
    }

    public Result<ItemView> get(Long id) {
        InvItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        return Result.success(toView(item, loadSpaceById()));
    }

    public Result<List<ItemLogView>> listLogs(Long id) {
        List<InvItemLog> logs = itemLogMapper.selectByItemId(id);
        return Result.success(logs.stream().map(this::toLogView).collect(Collectors.toList()));
    }

    // ==================== 写入 ====================

    @Transactional
    public Result<ItemView> create(User operator, ItemUpsertReq req) {
        String rfidCode = StringUtils.hasText(req.getRfidCode()) ? req.getRfidCode().trim() : null;
        if (StringUtils.hasText(rfidCode) && itemMapper.selectByRfidCode(rfidCode) != null) {
            return Result.error("该RFID码已存在");
        }
        if (!StringUtils.hasText(req.getName())) {
            return Result.error("物品名称不能为空");
        }
        InvItem item = new InvItem();
        item.setRfidCode(rfidCode);
        item.setName(req.getName());
        item.setCategoryId(req.getCategoryId());
        item.setSpaceId(req.getSpaceId());
        item.setGranularity(req.getGranularity() != null ? req.getGranularity() : "UNIT");
        item.setQty(req.getQty() != null ? req.getQty() : 1);
        item.setStatus(req.getStatus() != null ? req.getStatus() : "IN_USE");
        item.setIconType(req.getIconType());
        item.setIconValue(req.getIconValue());
        item.setBrand(req.getBrand());
        item.setModel(req.getModel());
        item.setSpec(req.getSpec());
        item.setExpireAt(req.getExpireAt());
        item.setSupplier(req.getSupplier());
        item.setPurchaseNo(req.getPurchaseNo());
        item.setPrice(req.getPrice());
        item.setPurchaseDate(req.getPurchaseDate());
        item.setWarrantyUntil(req.getWarrantyUntil());
        item.setFundSource(req.getFundSource());
        item.setExt(req.getExt());
        item.setCoverUrl(req.getCoverUrl());
        item.setDetailImages(req.getDetailImages());
        item.setCreatedBy(operator != null ? operator.getId() : null);
        try {
            itemMapper.insert(item);
        } catch (DuplicateKeyException e) {
            return Result.error("该RFID码已存在");
        }
        writeLog(item.getId(), "CREATE", null, null, operator, null, null);
        return Result.success(toView(itemMapper.selectById(item.getId()), loadSpaceById()));
    }

    @Transactional
    public Result<ItemView> update(User operator, Long id, ItemUpsertReq req) {
        InvItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        String newRfidCode = req.getRfidCode();
        if (newRfidCode != null) {
            newRfidCode = newRfidCode.trim();
            if (newRfidCode.isEmpty()) newRfidCode = null;
        }
        if (newRfidCode != null) {
            InvItem dup = itemMapper.selectByRfidCode(newRfidCode);
            if (dup != null && !dup.getId().equals(id)) {
                return Result.error("该RFID码已存在");
            }
            item.setRfidCode(newRfidCode);
        }
        if (req.getName() != null) item.setName(req.getName());
        if (req.getCategoryId() != null) item.setCategoryId(req.getCategoryId());
        if (req.getSpaceId() != null) item.setSpaceId(req.getSpaceId());
        if (req.getGranularity() != null) item.setGranularity(req.getGranularity());
        if (req.getQty() != null) item.setQty(req.getQty());
        if (req.getStatus() != null) item.setStatus(req.getStatus());
        if (req.getIconType() != null) item.setIconType(req.getIconType());
        if (req.getIconValue() != null) item.setIconValue(req.getIconValue());
        if (req.getBrand() != null) item.setBrand(req.getBrand());
        if (req.getModel() != null) item.setModel(req.getModel());
        if (req.getSpec() != null) item.setSpec(req.getSpec());
        if (req.getExpireAt() != null) item.setExpireAt(req.getExpireAt());
        if (req.getSupplier() != null) item.setSupplier(req.getSupplier());
        if (req.getPurchaseNo() != null) item.setPurchaseNo(req.getPurchaseNo());
        if (req.getPrice() != null) item.setPrice(req.getPrice());
        if (req.getPurchaseDate() != null) item.setPurchaseDate(req.getPurchaseDate());
        if (req.getWarrantyUntil() != null) item.setWarrantyUntil(req.getWarrantyUntil());
        if (req.getFundSource() != null) item.setFundSource(req.getFundSource());
        if (req.getExt() != null) item.setExt(req.getExt());
        if (req.getCoverUrl() != null) item.setCoverUrl(req.getCoverUrl());
        if (req.getDetailImages() != null) item.setDetailImages(req.getDetailImages());
        try {
            itemMapper.updateById(item);
        } catch (DuplicateKeyException e) {
            return Result.error("该RFID码已存在");
        }
        writeLog(id, "UPDATE", null, null, operator, null, null);
        return Result.success(toView(itemMapper.selectById(id), loadSpaceById()));
    }

    @Transactional
    public Result<?> transfer(User operator, Long id, ItemTransferReq req) {
        InvItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        if ("RETIRED".equals(item.getStatus())) return Result.error("已废弃物品不可转移");
        if (spaceMapper.selectById(req.getSpaceId()) == null) return Result.error("目标空间不存在");
        Long fromSpaceId = item.getSpaceId();
        itemMapper.updateSpace(id, req.getSpaceId());
        writeLog(id, "TRANSFER", fromSpaceId, req.getSpaceId(), operator, null, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> retire(User operator, Long id, ItemRetireReq req) {
        InvItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        itemMapper.updateStatus(id, "RETIRED");
        writeLog(id, "RETIRE", null, null, operator, joinRetireRemark(req.getReason(), req.getRemark()), null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> recover(User operator, Long id) {
        InvItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        if (!"MISSING".equals(item.getStatus()) && !"RETIRED".equals(item.getStatus())) {
            return Result.error("当前状态无需恢复");
        }
        itemMapper.updateStatus(id, "IN_USE");
        writeLog(id, "UPDATE", null, null, operator, null, null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> delete(User operator, Long id) {
        InvItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        itemMapper.softDelete(id);
        writeLog(id, "UPDATE", null, null, operator, "删除", null);
        return Result.success(null);
    }

    // ==================== 留痕 ====================

    private void writeLog(Long itemId, String logType, Long fromSpaceId, Long toSpaceId,
                          User operator, String remark, String extra) {
        InvItemLog log = new InvItemLog();
        log.setItemId(itemId);
        log.setLogType(logType);
        log.setFromSpaceId(fromSpaceId);
        log.setToSpaceId(toSpaceId);
        log.setOperatorUserId(operator != null ? operator.getId() : null);
        log.setRemark(remark);
        log.setExtra(extra);
        itemLogMapper.insert(log);
    }

    // ==================== 视图组装 ====================

    private ItemView toView(InvItem item, Map<Long, InvSpace> spaceById) {
        ItemView v = new ItemView();
        v.setId(item.getId());
        v.setRfidCode(item.getRfidCode());
        v.setName(item.getName());
        v.setCategoryId(item.getCategoryId());
        v.setSpaceId(item.getSpaceId());
        v.setGranularity(item.getGranularity());
        v.setQty(item.getQty());
        v.setStatus(item.getStatus());
        v.setIconType(item.getIconType());
        v.setIconValue(item.getIconValue());
        v.setBrand(item.getBrand());
        v.setModel(item.getModel());
        v.setSpec(item.getSpec());
        v.setExpireAt(item.getExpireAt());
        v.setSupplier(item.getSupplier());
        v.setPurchaseNo(item.getPurchaseNo());
        v.setPrice(item.getPrice());
        v.setPurchaseDate(item.getPurchaseDate());
        v.setWarrantyUntil(item.getWarrantyUntil());
        v.setFundSource(item.getFundSource());
        v.setExt(item.getExt());
        v.setCoverUrl(item.getCoverUrl());
        v.setDetailImages(item.getDetailImages());
        v.setLastScannedAt(item.getLastScannedAt());
        v.setCreatedBy(item.getCreatedBy());
        v.setDeleted(item.getDeleted());
        v.setCreatedAt(item.getCreatedAt());
        v.setUpdatedAt(item.getUpdatedAt());
        v.setSpacePath(buildSpacePath(item.getSpaceId(), spaceById));
        v.setCategoryName(item.getCategoryId() == null ? null : categoryName(item.getCategoryId()));
        return v;
    }

    private ItemLogView toLogView(InvItemLog log) {
        ItemLogView v = new ItemLogView();
        v.setId(log.getId());
        v.setItemId(log.getItemId());
        v.setLogType(log.getLogType());
        v.setFromSpaceId(log.getFromSpaceId());
        v.setToSpaceId(log.getToSpaceId());
        v.setOperatorUserId(log.getOperatorUserId());
        v.setRemark(log.getRemark());
        v.setExtra(log.getExtra());
        v.setCreatedAt(log.getCreatedAt());
        return v;
    }

    private Map<Long, InvSpace> loadSpaceById() {
        Map<Long, InvSpace> map = new HashMap<>();
        for (InvSpace s : spaceMapper.selectAll()) {
            if (s.getId() != null) map.put(s.getId(), s);
        }
        return map;
    }

    /** 沿 parentId 向上拼出空间完整路径（根在前），分隔符「 / 」。 */
    private String buildSpacePath(Long spaceId, Map<Long, InvSpace> spaceById) {
        if (spaceId == null) return null;
        List<String> names = new ArrayList<>();
        Long cur = spaceId;
        Set<Long> visited = new HashSet<>();
        while (cur != null && spaceById.containsKey(cur) && visited.add(cur)) {
            names.add(0, spaceById.get(cur).getName());
            cur = spaceById.get(cur).getParentId();
        }
        return String.join(" / ", names);
    }

    private String categoryName(Long categoryId) {
        if (categoryId == null) return null;
        com.example.demo.modules.inventory.entity.InvCategory c = categoryMapper.selectById(categoryId);
        return c != null ? c.getName() : null;
    }

    /** 计算某空间及其全部后代 id（含自身）。 */
    private List<Long> collectSpaceIdsWithDescendants(Long spaceId) {
        List<InvSpace> all = spaceMapper.selectAll();
        Map<Long, List<Long>> childrenByParent = new HashMap<>();
        for (InvSpace s : all) {
            if (s.getParentId() != null) {
                childrenByParent.computeIfAbsent(s.getParentId(), k -> new ArrayList<>()).add(s.getId());
            }
        }
        List<Long> result = new ArrayList<>();
        Deque<Long> stack = new ArrayDeque<>();
        Set<Long> seen = new HashSet<>();
        stack.push(spaceId);
        while (!stack.isEmpty()) {
            Long cur = stack.pop();
            if (cur == null || !seen.add(cur)) continue;
            result.add(cur);
            List<Long> children = childrenByParent.get(cur);
            if (children != null) {
                for (Long c : children) stack.push(c);
            }
        }
        return result;
    }

    /** 废弃原因 + 备注拼成留痕 remark。 */
    private String joinRetireRemark(String reason, String remark) {
        if (StringUtils.hasText(reason) && StringUtils.hasText(remark)) return reason + "：" + remark;
        if (StringUtils.hasText(reason)) return reason;
        if (StringUtils.hasText(remark)) return remark;
        return null;
    }
}

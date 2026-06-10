package com.example.demo.modules.material.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.material.dto.*;
import com.example.demo.modules.material.entity.*;
import com.example.demo.modules.material.mapper.*;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class MaterialService {
    private static final Logger log = LoggerFactory.getLogger(MaterialService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final MaterialCategoryMapper categoryMapper;
    private final MaterialItemMapper itemMapper;
    private final MaterialCartMapper cartMapper;
    private final MaterialRequestMapper requestMapper;
    private final MaterialRequestLineMapper requestLineMapper;
    private final MaterialStockMovementMapper stockMovementMapper;
    private final MaterialOperationLogMapper operationLogMapper;
    private final NotificationService notificationService;
    private final UserDisplayNameService userDisplayNameService;

    public MaterialService(MaterialCategoryMapper categoryMapper, MaterialItemMapper itemMapper,
                           MaterialCartMapper cartMapper, MaterialRequestMapper requestMapper,
                           MaterialRequestLineMapper requestLineMapper,
                           MaterialStockMovementMapper stockMovementMapper,
                           MaterialOperationLogMapper operationLogMapper,
                           NotificationService notificationService,
                           UserDisplayNameService userDisplayNameService) {
        this.categoryMapper = categoryMapper;
        this.itemMapper = itemMapper;
        this.cartMapper = cartMapper;
        this.requestMapper = requestMapper;
        this.requestLineMapper = requestLineMapper;
        this.stockMovementMapper = stockMovementMapper;
        this.operationLogMapper = operationLogMapper;
        this.notificationService = notificationService;
        this.userDisplayNameService = userDisplayNameService;
    }

    // ==================== 分类 ====================

    public List<MaterialCategoryView> listCategoriesForStudent() {
        return categoryMapper.selectEnabled().stream().map(this::toCategoryView).collect(Collectors.toList());
    }

    public List<MaterialCategoryView> listCategoriesForAdmin() {
        return categoryMapper.selectAll().stream().map(this::toCategoryView).collect(Collectors.toList());
    }

    public Result<MaterialCategoryView> createCategory(String name, Integer sortOrder) {
        MaterialCategory c = new MaterialCategory();
        c.setName(name);
        c.setSortOrder(sortOrder != null ? sortOrder : 0);
        c.setStatus(1);
        categoryMapper.insert(c);
        logOp("CATEGORY", String.valueOf(c.getId()), "CREATE", null);
        return Result.success(toCategoryView(categoryMapper.selectById(c.getId())));
    }

    public Result<MaterialCategoryView> updateCategory(Long id, String name, Integer sortOrder, Integer status) {
        MaterialCategory c = categoryMapper.selectById(id);
        if (c == null) return Result.error("分类不存在");
        if (name != null) c.setName(name);
        if (sortOrder != null) c.setSortOrder(sortOrder);
        if (status != null) c.setStatus(status);
        categoryMapper.updateById(c);
        return Result.success(toCategoryView(categoryMapper.selectById(id)));
    }

    public Result<?> deleteCategory(Long id) {
        categoryMapper.deleteById(id);
        return Result.success(null);
    }

    // ==================== 物品 ====================

    public List<MaterialItemView> listItemsForStudent(Long categoryId) {
        return itemMapper.selectPublished(categoryId).stream().map(this::toItemView).collect(Collectors.toList());
    }

    public List<MaterialItemView> listItemsForAdmin(Long categoryId) {
        return itemMapper.selectAll(categoryId).stream().map(this::toItemView).collect(Collectors.toList());
    }

    public Result<MaterialItemView> getItem(Long id) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        return Result.success(toItemView(item));
    }

    @Transactional
    public Result<MaterialItemView> createItem(MaterialItemUpsertReq req) {
        MaterialItem item = new MaterialItem();
        item.setCategoryId(req.getCategoryId());
        item.setName(req.getName());
        item.setSubtitle(req.getSubtitle());
        item.setCoverUrl(req.getCoverUrl());
        item.setShelfStatus(req.getShelfStatus() != null ? req.getShelfStatus() : "DRAFT");
        item.setStockMode(req.getStockMode() != null ? req.getStockMode() : "LIMITED");
        item.setStockQty(0);
        item.setWorkflowType(req.getWorkflowType() != null ? req.getWorkflowType() : "SIMPLE");
        item.setReviewerIds(req.getReviewerIds());
        item.setSecondReviewerIds(req.getSecondReviewerIds());
        itemMapper.insert(item);
        logOp("ITEM", String.valueOf(item.getId()), "CREATE", null);
        return Result.success(toItemView(itemMapper.selectById(item.getId())));
    }

    @Transactional
    public Result<MaterialItemView> updateItem(Long id, MaterialItemUpsertReq req) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        if (req.getCategoryId() != null) item.setCategoryId(req.getCategoryId());
        if (req.getName() != null) item.setName(req.getName());
        if (req.getSubtitle() != null) item.setSubtitle(req.getSubtitle());
        if (req.getCoverUrl() != null) item.setCoverUrl(req.getCoverUrl());
        if (req.getShelfStatus() != null) item.setShelfStatus(req.getShelfStatus());
        if (req.getStockMode() != null) item.setStockMode(req.getStockMode());
        if (req.getWorkflowType() != null) item.setWorkflowType(req.getWorkflowType());
        if (req.getReviewerIds() != null) item.setReviewerIds(req.getReviewerIds());
        if (req.getSecondReviewerIds() != null) item.setSecondReviewerIds(req.getSecondReviewerIds());
        itemMapper.updateById(item);
        logOp("ITEM", String.valueOf(id), "UPDATE", null);
        return Result.success(toItemView(itemMapper.selectById(id)));
    }

    public Result<?> softDeleteItem(User operator, Long id) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        itemMapper.softDelete(id, operator != null ? operator.getId() : null, java.time.LocalDateTime.now().plusDays(7));
        logOp("ITEM", String.valueOf(id), "DELETE", null);
        return Result.success(null);
    }

    public Result<Map<String, Object>> listItemRecycle(int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialItem> items = itemMapper.selectRecycle(offset, size);
        int total = itemMapper.countRecycle();
        Map<String, Object> result = new HashMap<>();
        result.put("data", items);
        result.put("total", total);
        return Result.success(result);
    }

    public Result<?> restoreItem(Long id) {
        itemMapper.restore(id);
        return Result.success(null);
    }

    public Result<?> purgeItem(Long id) {
        itemMapper.purge(id);
        return Result.success(null);
    }

    public Result<?> purgeItems(List<Long> ids) {
        for (Long id : ids) itemMapper.purge(id);
        return Result.success(Map.of("deleted", ids.size()));
    }

    public Result<?> purgeAllItems() {
        List<MaterialItem> all = itemMapper.selectRecycle(0, 10000);
        int count = 0;
        for (MaterialItem it : all) { itemMapper.purge(it.getId()); count++; }
        return Result.success(Map.of("deleted", count));
    }

    @Transactional
    public Result<?> adjustStock(User operator, Long id, int newQty) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        int oldQty = item.getStockQty() != null ? item.getStockQty() : 0;
        itemMapper.updateStock(id, newQty - oldQty);
        MaterialStockMovement m = new MaterialStockMovement();
        m.setItemId(id);
        m.setMovementType("ADJUST");
        m.setQty(newQty - oldQty);
        m.setStockAfter(newQty);
        m.setOperatorUserId(operator != null ? operator.getId() : null);
        m.setRemark("库存纠偏 " + oldQty + " → " + newQty);
        stockMovementMapper.insert(m);
        logOp("ITEM", String.valueOf(id), "ADJUST", Map.of("old", oldQty, "new", newQty));
        return Result.success(null);
    }

    @Transactional
    public Result<?> inbound(User operator, InboundMaterialReq req) {
        MaterialItem item = itemMapper.selectById(req.getItemId());
        if (item == null) return Result.error("物品不存在");
        int before = item.getStockQty() != null ? item.getStockQty() : 0;
        itemMapper.updateStock(req.getItemId(), req.getQty());
        MaterialStockMovement m = new MaterialStockMovement();
        m.setItemId(req.getItemId());
        m.setMovementType("INBOUND");
        m.setQty(req.getQty());
        m.setStockAfter(before + req.getQty());
        m.setOperatorUserId(operator != null ? operator.getId() : null);
        m.setRemark("入库");
        stockMovementMapper.insert(m);
        if ("DRAFT".equals(item.getShelfStatus())) {
            item.setShelfStatus("PUBLISHED");
            itemMapper.updateById(item);
        }
        logOp("ITEM", String.valueOf(req.getItemId()), "INBOUND", Map.of("qty", req.getQty()));
        return Result.success(null);
    }

    // ==================== 购物车 ====================

    public Result<Map<String, Object>> getCart(User user) {
        MaterialCart cart = cartMapper.selectByUserId(user.getId());
        Map<String, Object> result = new HashMap<>();
        if (cart != null && cart.getLinesJson() != null) {
            try {
                Map<String, Integer> lines = objectMapper.readValue(cart.getLinesJson(),
                        new TypeReference<Map<String, Integer>>() {});
                result.put("lines", lines);
            } catch (Exception e) {
                result.put("lines", new HashMap<>());
            }
        } else {
            result.put("lines", new HashMap<>());
        }
        return Result.success(result);
    }

    @SuppressWarnings("unchecked")
    public Result<?> saveCart(User user, Map<String, Object> body) {
        try {
            Map<String, Integer> lines = (Map<String, Integer>) body.getOrDefault("lines", new HashMap<>());
            String json = objectMapper.writeValueAsString(lines);
            cartMapper.insertOrUpdate(user.getId(), json);
            return Result.success(null);
        } catch (Exception e) {
            return Result.error("保存购物车失败");
        }
    }

    // ==================== 申领单 ====================

    @Transactional
    public Result<MaterialRequestView> createRequest(User user, CreateMaterialRequestReq req) {
        if (req.getLines() == null || req.getLines().isEmpty()) return Result.error("申领物品不能为空");
        String id = "MR" + System.currentTimeMillis() + String.format("%04d", new Random().nextInt(10000));
        MaterialRequest request = new MaterialRequest();
        request.setId(id);
        request.setUserId(user.getId());
        request.setApplicantName(userDisplayNameService.resolveDisplayName(user.getId()));
        request.setApplicantGroup(req.getApplicantGroup() != null ? req.getApplicantGroup() : null);
        request.setStatus("PENDING");
        MaterialItem firstItem = itemMapper.selectById(req.getLines().get(0).getItemId());
        request.setWorkflowType(firstItem != null ? firstItem.getWorkflowType() : "SIMPLE");
        requestMapper.insert(request);

        List<MaterialRequestLine> lines = new ArrayList<>();
        for (var lineReq : req.getLines()) {
            MaterialItem item = itemMapper.selectById(lineReq.getItemId());
            MaterialRequestLine line = new MaterialRequestLine();
            line.setRequestId(id);
            line.setItemId(lineReq.getItemId());
            line.setQty(lineReq.getQty());
            line.setSnapshotName(item != null ? item.getName() : "未知物品");
            line.setFulfilledQty(0);
            lines.add(line);
        }
        requestLineMapper.insertBatch(lines);
        // 预占库存
        for (var lr : req.getLines()) {
            MaterialItem item = itemMapper.selectById(lr.getItemId());
            if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                int lockQty = Math.min(lr.getQty(), item.getStockQty() != null ? item.getStockQty() : 0);
                if (lockQty > 0) itemMapper.lockStock(lr.getItemId(), lockQty);
            }
        }
        logOp("REQUEST", id, "SUBMIT", Map.of("lines", req.getLines().size()));
        publishMaterialEvent("CREATED", id, user.getId(), user.getId(), "共 " + req.getLines().size() + " 项物资");
        return Result.success(toRequestView(requestMapper.selectById(id)));
    }

    public Result<Map<String, Object>> listMine(User user, String status, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectByUserId(user.getId(), status, offset, size);
        int total = requestMapper.countByUserId(user.getId(), status);
        Map<String, Object> result = new HashMap<>();
        result.put("data", requests.stream().map(this::toRequestView).collect(Collectors.toList()));
        result.put("total", total);
        return Result.success(result);
    }

    public Result<Map<String, Object>> listAll(String status, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectAll(status, offset, size);
        int total = requestMapper.countAll(status);
        Map<String, Object> result = new HashMap<>();
        result.put("data", requests.stream().map(this::toRequestView).collect(Collectors.toList()));
        result.put("total", total);
        return Result.success(result);
    }

    public Result<MaterialRequestView> getRequestDetail(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (user.getRole() != null && "STUDENT".equals(user.getRole().name())) {
            if (!user.getId().equals(request.getUserId())) return Result.error("无权查看");
        }
        return Result.success(toRequestView(request));
    }

    @Transactional
    public Result<?> withdraw(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!user.getId().equals(request.getUserId())) return Result.error("只能撤回自己的申领");
        if (!"PENDING".equals(request.getStatus()) && !"FIRST_OK".equals(request.getStatus()))
            return Result.error("当前状态不可撤回");
        requestMapper.updateStatus(id, "DRAFT");
        // 释放预占库存
        List<MaterialRequestLine> withdrawLines = requestLineMapper.selectByRequestId(id);
        for (MaterialRequestLine line : withdrawLines) {
            MaterialItem item = itemMapper.selectById(line.getItemId());
            if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                itemMapper.releaseLock(line.getItemId(), line.getQty());
            }
        }
        logOp("REQUEST", id, "WITHDRAW", null);
        return Result.success(null);
    }

    @Transactional
    public Result<?> confirmReceive(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!user.getId().equals(request.getUserId())) return Result.error("只能确认自己的申领");
        if (!"FULFILLED".equals(request.getStatus())) return Result.error("当前状态不可确认");
        requestMapper.updateReceived(id);
        logOp("REQUEST", id, "RECEIVE", null);
        return Result.success(null);
    }

    // ==================== 审核 ====================

    public Result<List<MaterialRequestView>> listPendingForReview(User reviewer) {
        List<MaterialRequest> pending = requestMapper.selectPendingByReviewer(reviewer.getId());
        List<MaterialRequestView> views = pending.stream()
                .filter(r -> canReview(r, reviewer))
                .map(this::toRequestView)
                .collect(Collectors.toList());
        return Result.success(views);
    }

    private boolean canReview(MaterialRequest request, User reviewer) {
        if (reviewer.getRole() == null) return false;
        if ("STUDENT".equals(reviewer.getRole().name())) return false;
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        if (lines.isEmpty()) return false;
        MaterialItem item = itemMapper.selectById(lines.get(0).getItemId());
        if (item == null) return false;
        if ("SIMPLE".equals(request.getWorkflowType()) || "PENDING".equals(request.getStatus())) {
            return isInReviewerList(item.getReviewerIds(), reviewer.getId());
        } else if ("FIRST_OK".equals(request.getStatus())) {
            return isInReviewerList(item.getSecondReviewerIds(), reviewer.getId());
        }
        return false;
    }

    private boolean isInReviewerList(String reviewerIdsJson, String userId) {
        if (reviewerIdsJson == null || reviewerIdsJson.isBlank()) return true;
        try {
            List<String> ids = objectMapper.readValue(reviewerIdsJson, new TypeReference<List<String>>() {});
            return ids.contains(userId);
        } catch (Exception e) {
            return true;
        }
    }

    @Transactional
    public Result<MaterialRequestView> approve(User reviewer, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!canReview(request, reviewer)) return Result.error("无权审核此申领单");
        boolean finalApproved = false;
        if ("SIMPLE".equals(request.getWorkflowType())) {
            requestMapper.updateReview(id, reviewer.getId(), "APPROVED");
            logOp("REQUEST", id, "APPROVE", Map.of("reviewer", reviewer.getId()));
            finalApproved = true;
        } else if ("DUAL_REVIEW".equals(request.getWorkflowType())) {
            if ("PENDING".equals(request.getStatus())) {
                requestMapper.updateReview(id, reviewer.getId(), "FIRST_OK");
                logOp("REQUEST", id, "FIRST_OK", Map.of("reviewer", reviewer.getId()));
            } else if ("FIRST_OK".equals(request.getStatus())) {
                requestMapper.updateReview(id, reviewer.getId(), "APPROVED");
                logOp("REQUEST", id, "APPROVE", Map.of("reviewer", reviewer.getId()));
                finalApproved = true;
            }
        }
        if (finalApproved) {
            // 确认扣减锁定库存
            List<MaterialRequestLine> approveLines = requestLineMapper.selectByRequestId(id);
            for (MaterialRequestLine line : approveLines) {
                MaterialItem item = itemMapper.selectById(line.getItemId());
                if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                    itemMapper.applyLock(line.getItemId(), line.getQty());
                }
            }
            publishMaterialEvent("APPROVED", id, reviewer.getId(), request.getUserId(), "审核已通过，等待出库");
        }
        return Result.success(toRequestView(requestMapper.selectById(id)));
    }

    @Transactional
    public Result<?> reject(User reviewer, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!canReview(request, reviewer)) return Result.error("无权审核此申领单");
        requestMapper.updateStatus(id, "REJECTED");
        // 回退锁定库存
        List<MaterialRequestLine> rejectLines = requestLineMapper.selectByRequestId(id);
        for (MaterialRequestLine line : rejectLines) {
            MaterialItem item = itemMapper.selectById(line.getItemId());
            if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                itemMapper.releaseLock(line.getItemId(), line.getQty());
            }
        }
        logOp("REQUEST", id, "REJECT", Map.of("reviewer", reviewer.getId()));
        publishMaterialEvent("COMPLETED", id, reviewer.getId(), request.getUserId(), "审核已拒绝");
        return Result.success(null);
    }

    @Transactional
    public Result<MaterialRequestView> fulfill(User operator, String id, FulfillMaterialRequestReq req) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!"APPROVED".equals(request.getStatus())) return Result.error("当前状态不可出库");
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(id);
        for (var fl : req.getLines()) {
            if (Boolean.TRUE.equals(fl.getGrant())) {
                int qty = fl.getFulfillQty() != null ? fl.getFulfillQty() : 0;
                MaterialRequestLine line = lines.stream().filter(l -> l.getId().equals(fl.getLineId())).findFirst().orElse(null);
                if (line == null) continue;
                requestLineMapper.updateFulfilledQty(fl.getLineId(), qty);
                MaterialItem item = itemMapper.selectById(line.getItemId());
                if (item != null && "LIMITED".equals(item.getStockMode())) {
                    itemMapper.updateStock(line.getItemId(), -qty);
                    MaterialStockMovement m = new MaterialStockMovement();
                    m.setItemId(line.getItemId());
                    m.setMovementType("OUTBOUND");
                    m.setQty(-qty);
                    m.setStockAfter((item.getStockQty() != null ? item.getStockQty() : 0) - qty);
                    m.setRequestId(id);
                    m.setRequestLineId(line.getId());
                    m.setOperatorUserId(operator.getId());
                    m.setApplicantUserId(request.getUserId());
                    m.setRemark("申领出库");
                    stockMovementMapper.insert(m);
                }
            }
        }
        requestMapper.updateFulfill(id, operator.getId());
        logOp("REQUEST", id, "FULFILL", Map.of("operator", operator.getId()));
        publishMaterialEvent("COMPLETED", id, operator.getId(), request.getUserId(),
                "已出库 " + req.getLines().stream().filter(l -> Boolean.TRUE.equals(l.getGrant())).count() + " 类物资");
        return Result.success(toRequestView(requestMapper.selectById(id)));
    }

    // ==================== 申领单回收站 ====================

    public Result<?> softDeleteRequest(User operator, String id) {
        MaterialRequest req = requestMapper.selectById(id);
        if (req == null) return Result.error("申领单不存在");
        // 未完成的申领需释放锁定库存
        if ("PENDING".equals(req.getStatus()) || "FIRST_OK".equals(req.getStatus())) {
            List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(id);
            for (MaterialRequestLine line : lines) {
                MaterialItem item = itemMapper.selectById(line.getItemId());
                if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                    itemMapper.releaseLock(line.getItemId(), line.getQty());
                }
            }
        }
        requestMapper.softDelete(id, operator != null ? operator.getId() : null, java.time.LocalDateTime.now().plusDays(7));
        logOp("REQUEST", id, "DELETE", null);
        return Result.success(null);
    }

    public Result<Map<String, Object>> listRequestRecycle(int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> rows = requestMapper.selectRecycle(offset, size);
        int total = requestMapper.countRecycle();
        Map<String, Object> result = new HashMap<>();
        result.put("data", rows.stream().map(this::toRequestView).collect(Collectors.toList()));
        result.put("total", total);
        return Result.success(result);
    }

    public Result<?> restoreRequest(String id) {
        requestMapper.restoreById(id);
        return Result.success(null);
    }

    public Result<?> purgeRequest(String id) {
        requestMapper.hardDeleteById(id);
        return Result.success(null);
    }

    public Result<?> purgeRequests(List<String> ids) {
        for (String id : ids) requestMapper.hardDeleteById(id);
        return Result.success(Map.of("deleted", ids.size()));
    }

    public Result<?> purgeAllRequests() {
        List<MaterialRequest> all = requestMapper.selectRecycle(0, 5000);
        int count = 0;
        for (MaterialRequest r : all) { requestMapper.hardDeleteById(r.getId()); count++; }
        return Result.success(Map.of("deleted", count));
    }

    // ==================== 统计审计 ====================

    /**
     * 统计概览：总申领数 + 总出库数 + 按学生聚合 + 按物品聚合。
     * 供统计面板和外部 agent 调用。
     *
     * @param from 起始日期 yyyy-MM-dd
     * @param to   截止日期 yyyy-MM-dd
     */
    public Result<MaterialStatsOverview> getStatsOverview(String from, String to) {
        MaterialStatsOverview overview = new MaterialStatsOverview();
        overview.setByStudent(requestMapper.statsByStudent(from, to));
        overview.setByItem(requestMapper.statsByItem(from, to));
        long totalFulfilled = overview.getByItem().stream()
                .mapToLong(m -> ((Number) m.getOrDefault("total_qty", 0)).longValue()).sum();
        overview.setTotalFulfilledQty(totalFulfilled);
        overview.setTotalRequests(overview.getByStudent().stream()
                .mapToLong(m -> ((Number) m.getOrDefault("total", 0)).longValue()).sum());

        // 通过率
        int approved = requestMapper.countAll("APPROVED") + requestMapper.countAll("FULFILLED") + requestMapper.countAll("RECEIVED");
        int rejected = requestMapper.countAll("REJECTED");
        overview.setRefuseCount((long) rejected);
        overview.setPassRate((approved + rejected) > 0 ? (double) approved / (double) (approved + rejected) : 0.0);

        // 库存预警：数量型物品库存 <= 5
        List<MaterialItem> allItems = itemMapper.selectAll(null);
        List<Map<String, Object>> warnings = new ArrayList<>();
        for (MaterialItem it : allItems) {
            if ("LIMITED".equals(it.getStockMode()) || "QUANTIFIED".equals(it.getStockMode())) {
                int qty = it.getStockQty() != null ? it.getStockQty() : 0;
                if (qty <= 5) {
                    Map<String, Object> w = new HashMap<>();
                    w.put("itemId", it.getId());
                    w.put("name", it.getName());
                    w.put("stockQty", qty);
                    warnings.add(w);
                }
            }
        }
        overview.setStockWarnings(warnings);
        return Result.success(overview);
    }

    /**
     * 审计流水：分页查询，支持按时间区间 + 课题组筛选。
     * 供审计面板和外部 agent 调用。
     *
     * @param from       起始日期 yyyy-MM-dd
     * @param to         截止日期 yyyy-MM-dd
     * @param categoryId 物品分类ID（可选）
     * @param groupId    课题组（可选）
     * @param page       页码
     * @param size       每页条数
     */
    public Result<Map<String, Object>> getAuditTrail(String from, String to, Long categoryId,
                                                      String groupId, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectAuditTrail(from, to, categoryId, groupId, offset, size);
        int total = requestMapper.countAuditTrail(from, to, categoryId, groupId);
        List<MaterialAuditTrailView> views = new ArrayList<>();
        for (MaterialRequest req : requests) {
            List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(req.getId());
            for (MaterialRequestLine line : lines) {
                MaterialAuditTrailView v = new MaterialAuditTrailView();
                v.setRequestId(req.getId());
                v.setUserId(req.getUserId());
                v.setApplicantName(req.getApplicantName());
                v.setApplicantGroup(req.getApplicantGroup());
                v.setStatus(req.getStatus());
                v.setItemName(line.getSnapshotName());
                v.setQty(line.getQty());
                v.setFulfilledQty(line.getFulfilledQty());
                v.setCreatedAt(req.getCreatedAt() != null ? req.getCreatedAt().toString() : null);
                v.setFulfilledAt(req.getFulfilledAt() != null ? req.getFulfilledAt().toString() : null);
                v.setFulfilledBy(req.getFulfilledBy());
                v.setFirstReviewerId(req.getFirstReviewerId());
                v.setSecondReviewerId(req.getSecondReviewerId());
                v.setFirstReviewTime(req.getFirstReviewTime() != null ? req.getFirstReviewTime().toString() : null);
                v.setSecondReviewTime(req.getSecondReviewTime() != null ? req.getSecondReviewTime().toString() : null);
                views.add(v);
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return Result.success(result);
    }

    // ==================== 内部辅助 ====================

    private MaterialCategoryView toCategoryView(MaterialCategory c) {
        MaterialCategoryView v = new MaterialCategoryView();
        v.setId(c.getId());
        v.setName(c.getName());
        v.setSortOrder(c.getSortOrder());
        v.setStatus(c.getStatus());
        return v;
    }

    private MaterialItemView toItemView(MaterialItem item) {
        MaterialItemView v = new MaterialItemView();
        v.setId(item.getId());
        v.setCategoryId(item.getCategoryId());
        v.setName(item.getName());
        v.setSubtitle(item.getSubtitle());
        v.setCoverUrl(item.getCoverUrl());
        v.setShelfStatus(item.getShelfStatus());
        v.setStockMode(item.getStockMode());
        v.setStockQty(item.getStockQty());
        v.setLockedQty(item.getLockedQty() != null ? item.getLockedQty() : 0);
        v.setShowStockQty(item.getShowStockQty() != null ? item.getShowStockQty() : 1);
        v.setWorkflowType(item.getWorkflowType());
        v.setReviewerIds(item.getReviewerIds());
        v.setSecondReviewerIds(item.getSecondReviewerIds());
        if (item.getCreatedAt() != null) v.setCreatedAt(item.getCreatedAt().toString());
        if (item.getLastInboundAt() != null) v.setLastInboundAt(item.getLastInboundAt().toString());
        return v;
    }

    private MaterialRequestView toRequestView(MaterialRequest request) {
        MaterialRequestView v = new MaterialRequestView();
        v.setId(request.getId());
        v.setUserId(request.getUserId());
        v.setApplicantName(request.getApplicantName());
        v.setApplicantGroup(request.getApplicantGroup());
        v.setStatus(request.getStatus());
        v.setWorkflowType(request.getWorkflowType());
        v.setFirstReviewerId(request.getFirstReviewerId());
        v.setSecondReviewerId(request.getSecondReviewerId());
        if (request.getFirstReviewTime() != null) v.setFirstReviewTime(request.getFirstReviewTime().toString());
        if (request.getSecondReviewTime() != null) v.setSecondReviewTime(request.getSecondReviewTime().toString());
        if (request.getFulfilledAt() != null) v.setFulfilledAt(request.getFulfilledAt().toString());
        v.setFulfilledBy(request.getFulfilledBy());
        if (request.getReceivedAt() != null) v.setReceivedAt(request.getReceivedAt().toString());
        if (request.getCreatedAt() != null) v.setCreatedAt(request.getCreatedAt().toString());
        if (request.getUpdatedAt() != null) v.setUpdatedAt(request.getUpdatedAt().toString());
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        v.setLines(lines.stream().map(l -> {
            MaterialRequestLineView lv = new MaterialRequestLineView();
            lv.setId(l.getId());
            lv.setItemId(l.getItemId());
            lv.setQty(l.getQty());
            lv.setSnapshotName(l.getSnapshotName());
            lv.setFulfilledQty(l.getFulfilledQty());
            return lv;
        }).collect(Collectors.toList()));
        return v;
    }

    private void publishMaterialEvent(String eventType, String requestId, String senderId, String applicantId, String summary) {
        try {
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType(eventType);
            event.setBizType("MATERIAL_REQUEST");
            event.setBizId(requestId);
            event.setSenderId(senderId);
            event.setApplicantId(applicantId);
            Map<String, String> vars = new HashMap<>();
            vars.put("requestId", requestId);
            vars.put("bizId", requestId);
            vars.put("summary", summary);
            // 解析显示名：优先人员库姓名 → displayNickname → username
            vars.put("applicantName", userDisplayNameService.resolveDisplayName(applicantId));
            if (senderId != null) {
                vars.put("senderName", userDisplayNameService.resolveDisplayName(senderId));
            }
            event.setVariables(vars);
            notificationService.publish(event);
        } catch (Exception e) {
            log.warn("发布物资申领通知失败: {}", e.getMessage());
        }
    }

    private void logOp(String targetType, String targetId, String action, Object detail) {
        try {
            MaterialOperationLog ol = new MaterialOperationLog();
            ol.setTargetType(targetType);
            ol.setTargetId(targetId);
            ol.setAction(action);
            ol.setDetail(detail != null ? objectMapper.writeValueAsString(detail) : null);
            operationLogMapper.insert(ol);
        } catch (Exception e) {
            MaterialService.log.warn("记录操作日志失败: {}", e.getMessage());
        }
    }
}

package com.example.demo.modules.material.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import com.example.demo.modules.material.dto.*;
import com.example.demo.modules.material.entity.*;
import com.example.demo.modules.material.mapper.*;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class MaterialService {
    private static final Logger log = LoggerFactory.getLogger(MaterialService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    /** 独立成单：一次提交中最多允许拆出的独立申领单数量（防滥用） */
    private static final int MAX_INDEPENDENT_SPLITS = 10;

    private final MaterialCategoryMapper categoryMapper;
    private final MaterialItemMapper itemMapper;
    private final MaterialCartMapper cartMapper;
    private final MaterialRequestMapper requestMapper;
    private final MaterialRequestLineMapper requestLineMapper;
    private final MaterialStockMovementMapper stockMovementMapper;
    private final MaterialOperationLogMapper operationLogMapper;
    private final NotificationService notificationService;
    private final UserDisplayNameService userDisplayNameService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final UserMapper userMapper;

    @Autowired
    @Lazy
    private MaterialAutoApproveService autoApproveService;

    private final PushService pushService;

    public MaterialService(MaterialCategoryMapper categoryMapper, MaterialItemMapper itemMapper,
                           MaterialCartMapper cartMapper, MaterialRequestMapper requestMapper,
                           MaterialRequestLineMapper requestLineMapper,
                           MaterialStockMovementMapper stockMovementMapper,
                           MaterialOperationLogMapper operationLogMapper,
                           NotificationService notificationService,
                           UserDisplayNameService userDisplayNameService,
                           AroPersonnelMapper aroPersonnelMapper,
                           UserMapper userMapper,
                           PushService pushService) {
        this.categoryMapper = categoryMapper;
        this.itemMapper = itemMapper;
        this.cartMapper = cartMapper;
        this.requestMapper = requestMapper;
        this.requestLineMapper = requestLineMapper;
        this.stockMovementMapper = stockMovementMapper;
        this.operationLogMapper = operationLogMapper;
        this.notificationService = notificationService;
        this.userDisplayNameService = userDisplayNameService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.userMapper = userMapper;
        this.pushService = pushService;
    }

    // ==================== 分类 ====================

    public List<MaterialCategoryView> listCategoriesForStudent() {
        return categoryMapper.selectEnabled().stream().map(this::toCategoryView).collect(Collectors.toList());
    }

    public List<MaterialCategoryView> listCategoriesForAdmin(String applicantGroup) {
        List<MaterialCategory> categories;
        if (org.springframework.util.StringUtils.hasText(applicantGroup)) {
            categories = categoryMapper.selectByApplicantGroup(applicantGroup);
        } else {
            categories = categoryMapper.selectAll();
        }
        return categories.stream().map(this::toCategoryView).collect(Collectors.toList());
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

    public List<MaterialItemView> listItemsForAdmin(Long categoryId, String applicantGroup) {
        List<MaterialItem> items;
        if (org.springframework.util.StringUtils.hasText(applicantGroup)) {
            items = itemMapper.selectByApplicantGroup(categoryId, applicantGroup);
        } else {
            items = itemMapper.selectAll(categoryId);
        }
        return items.stream().map(this::toItemView).collect(Collectors.toList());
    }

    public Result<MaterialItemView> getItem(Long id) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        return Result.success(toItemView(item));
    }

    @Transactional
    public Result<MaterialItemView> createItem(MaterialItemUpsertReq req) {
        String workflow = req.getWorkflowType() != null ? req.getWorkflowType() : "SIMPLE";
        Result<?> reviewerCheck = validateItemReviewers(workflow, req.getReviewerIds(), req.getSecondReviewerIds());
        if (!Boolean.TRUE.equals(reviewerCheck.getSuccess())) {
            return Result.error(reviewerCheck.getMessage());
        }
        MaterialItem item = new MaterialItem();
        item.setCategoryId(req.getCategoryId());
        item.setName(req.getName());
        item.setSubtitle(req.getSubtitle());
        item.setCoverUrl(req.getCoverUrl());
        item.setShelfStatus(req.getShelfStatus() != null ? req.getShelfStatus() : "DRAFT");
        item.setStockMode(req.getStockMode() != null ? req.getStockMode() : "LIMITED");
        int initQty = req.getStockQty() != null ? req.getStockQty() : 0;
        item.setStockQty(initQty);
        item.setShowStockQty(req.getShowStockQty() != null ? req.getShowStockQty() : 1);
        item.setWorkflowType(req.getWorkflowType() != null ? req.getWorkflowType() : "SIMPLE");
        item.setReviewerIds(req.getReviewerIds());
        item.setSecondReviewerIds(req.getSecondReviewerIds());
        item.setSpecSchema(req.getSpecSchema() != null && !req.getSpecSchema().isBlank() ? req.getSpecSchema() : null);
        item.setSpecRequired(req.getSpecRequired() != null ? req.getSpecRequired() : 0);
        item.setIndependentOrder(req.getIndependentOrder() != null ? req.getIndependentOrder() : 0);
        itemMapper.insert(item);
        // 初始入库创建库存流水
        if (initQty > 0) {
            MaterialStockMovement m = new MaterialStockMovement();
            m.setItemId(item.getId());
            m.setMovementType("INBOUND");
            m.setQty(initQty);
            m.setStockAfter(initQty);
            m.setRemark("初始入库");
            stockMovementMapper.insert(m);
        }
        logOp("ITEM", String.valueOf(item.getId()), "CREATE", null);
        return Result.success(toItemView(itemMapper.selectById(item.getId())));
    }

    @Transactional
    public Result<MaterialItemView> updateItem(Long id, MaterialItemUpsertReq req) {
        MaterialItem item = itemMapper.selectById(id);
        if (item == null) return Result.error("物品不存在");
        String workflow = req.getWorkflowType() != null ? req.getWorkflowType() : item.getWorkflowType();
        String reviewerIds = req.getReviewerIds() != null ? req.getReviewerIds() : item.getReviewerIds();
        String secondIds = req.getSecondReviewerIds() != null ? req.getSecondReviewerIds() : item.getSecondReviewerIds();
        Result<?> reviewerCheck = validateItemReviewers(workflow, reviewerIds, secondIds);
        if (!Boolean.TRUE.equals(reviewerCheck.getSuccess())) {
            return Result.error(reviewerCheck.getMessage());
        }
        if (req.getCategoryId() != null) item.setCategoryId(req.getCategoryId());
        if (req.getName() != null) item.setName(req.getName());
        if (req.getSubtitle() != null) item.setSubtitle(req.getSubtitle());
        if (req.getCoverUrl() != null) item.setCoverUrl(req.getCoverUrl().isEmpty() ? null : req.getCoverUrl());
        if (req.getShelfStatus() != null) item.setShelfStatus(req.getShelfStatus());
        if (req.getStockMode() != null) item.setStockMode(req.getStockMode());
        if (req.getWorkflowType() != null) item.setWorkflowType(req.getWorkflowType());
        if (req.getReviewerIds() != null) item.setReviewerIds(req.getReviewerIds());
        if (req.getSecondReviewerIds() != null) item.setSecondReviewerIds(req.getSecondReviewerIds());
        if (req.getShowStockQty() != null) item.setShowStockQty(req.getShowStockQty());
        if (req.getSpecSchema() != null) item.setSpecSchema(req.getSpecSchema().isBlank() ? null : req.getSpecSchema());
        if (req.getSpecRequired() != null) item.setSpecRequired(req.getSpecRequired());
        if (req.getIndependentOrder() != null) item.setIndependentOrder(req.getIndependentOrder());
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

    private void cascadePurgeItem(Long itemId) {
        // 1. 删除关联库存流水
        stockMovementMapper.deleteByItemId(itemId);
        // 2. 找到引用此物品的申领单
        List<String> requestIds = requestLineMapper.selectRequestIdsByItemId(itemId);
        // 3. 删除这些申领单的物品行
        requestLineMapper.deleteByItemId(itemId);
        // 4. 如果申领单已无行，则删除申领单本身
        for (String rid : requestIds) {
            List<MaterialRequestLine> remaining = requestLineMapper.selectByRequestId(rid);
            if (remaining.isEmpty()) {
                requestMapper.hardDeleteById(rid);
                Map<String, Object> detail = new HashMap<>();
                detail.put("reason", "item_purged");
                detail.put("itemId", itemId);
                logOp("REQUEST", rid, "PURGE_CASCADE", detail);
            }
        }
        // 5. 删除物品
        itemMapper.purge(itemId);
        logOp("ITEM", String.valueOf(itemId), "PURGE", null);
    }

    public Result<?> purgeItem(Long id) {
        cascadePurgeItem(id);
        return Result.success(null);
    }

    public Result<?> purgeItems(List<Long> ids) {
        for (Long id : ids) cascadePurgeItem(id);
        return Result.success(Map.of("deleted", ids.size()));
    }

    public Result<?> purgeAllItems() {
        List<MaterialItem> all = itemMapper.selectRecycle(0, 10000);
        for (MaterialItem it : all) cascadePurgeItem(it.getId());
        return Result.success(Map.of("deleted", all.size()));
    }

    /** 清理所有孤立数据：库存流水 + 申领行（物品已删除但相关记录残留） */
    public Result<Map<String, Object>> purgeOrphanMovements() {
        int m = stockMovementMapper.deleteOrphan();
        int l = requestLineMapper.deleteOrphan();
        int r = requestMapper.deleteEmptyRequests();
        Map<String, Object> res = new HashMap<>();
        res.put("orphanMovements", m);
        res.put("orphanLines", l);
        res.put("emptyRequests", r);
        return Result.success(res);
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
    public Result<List<MaterialRequestView>> createRequest(User user, CreateMaterialRequestReq req) {
        if (req.getLines() == null || req.getLines().isEmpty()) return Result.error("申领物品不能为空");

        // 按审核流程 + 审核人（及双审复审人）分组，不同审核人生成独立申领单；物品缓存供后续校验与写入复用
        Map<Long, MaterialItem> itemById = new LinkedHashMap<>();
        Result<Map<String, List<CreateMaterialRequestReq.LineItem>>> groupedRes = groupRequestLines(req.getLines(), itemById);
        if (!Boolean.TRUE.equals(groupedRes.getSuccess())) {
            return Result.error(groupedRes.getMessage());
        }
        Map<String, List<CreateMaterialRequestReq.LineItem>> grouped = groupedRes.getData();
        long independentGroupCount = grouped.keySet().stream().filter(k -> k.contains("|IND:")).count();
        if (independentGroupCount > MAX_INDEPENDENT_SPLITS) {
            return Result.error("独立下单物资最多 " + MAX_INDEPENDENT_SPLITS + " 种，请分批提交");
        }

        // 预校验：所有分组全部通过后才开始写库，避免前面分组已入库（含免审自动出库）而后续分组校验失败造成部分提交
        Result<?> preCheck = preValidateGroupedLines(grouped, itemById);
        if (!Boolean.TRUE.equals(preCheck.getSuccess())) {
            return Result.error(preCheck.getMessage());
        }

        String applicantName = userDisplayNameService.resolveDisplayName(user.getId());
        String applicantGroup = resolveApplicantGroup(user.getId(), req.getApplicantGroup());
        return Result.success(insertGroupedRequests(user, grouped, itemById, applicantName, applicantGroup));
    }

    /**
     * 合并新明细到本人待审申领单：与目标单同审核组的行并入（同物品同规格数量累加），
     * 其余分组走正常建单流程自动另立新单。全部校验通过后才写库，事务内任一失败整体回滚。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<List<MaterialRequestView>> mergeIntoRequest(User user, String requestId, CreateMaterialRequestReq req) {
        if (req == null || req.getLines() == null || req.getLines().isEmpty()) return Result.error("申领物品不能为空");
        // FOR UPDATE 锁定目标单行：并发 approve/reject 会被挡在行锁后，或先提交后被下方
        // PENDING 校验/条件更新拦下，避免把刚审结的单拉回 PENDING（丢失更新 → 负锁定/重复出库）
        MaterialRequest target = requestMapper.selectByIdForUpdate(requestId);
        if (target == null || (target.getDeleted() != null && target.getDeleted() == 1)) {
            return Result.error("申领单不存在");
        }
        if (user == null || user.getId() == null || !user.getId().equals(target.getUserId())) {
            return Result.error("仅本人待审申领单可合并");
        }
        if (!"PENDING".equals(target.getStatus())) {
            return Result.error("仅待审核状态的申领单可合并");
        }

        // 目标单分组键：由现有明细行物品重建（一单一组，按建单口径）
        List<MaterialRequestLine> targetLines = requestLineMapper.selectByRequestId(target.getId());
        if (targetLines.isEmpty()) {
            return Result.error("目标申领单数据异常");
        }
        MaterialItem targetItem = itemMapper.selectById(targetLines.get(0).getItemId());
        if (targetItem == null) {
            return Result.error("目标申领单数据异常");
        }
        String targetKey = requestGroupKeyWithIndependent(targetItem);
        // 提交后管理员可能改过物品配置：逐行重建分组键，任一行与首行不一致即视为配置漂移，
        // 拒绝合并（最坏情况：漂移成 SKIP_REVIEW 的键会让合并后的目标单无人可审）
        for (MaterialRequestLine tl : targetLines) {
            MaterialItem lineItem = itemMapper.selectById(tl.getItemId());
            if (lineItem == null || !targetKey.equals(requestGroupKeyWithIndependent(lineItem))) {
                return Result.error("目标申领单包含配置已变更的物资，无法合并，请直接新建申领单");
            }
        }
        // 目标键的流程段漂移为免审：PENDING 单挂着 SKIP_REVIEW 键同属配置漂移，同样拒绝
        String targetWorkflowSegment = targetKey.contains("|")
                ? targetKey.substring(0, targetKey.indexOf('|')) : targetKey;
        if ("SKIP_REVIEW".equals(targetWorkflowSegment)) {
            return Result.error("目标申领单包含配置已变更的物资，无法合并，请直接新建申领单");
        }

        Map<Long, MaterialItem> itemById = new LinkedHashMap<>();
        Result<Map<String, List<CreateMaterialRequestReq.LineItem>>> groupedRes = groupRequestLines(req.getLines(), itemById);
        if (!Boolean.TRUE.equals(groupedRes.getSuccess())) {
            return Result.error(groupedRes.getMessage());
        }
        Map<String, List<CreateMaterialRequestReq.LineItem>> grouped = groupedRes.getData();

        // 拆分：同审核组并入目标单，其余自动另立新单
        List<CreateMaterialRequestReq.LineItem> matching = grouped.remove(targetKey);
        Map<String, List<CreateMaterialRequestReq.LineItem>> others = grouped;
        long independentGroupCount = others.keySet().stream().filter(k -> k.contains("|IND:")).count();
        if (independentGroupCount > MAX_INDEPENDENT_SPLITS) {
            return Result.error("独立下单物资最多 " + MAX_INDEPENDENT_SPLITS + " 种，请分批提交");
        }

        // 预校验全部分组（含并入组），通过后才写库
        Map<String, List<CreateMaterialRequestReq.LineItem>> allGroups = new LinkedHashMap<>(others);
        if (matching != null && !matching.isEmpty()) {
            allGroups.put(targetKey, matching);
        }
        Result<?> preCheck = preValidateGroupedLines(allGroups, itemById);
        if (!Boolean.TRUE.equals(preCheck.getSuccess())) {
            return Result.error(preCheck.getMessage());
        }

        int mergedLineCount = 0;
        if (matching != null && !matching.isEmpty()) {
            mergedLineCount = mergeLinesIntoTarget(target, targetLines, matching, itemById);
        }

        List<MaterialRequestView> results = new ArrayList<>();
        results.add(toRequestView(requestMapper.selectById(target.getId())));
        if (!others.isEmpty()) {
            String applicantName = userDisplayNameService.resolveDisplayName(user.getId());
            String applicantGroup = resolveApplicantGroup(user.getId(), req.getApplicantGroup());
            results.addAll(insertGroupedRequests(user, others, itemById, applicantName, applicantGroup));
        }
        Map<String, Object> detail = new HashMap<>();
        detail.put("mergedLines", mergedLineCount);
        detail.put("spawnedGroups", others.size());
        logOp("REQUEST", target.getId(), "REQUEST_MERGE", detail);
        return Result.success(results);
    }

    /** 将同组新明细并入目标单：同（物品+规格）行数量累加，否则新增行；新增数量按建单口径预占库存 */
    private int mergeLinesIntoTarget(MaterialRequest target, List<MaterialRequestLine> targetLines,
                                     List<CreateMaterialRequestReq.LineItem> incoming,
                                     Map<Long, MaterialItem> itemById) {
        Map<String, Integer> addedQtyByKey = new LinkedHashMap<>();
        Map<String, CreateMaterialRequestReq.LineItem> sampleByKey = new LinkedHashMap<>();
        for (var lr : incoming) {
            String key = lineMergeKey(lr.getItemId(), lr.getSpecSnapshot());
            addedQtyByKey.merge(key, lr.getQty() != null ? lr.getQty() : 0, Integer::sum);
            sampleByKey.putIfAbsent(key, lr);
        }
        Map<String, MaterialRequestLine> existingByKey = new LinkedHashMap<>();
        for (MaterialRequestLine line : targetLines) {
            existingByKey.putIfAbsent(lineMergeKey(line.getItemId(), line.getSpecSnapshot()), line);
        }
        List<MaterialRequestLine> toInsert = new ArrayList<>();
        int mergedCount = 0;
        for (var e : addedQtyByKey.entrySet()) {
            int added = e.getValue();
            if (added <= 0) continue;
            CreateMaterialRequestReq.LineItem sample = sampleByKey.get(e.getKey());
            MaterialRequestLine existing = existingByKey.get(e.getKey());
            if (existing != null) {
                int newQty = (existing.getQty() != null ? existing.getQty() : 0) + added;
                requestLineMapper.updateQty(existing.getId(), newQty);
            } else {
                MaterialItem item = itemById.get(sample.getItemId());
                MaterialRequestLine line = new MaterialRequestLine();
                line.setRequestId(target.getId());
                line.setItemId(sample.getItemId());
                line.setQty(added);
                line.setSnapshotName(item != null ? item.getName() : "未知物品");
                line.setFulfilledQty(0);
                // 落库存规范化后的规格快照，保证后续合并键比较口径一致
                line.setSpecSnapshot(canonicalizeSpecSnapshot(sample.getSpecSnapshot()));
                toInsert.add(line);
            }
            mergedCount++;
            // 预占新增数量库存（与建单一致：库存不足时按剩余库存部分锁定）
            MaterialItem stockItem = itemMapper.selectById(sample.getItemId());
            if (stockItem != null && ("LIMITED".equals(stockItem.getStockMode()) || "QUANTIFIED".equals(stockItem.getStockMode()))) {
                int lockQty = Math.min(added, stockItem.getStockQty() != null ? stockItem.getStockQty() : 0);
                if (lockQty > 0) itemMapper.lockStock(sample.getItemId(), lockQty);
            }
        }
        if (!toInsert.isEmpty()) {
            requestLineMapper.insertBatch(toInsert);
        }
        // 状态不变，仅刷新 updated_at；带 status='PENDING' 条件守卫：若并发 approve/reject 抢先
        // 改了状态，0 行更新 → 抛异常整体回滚，绝不把已审结单拉回 PENDING
        int touched = requestMapper.touchUpdatedAtIfPending(target.getId(), LocalDateTime.now());
        if (touched == 0) {
            throw new TwinBusinessException(ErrorCodeConstants.MATERIAL_MERGE_STATUS_CONFLICT,
                    "申领单状态已变更，合并失败，请刷新后重试");
        }
        return mergedCount;
    }

    /**
     * 明细合并键：物品 + 规格快照（空白规格视为同一变体）。
     * 规格快照先规范化（键排序）再比较：Web 按 schema 维度顺序、小程序按键序序列化，
     * 双方（新提交行与库中已存行）都经此方法取键，历史非规范化存量也能在比较时对齐。
     */
    private static String lineMergeKey(Long itemId, String specSnapshot) {
        String spec = specSnapshot != null && !specSnapshot.isBlank() ? canonicalizeSpecSnapshot(specSnapshot) : "";
        return itemId + "||" + spec;
    }

    /**
     * 规格快照规范化：JSON 对象按键名字典序重排后重新序列化；解析失败退回 trim 后原文。
     */
    private static String canonicalizeSpecSnapshot(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return trimmed;
        try {
            Map<String, Object> parsed = objectMapper.readValue(trimmed, new TypeReference<Map<String, Object>>() {});
            return objectMapper.writeValueAsString(new TreeMap<>(parsed));
        } catch (Exception e) {
            return trimmed;
        }
    }

    /** 分组键（含独立成单后缀），与建单/合并共用口径 */
    private String requestGroupKeyWithIndependent(MaterialItem item) {
        String groupKey = materialRequestGroupKey(item);
        // 独立成单：independentOrder=1 的物品不与其他物品混单，按物品各自成组
        if (item != null && item.getIndependentOrder() != null && item.getIndependentOrder() == 1) {
            groupKey = groupKey + "|IND:" + item.getId();
        }
        return groupKey;
    }

    /** 按审核流程 + 审核人分组（独立成单物品单独成组）；校验物品存在，itemById 缓存供后续复用 */
    private Result<Map<String, List<CreateMaterialRequestReq.LineItem>>> groupRequestLines(
            List<CreateMaterialRequestReq.LineItem> lines, Map<Long, MaterialItem> itemById) {
        Map<String, List<CreateMaterialRequestReq.LineItem>> grouped = new LinkedHashMap<>();
        for (var lr : lines) {
            if (lr == null || lr.getItemId() == null || lr.getQty() == null || lr.getQty() <= 0) {
                return Result.error("申领行参数无效");
            }
            MaterialItem item = itemById.get(lr.getItemId());
            if (item == null) {
                item = itemMapper.selectById(lr.getItemId());
                if (item == null) return Result.error("物品不存在: " + lr.getItemId());
                itemById.put(lr.getItemId(), item);
            }
            grouped.computeIfAbsent(requestGroupKeyWithIndependent(item), k -> new ArrayList<>()).add(lr);
        }
        return Result.success(grouped);
    }

    /** 预校验：审核人配置 + 规格必选/格式，全部分组通过后才允许写库 */
    private Result<?> preValidateGroupedLines(Map<String, List<CreateMaterialRequestReq.LineItem>> grouped,
                                              Map<Long, MaterialItem> itemById) {
        for (var entry : grouped.entrySet()) {
            String workflowType = workflowTypeFromGroupKey(entry.getKey(), entry.getValue());
            for (var lineReq : entry.getValue()) {
                MaterialItem item = itemById.get(lineReq.getItemId());
                if (item == null) return Result.error("物品不存在");
                if (!"SKIP_REVIEW".equals(workflowType)) {
                    Result<?> check = validateItemReviewers(workflowType, item.getReviewerIds(),
                            "DUAL_REVIEW".equals(workflowType) ? item.getSecondReviewerIds() : null);
                    if (!Boolean.TRUE.equals(check.getSuccess())) {
                        return Result.error(check.getMessage());
                    }
                }
                // 规格校验
                if (item.getSpecRequired() != null && item.getSpecRequired() == 1) {
                    if (lineReq.getSpecSnapshot() == null || lineReq.getSpecSnapshot().isBlank()) {
                        throw new TwinBusinessException(
                                ErrorCodeConstants.MATERIAL_SPEC_REQUIRED,
                                "该物品需要选择完整规格");
                    }
                }
                if (lineReq.getSpecSnapshot() != null && !lineReq.getSpecSnapshot().isBlank()) {
                    try {
                        objectMapper.readTree(lineReq.getSpecSnapshot());
                    } catch (Exception e) {
                        throw new TwinBusinessException(
                                ErrorCodeConstants.MATERIAL_SPEC_INVALID_JSON,
                                "规格数据格式错误");
                    }
                }
            }
        }
        return Result.success(null);
    }

    /** 按分组写入申领单（含预占库存、免审自动出库、日志、通知、自动审批），返回各单视图 */
    private List<MaterialRequestView> insertGroupedRequests(User user,
                                                            Map<String, List<CreateMaterialRequestReq.LineItem>> grouped,
                                                            Map<Long, MaterialItem> itemById,
                                                            String applicantName, String applicantGroup) {
        List<MaterialRequestView> results = new ArrayList<>();
        long baseTs = System.currentTimeMillis();

        for (var entry : grouped.entrySet()) {
            String groupKey = entry.getKey();
            List<CreateMaterialRequestReq.LineItem> groupLines = entry.getValue();
            String workflowType = workflowTypeFromGroupKey(groupKey, groupLines);
            String id = "MR" + baseTs + String.format("%04d", new Random().nextInt(10000));
            baseTs += 1; // 确保不同组 ID 不重复

            MaterialRequest request = new MaterialRequest();
            request.setId(id);
            request.setUserId(user.getId());
            request.setApplicantName(applicantName);
            request.setApplicantGroup(applicantGroup);
            if ("SKIP_REVIEW".equals(workflowType)) {
                request.setStatus("APPROVED");
            } else {
                request.setStatus("PENDING");
            }
            request.setWorkflowType(workflowType);
            LocalDateTime now = LocalDateTime.now();
            request.setCreatedAt(now);
            request.setUpdatedAt(now);
            requestMapper.insert(request);

            List<MaterialRequestLine> lines = new ArrayList<>();
            for (var lineReq : groupLines) {
                MaterialItem item = itemById.get(lineReq.getItemId());
                MaterialRequestLine line = new MaterialRequestLine();
                line.setRequestId(id);
                line.setItemId(lineReq.getItemId());
                line.setQty(lineReq.getQty());
                line.setSnapshotName(item != null ? item.getName() : "未知物品");
                line.setFulfilledQty(0);
                // 落库存规范化后的规格快照，保证跨端合并键口径一致
                line.setSpecSnapshot(canonicalizeSpecSnapshot(lineReq.getSpecSnapshot()));
                lines.add(line);
            }
            requestLineMapper.insertBatch(lines);

            // 预占库存
            for (var lr : groupLines) {
                MaterialItem item = itemMapper.selectById(lr.getItemId());
                if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                    int lockQty = Math.min(lr.getQty(), item.getStockQty() != null ? item.getStockQty() : 0);
                    if (lockQty > 0) itemMapper.lockStock(lr.getItemId(), lockQty);
                }
            }

            // SKIP_REVIEW: 免审自动出库
            if ("SKIP_REVIEW".equals(workflowType)) {
                List<MaterialRequestLine> allLines = requestLineMapper.selectByRequestId(id);
                for (MaterialRequestLine line : allLines) {
                    MaterialItem item = itemMapper.selectById(line.getItemId());
                    if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                        itemMapper.applyLock(line.getItemId(), line.getQty());
                    }
                }
                requestMapper.updateReview(id, null, "APPROVED", LocalDateTime.now());
                fulfillAllLinesOnApprove(id, null, request);
            }

            logOp("REQUEST", id, "SUBMIT", Map.of("lines", groupLines.size(), "workflow", workflowType, "reviewerGroup", groupKey));
            publishMaterialEvent("CREATED", id, user.getId(), user.getId(), "共 " + groupLines.size() + " 项物资");
        try { pushService.send("MATERIAL_REQUESTED", Map.of("applicantName", userDisplayNameService.resolveDisplayName(user.getId()), "applicantGroup", resolveApplicantGroup(user.getId(), null), "summary", "共 " + groupLines.size() + " 项物资", "bizId", String.valueOf(id), "createdAt", LocalDateTime.now().toString()), resolveReviewerUserIdsForRequest(requestMapper.selectById(id))); } catch (Exception e) { log.warn("[Push] MATERIAL_REQUESTED failed: {}", e.getMessage()); }
            if ("PENDING".equals(requestMapper.selectById(id).getStatus())) {
                try {
                    autoApproveService.tryTrustOnSubmit(id);
                } catch (Exception e) {
                    log.warn("[material-auto] trust on submit skip requestId={}: {}", id, e.getMessage());
                }
            }
            results.add(toRequestView(requestMapper.selectById(id)));
        }
        return results;
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

    public Result<Map<String, Object>> listAll(String status, String applicantUserId, String applicantGroup, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectAll(status, applicantUserId, applicantGroup, offset, size);
        int total = requestMapper.countAll(status, applicantUserId, applicantGroup);
        Map<String, Object> result = new HashMap<>();
        result.put("data", requests.stream().map(this::toRequestView).collect(Collectors.toList()));
        result.put("total", total);
        return Result.success(result);
    }

    /** 已审结申领（物资全部 Tab：不含待审/初审通过） */
    public Result<Map<String, Object>> listFinishedForStaff(String applicantUserId, String applicantGroup, int page, int size) {
        int offset = (page - 1) * size;
        List<MaterialRequest> requests = requestMapper.selectFinished(applicantUserId, applicantGroup, offset, size);
        int total = requestMapper.countFinished(applicantUserId, applicantGroup);
        Map<String, Object> result = new HashMap<>();
        result.put("data", requests.stream().map(this::toRequestView).collect(Collectors.toList()));
        result.put("total", total);
        return Result.success(result);
    }

    /** 非超管仅可见本人有权审核/已参与的申领，避免「物资全部」泄露指定审核单 */
    public Result<Map<String, Object>> listAllVisibleToStaff(User viewer, String status, String applicantUserId,
                                                             String applicantGroup, int page, int size) {
        if (viewer == null) {
            return Result.error("未登录");
        }
        if (isMaterialAuditSuperViewer(viewer)) {
            return listAll(status, applicantUserId, applicantGroup, page, size);
        }
        Result<Map<String, Object>> raw = listAll(status, applicantUserId, applicantGroup, 1, 500);
        if (!Boolean.TRUE.equals(raw.getSuccess()) || raw.getData() == null) {
            return raw;
        }
        @SuppressWarnings("unchecked")
        List<MaterialRequestView> rows = (List<MaterialRequestView>) raw.getData().get("data");
        if (rows == null) {
            rows = List.of();
        }
        List<MaterialRequestView> visible = new ArrayList<>();
        for (MaterialRequestView v : rows) {
            MaterialRequest req = requestMapper.selectById(v.getId());
            if (req != null && canViewRequestAsStaff(req, viewer)) {
                visible.add(v);
            }
        }
        int offset = Math.max(0, (page - 1) * size);
        int end = Math.min(offset + size, visible.size());
        List<MaterialRequestView> pageRows = offset >= visible.size() ? List.of() : visible.subList(offset, end);
        Map<String, Object> result = new HashMap<>();
        result.put("data", pageRows);
        result.put("total", visible.size());
        return Result.success(result);
    }

    private boolean isMaterialAuditSuperViewer(User user) {
        if (user == null || user.getRole() == null) return false;
        return user.getRole().getLevel() >= com.example.demo.common.enums.RoleEnum.SUPER_ADMIN.getLevel();
    }

    private boolean canViewRequestAsStaff(MaterialRequest request, User viewer) {
        if (request == null || viewer == null) return false;
        if ("PENDING".equals(request.getStatus()) || "FIRST_OK".equals(request.getStatus())) {
            return canReview(request, viewer);
        }
        if (canReview(request, viewer)) return true;
        String vid = viewer.getId();
        if (vid != null && vid.equals(request.getFirstReviewerId())) return true;
        if (vid != null && vid.equals(request.getSecondReviewerId())) return true;
        return false;
    }

    public int countPendingForReviewer(User reviewer) {
        if (reviewer == null) return 0;
        Result<List<MaterialRequestView>> res = listPendingForReview(reviewer);
        if (!Boolean.TRUE.equals(res.getSuccess()) || res.getData() == null) return 0;
        return res.getData().size();
    }

    public Result<MaterialRequestView> getRequestDetail(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (user.getRole() != null && "MEMBER".equals(user.getRole().name())) {
            if (!user.getId().equals(request.getUserId())) return Result.error("无权查看");
        }
        return Result.success(toRequestView(request));
    }

    @Transactional
    public Result<?> withdraw(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!user.getId().equals(request.getUserId())) return Result.error("只能撤回自己的申领");
        String status = request.getStatus();
        if (!"PENDING".equals(status) && !"FIRST_OK".equals(status)
            && !"APPROVED".equals(status) && !"FULFILLED".equals(status))
            return Result.error("当前状态不可撤回");
        LocalDateTime now = LocalDateTime.now();
        if ("APPROVED".equals(status) || "FULFILLED".equals(status)) {
            // 已审核通过 → 回退库存、流水、审核状态，相当于学生侧撤销已通过的申领
            List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(id);
            for (MaterialRequestLine line : lines) {
                int qty = line.getFulfilledQty() != null ? line.getFulfilledQty() : 0;
                if (qty <= 0) continue;
                MaterialItem item = itemMapper.selectById(line.getItemId());
                if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                    itemMapper.updateStock(line.getItemId(), qty);
                }
                requestLineMapper.updateFulfilledQty(line.getId(), 0);
                int stockAfter = (item != null && item.getStockQty() != null ? item.getStockQty() : 0) + qty;
                MaterialStockMovement m = new MaterialStockMovement();
                m.setItemId(line.getItemId());
                m.setMovementType("REVOKE_INBOUND");
                m.setQty(qty);
                m.setStockAfter(stockAfter);
                m.setRequestId(id);
                m.setRequestLineId(line.getId());
                m.setOperatorUserId(user.getId());
                m.setApplicantUserId(request.getUserId());
                m.setRemark("学生撤销已通过申领");
                stockMovementMapper.insert(m);
            }
            requestMapper.resetForRevoke(id, now);
            logOp("REQUEST", id, "STUDENT_REVOKE", Map.of("userId", user.getId()));
        } else {
            // 待审/初审通过 → 退回草稿，释放预占库存
            requestMapper.updateStatus(id, "DRAFT", now);
            List<MaterialRequestLine> withdrawLines = requestLineMapper.selectByRequestId(id);
            for (MaterialRequestLine line : withdrawLines) {
                MaterialItem item = itemMapper.selectById(line.getItemId());
                if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                    itemMapper.releaseLock(line.getItemId(), line.getQty());
                }
            }
            logOp("REQUEST", id, "WITHDRAW", null);
        }
        return Result.success(null);
    }

    @Transactional
    public Result<?> confirmReceive(User user, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!user.getId().equals(request.getUserId())) return Result.error("只能确认自己的申领");
        if (!"FULFILLED".equals(request.getStatus())) return Result.error("当前状态不可确认");
        requestMapper.updateReceived(id, LocalDateTime.now());
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

    /** 物品是否显式指定了审核人列表（非空非[]） */
    private boolean hasExplicitReviewers(MaterialRequest request) {
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        if (lines.isEmpty()) return false;
        MaterialItem item = itemMapper.selectById(lines.get(0).getItemId());
        if (item == null) return false;
        String ids = "PENDING".equals(request.getStatus()) || "SIMPLE".equals(request.getWorkflowType())
                ? item.getReviewerIds() : item.getSecondReviewerIds();
        return ids != null && !ids.isBlank() && !"[]".equals(ids.trim());
    }

    /** LocalDateTime → 北京时间墙钟 yyyy-MM-dd HH:mm:ss */
    private static String toDisplayTime(java.time.LocalDateTime dt) {
        return com.example.demo.common.time.WallClockDisplayFormat.fromLocalDateTime(dt);
    }

    private static Map<String, Object> reviewLogDetail(String reviewerId) {
        Map<String, Object> m = new HashMap<>();
        m.put("reviewer", reviewerId);
        return m;
    }

    private boolean canReview(MaterialRequest request, User reviewer) {
        if (reviewer.getRole() == null) return false;
        if ("MEMBER".equals(reviewer.getRole().name())) return false;
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        if (lines.isEmpty()) return false;
        for (MaterialRequestLine line : lines) {
            MaterialItem item = itemMapper.selectById(line.getItemId());
            if (item == null) return false;
            String reviewerIdsJson;
            if ("SIMPLE".equals(request.getWorkflowType()) || "PENDING".equals(request.getStatus())) {
                reviewerIdsJson = item.getReviewerIds();
            } else if ("FIRST_OK".equals(request.getStatus())) {
                reviewerIdsJson = item.getSecondReviewerIds();
            } else {
                return false;
            }
            if (!isInReviewerList(reviewerIdsJson, reviewer)) {
                return false;
            }
        }
        return true;
    }

    /** 不依赖申领单状态，直接比对物品审核人列表（用于撤销等操作） */
    private boolean isItemReviewer(MaterialRequest request, User reviewer) {
        if (reviewer == null || reviewer.getRole() == null || "MEMBER".equals(reviewer.getRole().name())) return false;
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        if (lines.isEmpty()) return false;
        for (MaterialRequestLine line : lines) {
            MaterialItem item = itemMapper.selectById(line.getItemId());
            if (item == null) return false;
            // 检查一级审核人或二级审核人
            if (isInReviewerList(item.getReviewerIds(), reviewer)) return true;
            if (isInReviewerList(item.getSecondReviewerIds(), reviewer)) return true;
        }
        return false;
    }

    /** 供自动审批等模块判断当前审核人是否可处理该单（与 canReview 同源） */
    public boolean canUserReview(User reviewer, String requestId) {
        if (reviewer == null || !StringUtils.hasText(requestId)) return false;
        MaterialRequest request = requestMapper.selectById(requestId.trim());
        return request != null && canReview(request, reviewer);
    }

    /** 申领单首行物品 ID（审核权限与自动审批匹配均以此为准） */
    public Long primaryItemIdForRequest(String requestId) {
        if (!StringUtils.hasText(requestId)) return null;
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(requestId.trim());
        if (lines.isEmpty()) return null;
        return lines.get(0).getItemId();
    }

    private boolean isInReviewerList(String reviewerIdsJson, User reviewer) {
        if (reviewer == null) return false;
        if (reviewerIdsJson == null || reviewerIdsJson.isBlank()) {
            return false;
        }
        if ("[]".equals(reviewerIdsJson.trim())) {
            return false;
        }
        Set<String> configured = normalizeReviewerIdList(reviewerIdsJson);
        if (configured.isEmpty()) {
            return false;
        }
        String canonicalReviewer = canonicalUserId(reviewer);
        if (!StringUtils.hasText(canonicalReviewer)) {
            return false;
        }
        return configured.contains(canonicalReviewer);
    }

    /** 登录账号 → sys_user.id（兼容历史 reviewer_ids 存 username） */
    private String canonicalUserId(User user) {
        if (user == null) return "";
        if (StringUtils.hasText(user.getId())) {
            String byId = resolveCanonicalUserId(user.getId());
            if (StringUtils.hasText(byId)) return byId;
        }
        if (StringUtils.hasText(user.getUsername())) {
            return resolveCanonicalUserId(user.getUsername());
        }
        return "";
    }

    private String resolveCanonicalUserId(String raw) {
        if (!StringUtils.hasText(raw)) return "";
        String trimmed = raw.trim();
        User byId = userMapper.findById(trimmed);
        if (byId != null && StringUtils.hasText(byId.getId())) {
            return byId.getId().trim();
        }
        User byName = userMapper.findByUsername(trimmed);
        if (byName != null && StringUtils.hasText(byName.getId())) {
            return byName.getId().trim();
        }
        return trimmed;
    }

    /** 需审核物品必须配置至少一名有效审核人（免审 SKIP_REVIEW 除外） */
    private Result<?> validateItemReviewers(String workflowType, String reviewerIds, String secondReviewerIds) {
        if ("SKIP_REVIEW".equals(workflowType)) {
            return Result.success(null);
        }
        Set<String> first = normalizeReviewerIdList(reviewerIds);
        if (first.isEmpty()) {
            return Result.error("请至少选择一名审核人");
        }
        if ("DUAL_REVIEW".equals(workflowType)) {
            Set<String> second = normalizeReviewerIdList(secondReviewerIds);
            if (second.isEmpty()) {
                return Result.error("双审流程请至少选择一名复审人");
            }
        }
        return Result.success(null);
    }

    /** 申领分单键：相同流程且相同审核人（双审含复审人）可合并为一单 */
    private String materialRequestGroupKey(MaterialItem item) {
        if (item == null) return "UNKNOWN";
        String wf = item.getWorkflowType() != null ? item.getWorkflowType() : "SIMPLE";
        if ("SKIP_REVIEW".equals(wf)) return "SKIP_REVIEW";
        Set<String> first = normalizeReviewerIdList(item.getReviewerIds());
        String firstKey = first.stream().sorted().collect(Collectors.joining(","));
        if ("DUAL_REVIEW".equals(wf)) {
            Set<String> second = normalizeReviewerIdList(item.getSecondReviewerIds());
            String secondKey = second.stream().sorted().collect(Collectors.joining(","));
            return wf + "|F:" + firstKey + "|S:" + secondKey;
        }
        return wf + "|R:" + firstKey;
    }

    private String workflowTypeFromGroupKey(String groupKey, List<CreateMaterialRequestReq.LineItem> groupLines) {
        if ("SKIP_REVIEW".equals(groupKey)) return "SKIP_REVIEW";
        if (groupKey != null && groupKey.contains("|")) {
            return groupKey.substring(0, groupKey.indexOf('|'));
        }
        if (groupLines != null && !groupLines.isEmpty()) {
            MaterialItem item = itemMapper.selectById(groupLines.get(0).getItemId());
            if (item != null && item.getWorkflowType() != null) return item.getWorkflowType();
        }
        return "SIMPLE";
    }

    /** 解析申领单当前阶段应通知/展示的审核人 sys_user.id */
    private Set<String> resolveReviewerUserIdsForRequest(MaterialRequest request) {
        Set<String> out = new LinkedHashSet<>();
        if (request == null) return out;
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        for (MaterialRequestLine line : lines) {
            MaterialItem item = itemMapper.selectById(line.getItemId());
            if (item == null) continue;
            String json;
            if ("SIMPLE".equals(request.getWorkflowType()) || "PENDING".equals(request.getStatus())) {
                json = item.getReviewerIds();
            } else if ("FIRST_OK".equals(request.getStatus())) {
                json = item.getSecondReviewerIds();
            } else {
                continue;
            }
            out.addAll(normalizeReviewerIdList(json));
        }
        return out;
    }

    private Set<String> normalizeReviewerIdList(String reviewerIdsJson) {
        Set<String> out = new LinkedHashSet<>();
        if (!StringUtils.hasText(reviewerIdsJson) || "[]".equals(reviewerIdsJson.trim())) {
            return out;
        }
        try {
            List<String> ids = objectMapper.readValue(reviewerIdsJson.trim(), new TypeReference<List<String>>() {});
            for (String raw : ids) {
                if (!StringUtils.hasText(raw)) continue;
                User u = userMapper.findById(raw.trim());
                if (u == null) {
                    u = userMapper.findByUsername(raw.trim());
                }
                if (u != null && StringUtils.hasText(u.getId())) {
                    out.add(u.getId().trim());
                } else {
                    out.add(raw.trim());
                }
            }
        } catch (Exception e) {
            log.warn("[material] normalize reviewer ids failed: {}", e.getMessage());
        }
        return out;
    }

    @Transactional
    public Result<MaterialRequestView> approve(User reviewer, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!canReview(request, reviewer)) return Result.error("无权审核此申领单");
        // 审核人：仅在物品指定了审核人名单时才记录操作者ID，否则留空
        String recordReviewerId = hasExplicitReviewers(request) ? reviewer.getId() : null;
        boolean finalApproved = false;
        LocalDateTime reviewTime = LocalDateTime.now();
        if ("SIMPLE".equals(request.getWorkflowType())) {
            requestMapper.updateReview(id, recordReviewerId, "APPROVED", reviewTime);
            logOp("REQUEST", id, "APPROVE", reviewLogDetail(recordReviewerId));
            finalApproved = true;
        } else if ("DUAL_REVIEW".equals(request.getWorkflowType())) {
            if ("PENDING".equals(request.getStatus())) {
                requestMapper.updateReview(id, recordReviewerId, "FIRST_OK", reviewTime);
                logOp("REQUEST", id, "FIRST_OK", reviewLogDetail(recordReviewerId));
            } else if ("FIRST_OK".equals(request.getStatus())) {
                requestMapper.updateReview(id, recordReviewerId, "APPROVED", reviewTime);
                logOp("REQUEST", id, "APPROVE", reviewLogDetail(recordReviewerId));
                finalApproved = true;
            }
        }
        if (finalApproved) {
            // 确认扣减锁定库存并同步出库（审核通过即出库，不再单独确认出库）
            List<MaterialRequestLine> approveLines = requestLineMapper.selectByRequestId(id);
            Set<Long> stockItemIds = new LinkedHashSet<>();
            for (MaterialRequestLine line : approveLines) {
                if (line.getItemId() != null) stockItemIds.add(line.getItemId());
            }
            for (Long stockItemId : stockItemIds) {
                itemMapper.selectByIdForUpdate(stockItemId);
            }
            for (MaterialRequestLine line : approveLines) {
                MaterialItem item = itemMapper.selectById(line.getItemId());
                if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                    itemMapper.applyLock(line.getItemId(), line.getQty());
                }
            }
            fulfillAllLinesOnApprove(id, reviewer, request);
        }
        return Result.success(toRequestView(requestMapper.selectById(id)));
    }

    /** 审核通过后自动出库：写库存流水并置 FULFILLED（库存已在申领预占时扣减，此处不再 updateStock） */
    private void fulfillAllLinesOnApprove(String requestId, User operator, MaterialRequest request) {
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(requestId);
        Map<Long, Integer> batchRemainingByItem = new HashMap<>();
        for (MaterialRequestLine line : lines) {
            int qty = line.getQty() != null ? line.getQty() : 0;
            if (qty <= 0) continue;
            batchRemainingByItem.merge(line.getItemId(), qty, Integer::sum);
        }
        int outboundLines = 0;
        List<String> itemNames = new ArrayList<>();
        for (MaterialRequestLine line : lines) {
            int qty = line.getQty() != null ? line.getQty() : 0;
            if (qty <= 0) continue;
            requestLineMapper.updateFulfilledQty(line.getId(), qty);
            MaterialItem item = itemMapper.selectById(line.getItemId());
            if (item != null && org.springframework.util.StringUtils.hasText(item.getName())) {
                itemNames.add(item.getName().trim());
            }
            int stockAfter = resolveOutboundMovementStockAfter(item, line.getItemId(), qty, batchRemainingByItem);
            MaterialStockMovement m = new MaterialStockMovement();
            m.setItemId(line.getItemId());
            m.setMovementType("OUTBOUND");
            m.setQty(-qty);
            m.setStockAfter(stockAfter);
            m.setRequestId(requestId);
            m.setRequestLineId(line.getId());
            m.setOperatorUserId(operator != null ? operator.getId() : null);
            m.setApplicantUserId(request.getUserId());
            m.setRemark("申领出库");
            stockMovementMapper.insert(m);
            outboundLines++;
        }
        requestMapper.updateFulfill(requestId, operator != null ? operator.getId() : null, LocalDateTime.now());
        Map<String, Object> detail = new HashMap<>();
        detail.put("operator", operator != null ? operator.getId() : null);
        detail.put("autoOnApprove", true);
        logOp("REQUEST", requestId, "FULFILL", detail);
        publishMaterialEvent("COMPLETED", requestId, operator != null ? operator.getId() : null, request.getUserId(),
                buildFulfillSummary(itemNames));
        try { pushService.send("MATERIAL_REVIEWED", Map.of("applicantName", userDisplayNameService.resolveDisplayName(request.getUserId()), "auditResult", "已通过", "summary", buildFulfillSummary(itemNames), "bizId", String.valueOf(requestId)), Set.of(request.getUserId())); } catch (Exception e) { log.warn("[Push] MATERIAL_REVIEWED failed: {}", e.getMessage()); }
    }

    @Transactional
    public Result<?> reject(User reviewer, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if (!canReview(request, reviewer)) return Result.error("无权审核此申领单");
        requestMapper.updateStatus(id, "REJECTED", LocalDateTime.now());
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
        try { pushService.send("MATERIAL_REVIEWED", Map.of("applicantName", userDisplayNameService.resolveDisplayName(request.getUserId()), "auditResult", "已拒绝", "summary", "审核已拒绝", "bizId", String.valueOf(id)), Set.of(request.getUserId())); } catch (Exception e) { log.warn("[Push] MATERIAL_REVIEWED failed: {}", e.getMessage()); }
        return Result.success(null);
    }

    /** 撤销已通过的审核：回退库存、流水、审核状态，仅审核人可操作 */
    @Transactional
    public Result<?> revoke(User reviewer, String id) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        // 仅审核人或超管可撤销（canReview 依赖状态，对已审结单需直接比对物品审核人列表）
        if (!isMaterialAuditSuperViewer(reviewer) && !isItemReviewer(request, reviewer)) {
            return Result.error("无权撤销此申领单");
        }
        if (!"APPROVED".equals(request.getStatus()) && !"FULFILLED".equals(request.getStatus())) {
            return Result.error("仅已通过/已出库的申领可撤销");
        }
        LocalDateTime now = LocalDateTime.now();
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(id);
        for (MaterialRequestLine line : lines) {
            int qty = line.getFulfilledQty() != null ? line.getFulfilledQty() : 0;
            if (qty <= 0) continue;
            // 回退库存
            MaterialItem item = itemMapper.selectById(line.getItemId());
            if (item != null && ("LIMITED".equals(item.getStockMode()) || "QUANTIFIED".equals(item.getStockMode()))) {
                itemMapper.updateStock(line.getItemId(), qty);
            }
            // 重置行的履行数量
            requestLineMapper.updateFulfilledQty(line.getId(), 0);
            // 记录撤销入库流水（冲正原出库，stockAfter 需计入本次回退的 qty）
            int stockAfter = (item != null && item.getStockQty() != null ? item.getStockQty() : 0) + qty;
            MaterialStockMovement m = new MaterialStockMovement();
            m.setItemId(line.getItemId());
            m.setMovementType("REVOKE_INBOUND");
            m.setQty(qty);
            m.setStockAfter(stockAfter);
            m.setRequestId(id);
            m.setRequestLineId(line.getId());
            m.setOperatorUserId(reviewer.getId());
            m.setApplicantUserId(request.getUserId());
            m.setRemark("撤销审核回退");
            stockMovementMapper.insert(m);
        }
        // 重置申领单到待审状态
        requestMapper.resetForRevoke(id, now);
        logOp("REQUEST", id, "REVOKE", Map.of("reviewer", reviewer.getId()));
        publishMaterialEvent("REVOKED", id, reviewer.getId(), request.getUserId(), "审核已撤销，回退待审");
        return Result.success(null);
    }

    /** @deprecated 审核通过已自动出库；保留接口兼容旧客户端 */
    @Transactional
    public Result<MaterialRequestView> fulfill(User operator, String id, FulfillMaterialRequestReq req) {
        MaterialRequest request = requestMapper.selectById(id);
        if (request == null) return Result.error("申领单不存在");
        if ("FULFILLED".equals(request.getStatus()) || "RECEIVED".equals(request.getStatus())) {
            return Result.success(toRequestView(request));
        }
        if (!"APPROVED".equals(request.getStatus())) {
            return Result.error("当前状态不可出库，请先完成审核");
        }
        fulfillAllLinesOnApprove(id, operator, request);
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
        LocalDateTime now = LocalDateTime.now();
        requestMapper.softDelete(id, operator != null ? operator.getId() : null, now, now.plusDays(7));
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

    // ==================== 库存流水审计 ====================

    /**
     * 申领出库流水的 stock_after：库存已在提交时 lockStock 扣减，fulfill 时 stock_qty 不再变化。
     * 需叠加其他申领仍锁定量 + 本单同物品后续行，得到该笔出库记账后的库存快照。
     */
    private int resolveOutboundMovementStockAfter(MaterialItem item, Long itemId, int outboundQty,
                                                  Map<Long, Integer> batchRemainingByItem) {
        int currentStock = item != null && item.getStockQty() != null ? item.getStockQty() : 0;
        int lockedQty = item != null && item.getLockedQty() != null ? item.getLockedQty() : 0;
        int remainingInBatch = batchRemainingByItem.getOrDefault(itemId, outboundQty);
        int remainingAfterThis = remainingInBatch - outboundQty;
        batchRemainingByItem.put(itemId, remainingAfterThis);
        return currentStock + lockedQty + remainingAfterThis;
    }

    private Map<Long, Integer> loadCurrentStockByItemIds(Collection<Long> itemIds) {
        Map<Long, Integer> stocks = new HashMap<>();
        if (itemIds == null) return stocks;
        for (Long itemId : itemIds) {
            if (itemId == null || itemId <= 0) continue;
            MaterialItem item = itemMapper.selectById(itemId);
            stocks.put(itemId, item != null && item.getStockQty() != null ? item.getStockQty() : 0);
        }
        return stocks;
    }

    /**
     * 从当前库存锚点倒推各笔流水 stock_after，修正历史出库快照写入错误（并发 fulfill 读同一 stock_qty）。
     */
    private void recomputeMovementStockAfter(List<MaterialStockMovementView> movements,
                                             Map<Long, Integer> currentStockByItemId) {
        if (movements == null || movements.isEmpty() || currentStockByItemId == null || currentStockByItemId.isEmpty()) {
            return;
        }
        Map<Long, List<MaterialStockMovementView>> byItem = new HashMap<>();
        for (MaterialStockMovementView movement : movements) {
            if (movement == null || movement.getItemId() == null) continue;
            byItem.computeIfAbsent(movement.getItemId(), k -> new ArrayList<>()).add(movement);
        }
        for (Map.Entry<Long, List<MaterialStockMovementView>> entry : byItem.entrySet()) {
            Integer currentStock = currentStockByItemId.get(entry.getKey());
            if (currentStock == null) continue;
            List<MaterialStockMovementView> sorted = new ArrayList<>(entry.getValue());
            sorted.sort((a, b) -> {
                String ta = a.getCreatedAt() != null ? a.getCreatedAt() : "";
                String tb = b.getCreatedAt() != null ? b.getCreatedAt() : "";
                int cmp = tb.compareTo(ta);
                if (cmp != 0) return cmp;
                long idA = a.getId() != null ? a.getId() : 0L;
                long idB = b.getId() != null ? b.getId() : 0L;
                return Long.compare(idB, idA);
            });
            int running = currentStock;
            for (MaterialStockMovementView movement : sorted) {
                movement.setStockAfter(running);
                running -= movement.getQty() != null ? movement.getQty() : 0;
            }
        }
    }

    public Result<Map<String, Object>> listItemStockMovements(Long itemId, String applicantGroup, int page, int size) {
        Long queryItemId = (itemId != null && itemId > 0) ? itemId : null;
        int offset = (page - 1) * size;
        List<MaterialStockMovementView> views = stockMovementMapper.selectViewsByItemId(queryItemId, offset, size, applicantGroup);
        for (MaterialStockMovementView v : views) {
            if (v.getCreatedAt() != null) {
                v.setCreatedAt(com.example.demo.common.time.WallClockDisplayFormat.fromJdbcValue(v.getCreatedAt()));
            }
            enrichMovementApplicant(v);
        }
        Set<Long> itemIds = views.stream()
                .map(MaterialStockMovementView::getItemId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (queryItemId != null) {
            itemIds.add(queryItemId);
        }
        recomputeMovementStockAfter(views, loadCurrentStockByItemIds(itemIds));
        int total = stockMovementMapper.countViewsByItemId(queryItemId, applicantGroup);
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return Result.success(result);
    }

    public Result<List<Map<String, Object>>> listApplicantsWithRecords(User viewer, String from, String to) {
        List<MaterialRequestView> visible = collectAuditExportRequestViews(viewer, from, to, null, null);
        LinkedHashMap<String, String> byUser = new LinkedHashMap<>();
        for (MaterialRequestView req : visible) {
            String userId = req.getUserId() != null ? req.getUserId().trim() : "";
            if (!StringUtils.hasText(userId)) continue;
            String name = req.getApplicantName() != null ? req.getApplicantName().trim() : "";
            if (!StringUtils.hasText(name)) {
                name = userDisplayNameService.resolveDisplayName(userId);
            }
            byUser.putIfAbsent(userId, name);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, String> e : byUser.entrySet()) {
            Map<String, Object> m = new HashMap<>();
            m.put("userId", e.getKey());
            m.put("applicantName", e.getValue());
            out.add(m);
        }
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("applicantName"))));
        return Result.success(out);
    }

    public Result<List<String>> listGroupsWithRecords(User viewer, String from, String to) {
        List<MaterialRequestView> visible = collectAuditExportRequestViews(viewer, from, to, null, null);
        TreeSet<String> groups = new TreeSet<>();
        for (MaterialRequestView req : visible) {
            String g = req.getApplicantGroup() != null ? req.getApplicantGroup().trim() : "";
            if (StringUtils.hasText(g)) groups.add(g);
        }
        return Result.success(new ArrayList<>(groups));
    }

    /**
     * 申领审计导出页列表：按物品配置的审核人过滤（行级），超管亦不 bypass。
     */
    public Result<Map<String, Object>> listAuditExportRequests(User viewer, String from, String to,
                                                                 String applicantUserId, String applicantGroup,
                                                                 int page, int size) {
        if (viewer == null) return Result.error("未登录");
        List<MaterialRequestView> all = collectAuditExportRequestViews(
                viewer, from, to, applicantUserId, applicantGroup);
        int offset = Math.max(0, (page - 1) * size);
        int end = Math.min(offset + size, all.size());
        List<MaterialRequestView> pageRows = offset >= all.size() ? List.of() : all.subList(offset, end);
        Map<String, Object> result = new HashMap<>();
        result.put("data", pageRows);
        result.put("total", all.size());
        return Result.success(result);
    }

    private List<MaterialRequestView> collectAuditExportRequestViews(User viewer, String from, String to,
                                                                       String applicantUserId, String applicantGroup) {
        if (viewer == null) return List.of();
        String fromDay = trimDay(from);
        String toDay = trimDay(to);
        boolean staff = isStaffUser(viewer);

        List<MaterialRequest> candidates;
        if (!staff) {
            candidates = requestMapper.selectByUserId(viewer.getId(), null, 0, 500);
        } else {
            candidates = requestMapper.selectAll(null, applicantUserId, applicantGroup, 0, 500);
        }

        List<MaterialRequestView> out = new ArrayList<>();
        for (MaterialRequest req : candidates) {
            if (req == null || isDraftStatus(req.getStatus())) continue;
            if (!dateInRangeDayFromDateTime(req.getCreatedAt(), fromDay, toDay)) continue;
            if (!staff && StringUtils.hasText(applicantGroup)) {
                String g = req.getApplicantGroup() != null ? req.getApplicantGroup().trim() : "";
                if (!applicantGroup.trim().equals(g)) continue;
            }
            MaterialRequestView view = toRequestView(req);
            List<MaterialRequestLineView> visibleLines = new ArrayList<>();
            if (view.getLines() != null) {
                for (MaterialRequestLineView line : view.getLines()) {
                    MaterialItem item = line.getItemId() != null ? itemMapper.selectById(line.getItemId()) : null;
                    if (canViewLineForAuditExport(viewer, req, item)) {
                        visibleLines.add(line);
                    }
                }
            }
            if (visibleLines.isEmpty()) continue;
            view.setLines(visibleLines);
            out.add(view);
        }
        return out;
    }

    private boolean isStaffUser(User viewer) {
        return viewer.getRole() != null
                && viewer.getRole().getLevel() >= com.example.demo.common.enums.RoleEnum.STAFF.getLevel();
    }

    /** 审计导出：仅可见本人为物品审核人（或已参与审核）的明细行 */
    private boolean canViewLineForAuditExport(User viewer, MaterialRequest request, MaterialItem item) {
        if (viewer == null || request == null) return false;
        if (viewer.getRole() != null && "MEMBER".equals(viewer.getRole().name())) {
            return viewer.getId() != null && viewer.getId().equals(request.getUserId());
        }
        if (item != null && isAssignedItemReviewer(viewer, item)) return true;
        String vid = viewer.getId();
        if (vid != null && vid.equals(request.getFirstReviewerId())) return true;
        if (vid != null && vid.equals(request.getSecondReviewerId())) return true;
        return false;
    }

    private boolean isAssignedItemReviewer(User viewer, MaterialItem item) {
        if (viewer == null || item == null) return false;
        return isInReviewerListStrict(item.getReviewerIds(), viewer)
                || isInReviewerListStrict(item.getSecondReviewerIds(), viewer);
    }

    /** 物品已配置审核人时，仅名单内账号可见；未配置或空数组则无人可见（审计页不兜底全员） */
    private boolean isInReviewerListStrict(String reviewerIdsJson, User reviewer) {
        if (!StringUtils.hasText(reviewerIdsJson) || "[]".equals(reviewerIdsJson.trim())) {
            return false;
        }
        Set<String> configured = normalizeReviewerIdList(reviewerIdsJson);
        if (configured.isEmpty()) return false;
        String canonicalReviewer = canonicalUserId(reviewer);
        return StringUtils.hasText(canonicalReviewer) && configured.contains(canonicalReviewer);
    }

    /**
     * 申领审计导出页表格数据：与 Web 预览同源（日期区间、人员/课题组、排除草稿、审核人范围）。
     */
    public List<MaterialAuditGridRow> collectAuditGridRows(User viewer, String from, String to,
                                                            String applicantUserId, String applicantGroup) {
        if (viewer == null) return List.of();
        List<MaterialRequestView> requests = collectAuditExportRequestViews(
                viewer, from, to, applicantUserId, applicantGroup);

        List<MaterialAuditGridRow> rows = new ArrayList<>();
        for (MaterialRequestView req : requests) {
            if (req == null || req.getLines() == null) continue;
            for (MaterialRequestLineView line : req.getLines()) {
                MaterialAuditGridRow row = new MaterialAuditGridRow();
                row.setRequestId(displayCell(req.getId()));
                row.setItemName(displayCell(line.getSnapshotName()));
                row.setQty(line.getQty() != null ? String.valueOf(line.getQty()) : "无");
                row.setStatus(statusZhDisplay(req.getStatus()));
                row.setApplicantName(displayCell(req.getApplicantName()));
                row.setApplicantGroup(displayCell(req.getApplicantGroup()));
                row.setTime(displayTime(req.getCreatedAt()));
                rows.add(row);
            }
        }
        return rows;
    }

    /**
     * 按物品来去流水导出数据：与 Web 预览 buildItemFlowRows 逻辑一致。
     */
    public List<MaterialItemFlowExportRow> collectItemFlowExportRows(Long itemId, String from, String to, String applicantGroup) {
        Long queryItemId = (itemId != null && itemId > 0) ? itemId : null;
        String fromDay = trimDay(from);
        String toDay = trimDay(to);

        List<MaterialStockMovementView> movements = stockMovementMapper.selectViewsByItemId(queryItemId, 0, 500, applicantGroup);
        for (MaterialStockMovementView v : movements) {
            if (v.getCreatedAt() != null) {
                v.setCreatedAt(com.example.demo.common.time.WallClockDisplayFormat.fromJdbcValue(v.getCreatedAt()));
            }
            enrichMovementApplicant(v);
        }
        Set<Long> stockItemIds = movements.stream()
                .map(MaterialStockMovementView::getItemId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (queryItemId != null) {
            stockItemIds.add(queryItemId);
        }
        recomputeMovementStockAfter(movements, loadCurrentStockByItemIds(stockItemIds));

        List<Map<String, Object>> claimMaps = requestMapper.selectClaimLinesByItemId(queryItemId, fromDay, toDay, applicantGroup, 0, 500);
        for (Map<String, Object> row : claimMaps) {
            com.example.demo.common.time.WallClockDisplayFormat.normalizeMapDateTimeKeys(row, "createdAt", "fulfilledAt");
            String userId = row.get("userId") != null ? String.valueOf(row.get("userId")) : "";
            if (!StringUtils.hasText(String.valueOf(row.get("applicantName")))) {
                row.put("applicantName", userDisplayNameService.resolveDisplayName(userId));
            }
            if (!StringUtils.hasText(String.valueOf(row.get("applicantGroup")))) {
                row.put("applicantGroup", resolveApplicantGroup(userId, null));
            }
        }

        List<MaterialItemFlowExportRow> rows = new ArrayList<>();
        Set<String> outboundRequestIds = new HashSet<>();

        for (MaterialStockMovementView m : movements) {
            String type = m.getMovementType() != null ? m.getMovementType().toUpperCase(Locale.ROOT) : "";
            if (!"INBOUND".equals(type) && !"OUTBOUND".equals(type) && !"ADJUST".equals(type)) continue;
            if (!dateInRangeDay(m.getCreatedAt(), fromDay, toDay)) continue;
            if ("OUTBOUND".equals(type) && StringUtils.hasText(m.getRequestId())) {
                outboundRequestIds.add(m.getRequestId());
            }
            MaterialItemFlowExportRow row = new MaterialItemFlowExportRow();
            row.setTime(displayTime(m.getCreatedAt()));
            row.setEventType(movementTypeZh(type));
            row.setItemName(displayCell(m.getItemName()));
            row.setSpec(formatSpecLabelDisplay(m.getSpecSnapshot()));
            row.setQty(movementQtyDisplay(type, m.getQty()));
            row.setStockAfter(m.getStockAfter() != null ? String.valueOf(m.getStockAfter()) : "无");
            row.setApplicantName(displayCell(m.getApplicantName()));
            row.setApplicantGroup(displayCell(m.getApplicantGroup()));
            row.setRequestId(displayCell(m.getRequestId()));
            row.setRemark(remarkZhDisplay(m.getRemark()));
            rows.add(row);
        }

        for (Map<String, Object> c : claimMaps) {
            int fulfilled = toInt(c.get("fulfilledQty"));
            String requestId = c.get("requestId") != null ? String.valueOf(c.get("requestId")) : "";
            if (fulfilled <= 0 || outboundRequestIds.contains(requestId)) continue;
            String outboundTime = firstNonBlank(
                    c.get("fulfilledAt") != null ? String.valueOf(c.get("fulfilledAt")) : null,
                    c.get("createdAt") != null ? String.valueOf(c.get("createdAt")) : null);
            if (!dateInRangeDay(outboundTime, fromDay, toDay)) continue;
            String status = c.get("status") != null ? String.valueOf(c.get("status")).toUpperCase(Locale.ROOT) : "";
            if (!"FULFILLED".equals(status) && !"RECEIVED".equals(status)) continue;

            MaterialItemFlowExportRow row = new MaterialItemFlowExportRow();
            row.setTime(displayTime(outboundTime));
            row.setEventType("出库");
            row.setItemName(displayCell(c.get("itemName") != null ? String.valueOf(c.get("itemName")) : null));
            row.setSpec(formatSpecLabelDisplay(c.get("specSnapshot") != null ? String.valueOf(c.get("specSnapshot")) : null));
            row.setQty("-" + fulfilled);
            row.setStockAfter("无");
            row.setApplicantName(displayCell(c.get("applicantName") != null ? String.valueOf(c.get("applicantName")) : null));
            row.setApplicantGroup(displayCell(c.get("applicantGroup") != null ? String.valueOf(c.get("applicantGroup")) : null));
            row.setRequestId(displayCell(requestId));
            row.setRemark("申领出库（无流水补录）");
            rows.add(row);
        }

        rows.sort((a, b) -> {
            String ta = a.getTime() != null ? a.getTime() : "";
            String tb = b.getTime() != null ? b.getTime() : "";
            return tb.compareTo(ta);
        });
        return rows;
    }

    @SuppressWarnings("unchecked")
    private List<MaterialRequestView> extractRequestViews(Result<Map<String, Object>> result) {
        if (result == null || !Boolean.TRUE.equals(result.getSuccess()) || result.getData() == null) {
            return List.of();
        }
        Object data = result.getData().get("data");
        if (!(data instanceof List<?> list)) return List.of();
        List<MaterialRequestView> out = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof MaterialRequestView v) out.add(v);
        }
        return out;
    }

    private static String trimDay(String v) {
        if (!StringUtils.hasText(v)) return "";
        return v.trim().length() >= 10 ? v.trim().substring(0, 10) : v.trim();
    }

    private static boolean isDraftStatus(String status) {
        return "DRAFT".equalsIgnoreCase(String.valueOf(status != null ? status : "").trim());
    }

    private static boolean dateInRangeDay(String v, String from, String to) {
        if (!StringUtils.hasText(v)) return false;
        if (!StringUtils.hasText(from) || !StringUtils.hasText(to)) return true;
        String d = v.length() >= 10 ? v.substring(0, 10) : v;
        return d.compareTo(from) >= 0 && d.compareTo(to) <= 0;
    }

    private static boolean dateInRangeDayFromDateTime(LocalDateTime dt, String from, String to) {
        if (dt == null) return false;
        if (!StringUtils.hasText(from) || !StringUtils.hasText(to)) return true;
        return dateInRangeDay(dt.toLocalDate().toString(), from, to);
    }

    public static String sanitizeExportFilenamePart(String part) {
        if (!StringUtils.hasText(part)) return "申领审计";
        return part.trim().replaceAll("[\\\\/:*?\"<>|]", "_").replaceAll("\\s+", " ");
    }

    public static String buildAuditExportFilename(String label, String from, String to) {
        String base = sanitizeExportFilenamePart(label);
        if (!StringUtils.hasText(from) && !StringUtils.hasText(to)) {
            return base + "-全部时间.xlsx";
        }
        String f = StringUtils.hasText(from) ? from.trim() : "start";
        String t = StringUtils.hasText(to) ? to.trim() : "end";
        return base + "-" + f + "_" + t + ".xlsx";
    }

    private static String displayCell(String v) {
        String t = v != null ? v.trim() : "";
        if (!StringUtils.hasText(t) || "-".equals(t)) return "无";
        return t;
    }

    private static String displayTime(String v) {
        if (!StringUtils.hasText(v)) return "无";
        String t = com.example.demo.common.time.WallClockDisplayFormat.fromJdbcValue(v);
        if (!StringUtils.hasText(t) || "-".equals(t)) return "无";
        return t;
    }

    private static String statusZhDisplay(String s) {
        if (!StringUtils.hasText(s)) return "无";
        return switch (s.trim().toUpperCase(Locale.ROOT)) {
            case "DRAFT" -> "草稿";
            case "PENDING" -> "待审核";
            case "FIRST_OK" -> "初审通过";
            case "APPROVED" -> "已通过";
            case "REJECTED" -> "已拒绝";
            case "FULFILLED" -> "已出库";
            case "RECEIVED" -> "已完成";
            default -> "未知";
        };
    }

    private static String movementTypeZh(String type) {
        if (!StringUtils.hasText(type)) return "无";
        return switch (type.toUpperCase(Locale.ROOT)) {
            case "INBOUND" -> "入库";
            case "OUTBOUND" -> "出库";
            case "ADJUST" -> "调整";
            default -> "其他";
        };
    }

    private static String movementQtyDisplay(String type, Integer qty) {
        String u = type != null ? type.toUpperCase(Locale.ROOT) : "";
        int n = qty != null ? Math.abs(qty) : 0;
        if ("INBOUND".equals(u)) return "+" + n;
        if ("OUTBOUND".equals(u)) return "-" + n;
        if ("ADJUST".equals(u)) {
            int signed = qty != null ? qty : 0;
            return signed > 0 ? "+" + signed : String.valueOf(signed);
        }
        return qty != null ? String.valueOf(qty) : "0";
    }

    private static String remarkZhDisplay(String remark) {
        String t = remark != null ? remark.trim() : "";
        if (!StringUtils.hasText(t) || "-".equals(t)) return "无";
        String u = t.toUpperCase(Locale.ROOT);
        if ("INBOUND".equals(u)) return "入库";
        if ("OUTBOUND".equals(u)) return "申领出库";
        if (u.contains("INITIAL INBOUND") || "INITIAL".equals(u)) return "初始入库";
        return t;
    }

    /** 规格快照 JSON → 展示文案（与前端 formatSpecLabel 一致） */
    private static String formatSpecLabelDisplay(String specSnapshot) {
        if (!StringUtils.hasText(specSnapshot)) return "无";
        String raw = specSnapshot.trim();
        if (!raw.startsWith("{")) return displayCell(raw);
        try {
            com.alibaba.fastjson2.JSONObject obj = com.alibaba.fastjson2.JSON.parseObject(raw);
            if (obj == null || obj.isEmpty()) return "无";
            List<String> parts = new ArrayList<>();
            for (Object val : obj.values()) {
                if (val == null) continue;
                String vs = String.valueOf(val).trim();
                if (!vs.isEmpty()) parts.add(vs);
            }
            return parts.isEmpty() ? "无" : String.join("·", parts);
        } catch (Exception e) {
            return displayCell(raw);
        }
    }

    private static int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        try {
            return v != null ? Integer.parseInt(String.valueOf(v)) : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String v : values) {
            if (StringUtils.hasText(v)) return v;
        }
        return "";
    }

    public Result<Map<String, Object>> listItemClaimLines(Long itemId, String from, String to,
                                                          String applicantGroup, int page, int size) {
        Long queryItemId = (itemId != null && itemId > 0) ? itemId : null;
        int offset = (page - 1) * size;
        List<Map<String, Object>> rows = requestMapper.selectClaimLinesByItemId(queryItemId, from, to, applicantGroup, offset, size);
        for (Map<String, Object> row : rows) {
            com.example.demo.common.time.WallClockDisplayFormat.normalizeMapDateTimeKeys(
                    row, "createdAt", "fulfilledAt");
            String userId = row.get("userId") != null ? String.valueOf(row.get("userId")) : "";
            if (!StringUtils.hasText(String.valueOf(row.get("applicantName")))) {
                row.put("applicantName", userDisplayNameService.resolveDisplayName(userId));
            }
            if (!StringUtils.hasText(String.valueOf(row.get("applicantGroup")))) {
                row.put("applicantGroup", resolveApplicantGroup(userId, null));
            }
        }
        int total = requestMapper.countClaimLinesByItemId(queryItemId, from, to, applicantGroup);
        Map<String, Object> result = new HashMap<>();
        result.put("data", rows);
        result.put("total", total);
        return Result.success(result);
    }

    /** 启动时回填历史申领单的课题组与申领人姓名 */
    public int backfillRequestApplicantMetadata() {
        List<MaterialRequest> requests = requestMapper.selectAll(null, null, null, 0, 100000);
        int updated = 0;
        for (MaterialRequest req : requests) {
            boolean needName = !StringUtils.hasText(req.getApplicantName());
            boolean needGroup = !StringUtils.hasText(req.getApplicantGroup());
            if (!needName && !needGroup) continue;
            String name = needName ? userDisplayNameService.resolveDisplayName(req.getUserId()) : req.getApplicantName();
            String group = needGroup ? resolveApplicantGroup(req.getUserId(), null) : req.getApplicantGroup();
            if ((needName && StringUtils.hasText(name)) || (needGroup && StringUtils.hasText(group))) {
                requestMapper.updateApplicantMeta(req.getId(), name, group);
                updated++;
            }
        }
        return updated;
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
        int approved = requestMapper.countAll("APPROVED", null, null) + requestMapper.countAll("FULFILLED", null, null) + requestMapper.countAll("RECEIVED", null, null);
        int rejected = requestMapper.countAll("REJECTED", null, null);
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

    /** 按课题组聚合统计 */
    public Result<List<Map<String, Object>>> getStatsByGroup(String from, String to) {
        return Result.success(requestMapper.statsByGroup(from, to));
    }

    /**
     * 统计看板：申领记录 + 库存流水（与申领审计导出同源），直接供前端坐标图使用。
     */
    public Result<MaterialStatsAnalytics> getStatsAnalytics(String from, String to, String groupId) {
        String g = StringUtils.hasText(groupId) ? groupId.trim() : null;
        MaterialStatsAnalytics out = new MaterialStatsAnalytics();

        List<Map<String, Object>> byStudent = requestMapper.statsByStudentFiltered(from, to, g);
        List<Map<String, Object>> byItem = requestMapper.statsByItemFiltered(from, to, g);
        List<Map<String, Object>> byGroup = requestMapper.statsByGroupFiltered(from, to, g);
        out.setByStudent(byStudent);
        out.setByItem(byItem);
        out.setByGroup(byGroup);

        long totalRequests = byStudent.stream()
                .mapToLong(m -> ((Number) m.getOrDefault("total", 0)).longValue()).sum();
        long totalRequestQty = byItem.stream()
                .mapToLong(m -> ((Number) m.getOrDefault("totalQty", 0)).longValue()).sum();
        out.setTotalRequests(totalRequests);
        out.setTotalRequestQty(totalRequestQty);
        out.setActiveStudents((long) byStudent.size());
        out.setActiveGroups((long) byGroup.size());

        Map<String, Object> passReject = requestMapper.statsPassRejectInRange(from, to, g);
        long approved = passReject != null ? ((Number) passReject.getOrDefault("approved", 0)).longValue() : 0;
        long rejected = passReject != null ? ((Number) passReject.getOrDefault("rejected", 0)).longValue() : 0;
        out.setRefuseCount(rejected);
        out.setPassRate((approved + rejected) > 0 ? (double) approved / (double) (approved + rejected) : 0.0);

        List<Map<String, Object>> dailyReq = requestMapper.statsDailyRequests(from, to, g);
        List<Map<String, Object>> dailyMov = stockMovementMapper.statsDailyMovements(from, to, g);
        Map<String, Map<String, Object>> dayMap = new LinkedHashMap<>();
        for (Map<String, Object> row : dailyReq) {
            String date = String.valueOf(row.get("date"));
            Map<String, Object> d = dayMap.computeIfAbsent(date, k -> {
                Map<String, Object> m = new HashMap<>();
                m.put("date", date);
                m.put("requestCount", 0L);
                m.put("requestQty", 0L);
                m.put("outboundQty", 0L);
                m.put("inboundQty", 0L);
                return m;
            });
            d.put("requestCount", ((Number) row.getOrDefault("requestCount", 0)).longValue());
            d.put("requestQty", ((Number) row.getOrDefault("requestQty", 0)).longValue());
        }
        long totalOutbound = 0;
        long totalInbound = 0;
        for (Map<String, Object> row : dailyMov) {
            String date = String.valueOf(row.get("date"));
            String type = String.valueOf(row.getOrDefault("movementType", ""));
            long qty = ((Number) row.getOrDefault("totalQty", 0)).longValue();
            Map<String, Object> d = dayMap.computeIfAbsent(date, k -> {
                Map<String, Object> m = new HashMap<>();
                m.put("date", date);
                m.put("requestCount", 0L);
                m.put("requestQty", 0L);
                m.put("outboundQty", 0L);
                m.put("inboundQty", 0L);
                return m;
            });
            if ("OUTBOUND".equalsIgnoreCase(type)) {
                d.put("outboundQty", qty);
                totalOutbound += qty;
            } else if ("INBOUND".equalsIgnoreCase(type)) {
                d.put("inboundQty", qty);
                totalInbound += qty;
            }
        }
        out.setTotalOutboundQty(totalOutbound);
        out.setTotalInboundQty(totalInbound);
        out.setDailyTrend(new ArrayList<>(dayMap.values()));

        out.setStatusDistribution(requestMapper.statsStatusInRange(from, to, g));
        out.setOutboundHeatmap(stockMovementMapper.statsOutboundHeatmap(from, to, g));

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
        out.setStockWarnings(warnings);
        return Result.success(out);
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
                v.setCreatedAt(toDisplayTime(req.getCreatedAt()));
                v.setFulfilledAt(toDisplayTime(req.getFulfilledAt()));
                v.setFulfilledBy(req.getFulfilledBy());
                v.setFirstReviewerId(req.getFirstReviewerId());
                v.setSecondReviewerId(req.getSecondReviewerId());
                v.setFirstReviewTime(toDisplayTime(req.getFirstReviewTime()));
                v.setSecondReviewTime(toDisplayTime(req.getSecondReviewTime()));
                views.add(v);
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("data", views);
        result.put("total", total);
        return Result.success(result);
    }

    // ==================== 内部辅助 ====================

    private String resolveApplicantGroup(String userId, String preferred) {
        if (StringUtils.hasText(preferred)) {
            return preferred.trim();
        }
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(userId);
            if (personnel == null) return null;
            String resolved = personnel.getResolvedProjectGroupNames();
            if (!StringUtils.hasText(resolved)) return null;
            List<String> groups = PersonnelProjectGroupUtil.splitGroups(resolved);
            return groups.isEmpty() ? resolved.trim() : groups.get(0);
        } catch (Exception e) {
            log.warn("解析申领人课题组失败 userId={}: {}", userId, e.getMessage());
            return null;
        }
    }

    private void enrichMovementApplicant(MaterialStockMovementView v) {
        if (v == null) return;
        if (StringUtils.hasText(v.getOperatorUserId()) && !StringUtils.hasText(v.getOperatorName())) {
            v.setOperatorName(userDisplayNameService.resolveDisplayName(v.getOperatorUserId()));
        }
        if (!StringUtils.hasText(v.getApplicantUserId())) return;
        if (StringUtils.hasText(v.getApplicantName()) && StringUtils.hasText(v.getApplicantGroup())) return;
        String group = resolveApplicantGroup(v.getApplicantUserId(), v.getApplicantGroup());
        if (!StringUtils.hasText(v.getApplicantName())) {
            v.setApplicantName(userDisplayNameService.resolveDisplayName(v.getApplicantUserId()));
        }
        if (!StringUtils.hasText(v.getApplicantGroup()) && StringUtils.hasText(group)) {
            v.setApplicantGroup(group);
        }
    }

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
        if (item.getCreatedAt() != null) v.setCreatedAt(toDisplayTime(item.getCreatedAt()));
        if (item.getLastInboundAt() != null) v.setLastInboundAt(toDisplayTime(item.getLastInboundAt()));
        v.setSpecSchema(item.getSpecSchema());
        v.setSpecRequired(item.getSpecRequired());
        v.setIndependentOrder(item.getIndependentOrder());
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
        v.setFirstReviewerId(!StringUtils.hasText(request.getFirstReviewerId()) ? "无" : request.getFirstReviewerId());
        v.setSecondReviewerId(!StringUtils.hasText(request.getSecondReviewerId()) ? "无" : request.getSecondReviewerId());
        v.setFirstReviewTime(toDisplayTime(request.getFirstReviewTime()));
        v.setSecondReviewTime(toDisplayTime(request.getSecondReviewTime()));
        v.setFulfilledAt(toDisplayTime(request.getFulfilledAt()));
        v.setFulfilledBy(request.getFulfilledBy());
        v.setReceivedAt(toDisplayTime(request.getReceivedAt()));
        v.setCreatedAt(toDisplayTime(request.getCreatedAt()));
        v.setUpdatedAt(toDisplayTime(request.getUpdatedAt()));
        List<MaterialRequestLine> lines = requestLineMapper.selectByRequestId(request.getId());
        v.setLines(lines.stream().map(l -> {
            MaterialRequestLineView lv = new MaterialRequestLineView();
            lv.setId(l.getId());
            lv.setItemId(l.getItemId());
            lv.setQty(l.getQty());
            lv.setSnapshotName(l.getSnapshotName());
            lv.setFulfilledQty(l.getFulfilledQty());
            lv.setSpecSnapshot(l.getSpecSnapshot());
            if (l.getItemId() != null) {
                MaterialItem it = itemMapper.selectById(l.getItemId());
                if (it != null) {
                    lv.setCoverUrl(it.getCoverUrl());
                }
            }
            return lv;
        }).collect(Collectors.toList()));
        return v;
    }

    private static String buildFulfillSummary(List<String> itemNames) {
        if (itemNames == null || itemNames.isEmpty()) return "已出库";
        List<String> distinct = itemNames.stream().distinct().limit(5).toList();
        String items = String.join("、", distinct);
        if (itemNames.stream().distinct().count() > 5) items += "等";
        return "已出库：" + items;
    }

    private void publishMaterialEvent(String eventType, String requestId, String senderId, String applicantId, String summary) {
        try {
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType(eventType);
            event.setBizType("MATERIAL_REQUEST");
            event.setBizId(requestId);
            event.setSenderId(senderId);
            event.setApplicantId(applicantId);
            if ("CREATED".equalsIgnoreCase(eventType)) {
                MaterialRequest request = requestMapper.selectById(requestId);
                Set<String> reviewerIds = resolveReviewerUserIdsForRequest(request);
                if (!reviewerIds.isEmpty()) {
                    event.setRelatedUserIds(reviewerIds);
                    event.setProcessorId(reviewerIds.iterator().next());
                    // 仅通知审核人，不把申请人当作 CREATED 的教职工收件人
                    event.setApplicantId(null);
                }
            }
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

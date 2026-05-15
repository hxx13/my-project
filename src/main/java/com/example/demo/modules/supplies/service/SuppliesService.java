package com.example.demo.modules.supplies.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.supplies.dto.*;
import com.example.demo.modules.supplies.entity.*;
import com.example.demo.modules.supplies.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.fontbox.ttf.TrueTypeCollection;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import com.example.demo.modules.upload.service.UploadFileService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SuppliesService {
    private static final String SHELF_ON = "ON_SHELF";
    private static final String MODE_QUANTIFIED = "QUANTIFIED";
    private static final String MODE_FLAG = "FLAG";
    private static final int NOVELTY_KEEP_DAYS = 7;
    /** 个人领用「按申请日期区间」聚合：最多订单数（列表与导出共用上限） */
    private static final int CLAIM_RANGE_LIST_MAX_ORDERS = 500;
    /** 个人领用「按申请日期区间」：起止日期最大跨度（含首尾日） */
    private static final int CLAIM_RANGE_MAX_INCLUSIVE_DAYS = 366;
    private static final DateTimeFormatter PDF_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SupplyCategoryMapper categoryMapper;
    private final SupplyItemMapper itemMapper;
    private final SupplyClaimOrderMapper claimOrderMapper;
    private final SupplyClaimLineMapper claimLineMapper;
    private final SupplyClaimExportFileMapper claimExportFileMapper;
    private final SupplyInventoryMovementMapper supplyInventoryMovementMapper;
    private final SuppliesExcelExportService suppliesExcelExportService;
    private final SupplyOperationLogMapper operationLogMapper;
    private final SupplyUserViewStateMapper supplyUserViewStateMapper;
    private final SupplyUserCartMapper supplyUserCartMapper;
    private final UploadFileService uploadFileService;
    private final NotificationService notificationService;
    private final NotificationSettingsMapper notificationSettingsMapper;
    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final ObjectMapper objectMapper;
    private final CapabilityPolicyService capabilityPolicyService;
    @Value("${app.public-base-url:}")
    private String appPublicBaseUrl;
    @Value("${app.pdf.font-path:}")
    private String appPdfFontPath;

    public SuppliesService(SupplyCategoryMapper categoryMapper,
                           SupplyItemMapper itemMapper,
                           SupplyClaimOrderMapper claimOrderMapper,
                           SupplyClaimLineMapper claimLineMapper,
                           SupplyClaimExportFileMapper claimExportFileMapper,
                           SupplyInventoryMovementMapper supplyInventoryMovementMapper,
                           SuppliesExcelExportService suppliesExcelExportService,
                           SupplyOperationLogMapper operationLogMapper,
                           SupplyUserViewStateMapper supplyUserViewStateMapper,
                           SupplyUserCartMapper supplyUserCartMapper,
                           UploadFileService uploadFileService,
                           NotificationService notificationService,
                           NotificationSettingsMapper notificationSettingsMapper,
                           UserMapper userMapper,
                           UserDisplayNameService userDisplayNameService,
                           ObjectMapper objectMapper,
                           CapabilityPolicyService capabilityPolicyService) {
        this.categoryMapper = categoryMapper;
        this.itemMapper = itemMapper;
        this.claimOrderMapper = claimOrderMapper;
        this.claimLineMapper = claimLineMapper;
        this.claimExportFileMapper = claimExportFileMapper;
        this.supplyInventoryMovementMapper = supplyInventoryMovementMapper;
        this.suppliesExcelExportService = suppliesExcelExportService;
        this.operationLogMapper = operationLogMapper;
        this.supplyUserViewStateMapper = supplyUserViewStateMapper;
        this.supplyUserCartMapper = supplyUserCartMapper;
        this.uploadFileService = uploadFileService;
        this.notificationService = notificationService;
        this.notificationSettingsMapper = notificationSettingsMapper;
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.objectMapper = objectMapper;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    public boolean isAdmin(User user) {
        return capabilityPolicyService.canProcess(user, BizDomains.SUPPLIES_ADMIN);
    }

    public boolean canProcessClaims(User user) {
        return capabilityPolicyService.canProcess(user, BizDomains.SUPPLIES_CLAIM);
    }

    /** 领用区间代查他人、申请人全量列表：仅超级管理员及以上 */
    private boolean isSuperAdminOrAbove(User user) {
        if (user == null || user.getRole() == null) {
            return false;
        }
        return user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
    }

    public List<SupplyCategoryView> listCategoriesForStaff() {
        return categoryMapper.listEnabledOrdered().stream().map(this::toCatView).toList();
    }

    public List<SupplyCategoryView> listCategoriesForAdmin() {
        return categoryMapper.listAllOrdered().stream().map(this::toCatView).toList();
    }

    public Result<SupplyCategoryView> createCategory(SupplyCategoryUpsertRequest req) {
        if (req == null || !StringUtils.hasText(req.getName())) {
            return Result.error("分类名称不能为空");
        }
        SupplyCategory c = new SupplyCategory();
        c.setName(req.getName().trim());
        c.setSortOrder(req.getSortOrder() == null ? 0 : req.getSortOrder());
        c.setStatus(req.getStatus() == null ? 1 : req.getStatus());
        categoryMapper.insert(c);
        return Result.success(toCatView(categoryMapper.findById(c.getId())));
    }

    public Result<SupplyCategoryView> updateCategory(Long id, SupplyCategoryUpsertRequest req) {
        SupplyCategory existing = categoryMapper.findById(id);
        if (existing == null) return Result.error("分类不存在");
        if (req == null) return Result.error("参数无效");
        if (StringUtils.hasText(req.getName())) existing.setName(req.getName().trim());
        if (req.getSortOrder() != null) existing.setSortOrder(req.getSortOrder());
        if (req.getStatus() != null) existing.setStatus(req.getStatus());
        categoryMapper.update(existing);
        return Result.success(toCatView(categoryMapper.findById(id)));
    }

    public Result<?> deleteCategory(Long id) {
        if (categoryMapper.findById(id) == null) return Result.error("分类不存在");
        categoryMapper.deleteById(id);
        return Result.success();
    }

    public List<SupplyItemView> listItemsForStaff(String userId, Long categoryId) {
        List<SupplyItemView> views = itemMapper.listOnShelf(categoryId).stream().map(this::toItemView).collect(Collectors.toList());
        applyNoveltyTags(userId, views);
        views.sort((a, b) -> {
            int catCmp = Long.compare(a.getCategoryId() == null ? 0L : a.getCategoryId(), b.getCategoryId() == null ? 0L : b.getCategoryId());
            if (catCmp != 0) return catCmp;
            int rankCmp = Integer.compare(noveltyRank(a), noveltyRank(b));
            if (rankCmp != 0) return rankCmp;
            LocalDateTime at = latestNoveltyTime(a);
            LocalDateTime bt = latestNoveltyTime(b);
            if (at != null && bt != null) return bt.compareTo(at);
            if (at != null) return -1;
            if (bt != null) return 1;
            return Long.compare(a.getId() == null ? 0L : a.getId(), b.getId() == null ? 0L : b.getId());
        });
        return views;
    }

    public Result<?> markItemsViewed(User user) {
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录");
        }
        supplyUserViewStateMapper.upsertLastViewedAt(user.getId(), LocalDateTime.now());
        return Result.success();
    }

    private static final int MAX_SUPPLY_CART_LINES = 300;

    /** 领用购物车：GET /api/supplies/cart */
    public Result<Map<String, Object>> getShoppingCart(User user) {
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录");
        }
        String json = supplyUserCartMapper.findLinesJsonByUserId(user.getId());
        Map<String, Integer> lines = parseSupplyCartLinesJson(json);
        Map<String, Object> data = new HashMap<>();
        data.put("lines", lines);
        return Result.success(data);
    }

    /** 领用购物车：PUT /api/supplies/cart，body.lines 为 itemId -> qty */
    public Result<?> saveShoppingCart(User user, Map<String, Object> body) {
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录");
        }
        Object linesObj = body == null ? null : body.get("lines");
        Map<String, Integer> normalized = new LinkedHashMap<>();
        if (linesObj instanceof Map<?, ?> m) {
            int count = 0;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (count >= MAX_SUPPLY_CART_LINES) {
                    break;
                }
                String k = String.valueOf(e.getKey()).trim();
                long itemId;
                try {
                    itemId = Long.parseLong(k);
                } catch (NumberFormatException ex) {
                    continue;
                }
                if (itemId <= 0) {
                    continue;
                }
                int qty = parseNonNegativeInt(e.getValue());
                if (qty <= 0) {
                    continue;
                }
                normalized.put(String.valueOf(itemId), Math.min(qty, 999));
                count++;
            }
        }
        try {
            String json = objectMapper.writeValueAsString(normalized);
            supplyUserCartMapper.upsert(user.getId(), json);
            return Result.success();
        } catch (Exception e) {
            return Result.error("保存购物车失败");
        }
    }

    private Map<String, Integer> parseSupplyCartLinesJson(String json) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (!StringUtils.hasText(json)) {
            return out;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = objectMapper.readValue(json.trim(), Map.class);
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                String key = e.getKey() == null ? "" : e.getKey().trim();
                long itemId;
                try {
                    itemId = Long.parseLong(key);
                } catch (NumberFormatException ex) {
                    continue;
                }
                if (itemId <= 0) {
                    continue;
                }
                int qty = parseNonNegativeInt(e.getValue());
                if (qty > 0) {
                    out.put(String.valueOf(itemId), Math.min(qty, 999));
                }
            }
        } catch (Exception ignored) {
            /* ignore */
        }
        return out;
    }

    private static int parseNonNegativeInt(Object v) {
        if (v instanceof Number n) {
            return Math.max(0, n.intValue());
        }
        try {
            return Math.max(0, Integer.parseInt(String.valueOf(v).trim()));
        } catch (Exception e) {
            return 0;
        }
    }

    public List<SupplyItemView> listItemsForAdmin(Long categoryId) {
        return itemMapper.listAllForAdmin(categoryId).stream().map(this::toItemView).toList();
    }

    public Result<SupplyItemView> getItem(Long id) {
        SupplyItem it = itemMapper.findById(id);
        if (it == null) return Result.error("物资不存在");
        return Result.success(toItemView(it));
    }

    public Result<SupplyItemView> createItem(SupplyItemUpsertRequest req) {
        String err = validateItemUpsert(req, true);
        if (err != null) return Result.error(err);
        SupplyCategory cat = categoryMapper.findById(req.getCategoryId());
        if (cat == null) return Result.error("分类不存在");
        SupplyItem it = fromUpsert(req, null);
        itemMapper.insert(it);
        logOp("ITEM_UPSERT", "ITEM", String.valueOf(it.getId()), null, Map.of("action", "CREATE", "itemId", it.getId()));
        return Result.success(toItemView(itemMapper.findById(it.getId())));
    }

    public Result<SupplyItemView> updateItem(Long id, SupplyItemUpsertRequest req) {
        SupplyItem existing = itemMapper.findById(id);
        if (existing == null) return Result.error("物资不存在");
        String err = validateItemUpsert(req, false);
        if (err != null) return Result.error(err);
        if (req.getCategoryId() != null) {
            if (categoryMapper.findById(req.getCategoryId()) == null) return Result.error("分类不存在");
        }
        SupplyItem it = fromUpsert(req, existing);
        it.setId(id);
        Integer beforeStock = existing.getStockQty();
        Integer nextStock = it.getStockQty();
        boolean stockChanged = req.getStockQty() != null && !Objects.equals(beforeStock, nextStock);
        itemMapper.update(it);
        // 已存在物资仅在库存数量变更时记为“进货/补货”
        if (stockChanged) {
            itemMapper.touchInboundAt(id);
        }
        logOp("ITEM_UPSERT", "ITEM", String.valueOf(id), null, Map.of("action", "UPDATE", "itemId", id));
        return Result.success(toItemView(itemMapper.findById(id)));
    }

    public Result<?> deleteItem(Long id) {
        if (itemMapper.findById(id) == null) return Result.error("物资不存在");
        itemMapper.deleteById(id);
        logOp("ITEM_UPSERT", "ITEM", String.valueOf(id), null, Map.of("action", "DELETE", "itemId", id));
        return Result.success();
    }

    public Map<String, Object> listItemRecycle(int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        List<SupplyItemView> rows = itemMapper.listRecycle(s, offset).stream().map(this::toItemView).toList();
        Map<String, Object> data = new HashMap<>();
        data.put("data", rows);
        data.put("total", itemMapper.countRecycle());
        return data;
    }

    public Result<?> restoreItem(Long id) {
        int n = itemMapper.restoreById(id);
        if (n <= 0) return Result.error("恢复失败或物资不在回收站");
        logOp("ITEM_UPSERT", "ITEM", String.valueOf(id), null, Map.of("action", "RESTORE", "itemId", id));
        return Result.success();
    }

    public Result<?> purgeItem(Long id) {
        SupplyItem row = itemMapper.findRecycleById(id);
        if (row == null) return Result.error("回收站物资不存在");
        int n = itemMapper.hardDeleteById(id);
        if (n <= 0) return Result.error("彻底删除失败");
        logOp("ITEM_UPSERT", "ITEM", String.valueOf(id), null, Map.of("action", "PURGE", "itemId", id));
        return Result.success();
    }

    public Result<Map<String, Object>> purgeItems(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return Result.error("请选择要彻底删除的物资");
        int deleted = itemMapper.hardDeleteByIds(ids);
        logOp("ITEM_UPSERT", "ITEM", "BATCH", null, Map.of("action", "PURGE_BATCH", "count", deleted));
        return Result.success(Map.of("deleted", deleted));
    }

    public Result<Map<String, Object>> purgeAllItemsInRecycle() {
        List<SupplyItem> rows = itemMapper.listRecycle(2000, 0);
        if (rows.isEmpty()) return Result.success(Map.of("deleted", 0));
        List<Long> ids = rows.stream().map(SupplyItem::getId).toList();
        int deleted = itemMapper.hardDeleteByIds(ids);
        logOp("ITEM_UPSERT", "ITEM", "ALL", null, Map.of("action", "PURGE_ALL", "count", deleted));
        return Result.success(Map.of("deleted", deleted));
    }

    public Result<?> inbound(User operator, InboundSupplyRequest req) {
        if (req == null || req.getItemId() == null || req.getQty() == null || req.getQty() <= 0) {
            return Result.error("入库参数无效");
        }
        SupplyItem it = itemMapper.findById(req.getItemId());
        if (it == null) return Result.error("物资不存在");
        int before = it.getStockQty() == null ? 0 : it.getStockQty();
        if (MODE_QUANTIFIED.equals(it.getStockMode())) {
            itemMapper.increaseStock(it.getId(), req.getQty());
        } else if (MODE_FLAG.equals(it.getStockMode())) {
            SupplyItem patch = new SupplyItem();
            patch.setId(it.getId());
            patch.setCategoryId(it.getCategoryId());
            patch.setName(it.getName());
            patch.setSubtitle(it.getSubtitle());
            patch.setCoverUrl(it.getCoverUrl());
            patch.setShelfStatus(it.getShelfStatus());
            patch.setStockMode(it.getStockMode());
            patch.setStockQty(1);
            itemMapper.update(patch);
            itemMapper.touchInboundAt(it.getId());
        } else {
            return Result.error("未知库存模式");
        }
        it = itemMapper.findById(req.getItemId());
        int after = it.getStockQty() == null ? 0 : it.getStockQty();
        logOp("INBOUND", "ITEM", String.valueOf(req.getItemId()), operator == null ? null : operator.getId(),
                Map.of("qty", req.getQty(), "before", before, "after", after, "mode", it.getStockMode()));
        recordInventoryMovement("INBOUND", req.getItemId(), req.getQty(), after, null, null,
                operator == null ? null : operator.getId(), null, null);
        return Result.success(toItemView(it));
    }

    public Result<?> adjustStock(User operator, Long itemId, AdjustStockRequest req) {
        if (req == null || req.getNewQty() == null || req.getNewQty() < 0) {
            return Result.error("库存数量无效");
        }
        SupplyItem it = itemMapper.findById(itemId);
        if (it == null) return Result.error("物资不存在");
        if (!MODE_QUANTIFIED.equals(it.getStockMode())) {
            return Result.error("仅 QUANTIFIED 模式支持修改库存");
        }
        int before = it.getStockQty() == null ? 0 : it.getStockQty();
        itemMapper.adjustStock(itemId, req.getNewQty());
        itemMapper.touchInboundAt(itemId);
        logOp("STOCK_ADJUST", "ITEM", String.valueOf(itemId), operator == null ? null : operator.getId(),
                Map.of("before", before, "after", req.getNewQty()));
        int delta = req.getNewQty() - before;
        recordInventoryMovement("ADJUST", itemId, delta, req.getNewQty(), null, null,
                operator == null ? null : operator.getId(), null, "STOCK_ADJUST");
        return Result.success(toItemView(itemMapper.findById(itemId)));
    }

    /**
     * 校验并合并领用行（与新建领用单一致），返回待写入的明细（未含 orderId）。
     */
    private Result<List<SupplyClaimLine>> validateAndBuildClaimLines(CreateSupplyClaimRequest req) {
        if (req == null || req.getLines() == null || req.getLines().isEmpty()) {
            return Result.error("请选择至少一件物资");
        }
        Map<Long, Integer> merged = new LinkedHashMap<>();
        for (CreateSupplyClaimRequest.Line line : req.getLines()) {
            if (line == null || line.getItemId() == null || line.getQty() == null || line.getQty() <= 0) {
                return Result.error("领用行参数无效");
            }
            merged.merge(line.getItemId(), line.getQty(), Integer::sum);
        }
        List<SupplyClaimLine> toInsert = new ArrayList<>();
        for (Map.Entry<Long, Integer> e : merged.entrySet()) {
            SupplyItem it = itemMapper.findById(e.getKey());
            if (it == null) return Result.error("物资不存在: " + e.getKey());
            if (!SHELF_ON.equals(it.getShelfStatus())) {
                return Result.error("物资已下架: " + it.getName());
            }
            if (MODE_QUANTIFIED.equals(it.getStockMode())) {
                int stock = it.getStockQty() == null ? 0 : it.getStockQty();
                if (stock < e.getValue()) {
                    return Result.error("库存不足: " + it.getName());
                }
            } else if (MODE_FLAG.equals(it.getStockMode())) {
                int stock = it.getStockQty() == null ? 0 : it.getStockQty();
                if (stock < 1) {
                    return Result.error("暂无库存: " + it.getName());
                }
            } else {
                return Result.error("未知库存模式");
            }
            SupplyClaimLine cl = new SupplyClaimLine();
            cl.setItemId(e.getKey());
            cl.setQty(e.getValue());
            cl.setSnapshotName(it.getName());
            cl.setFulfilledQty(0);
            toInsert.add(cl);
        }
        return Result.success(toInsert);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<SupplyClaimOrderView> createClaim(User user, CreateSupplyClaimRequest req) {
        if (user == null) return Result.error("未登录");
        Result<List<SupplyClaimLine>> vr = validateAndBuildClaimLines(req);
        if (!Boolean.TRUE.equals(vr.getSuccess())) {
            return Result.error(vr.getMessage());
        }
        List<SupplyClaimLine> toInsert = vr.getData();
        String orderId = "SC_" + UUID.randomUUID().toString().replace("-", "");
        SupplyClaimOrder order = new SupplyClaimOrder();
        order.setId(orderId);
        order.setUserId(user.getId());
        order.setApplicantName(resolveDisplayName(user.getId()));
        order.setStatus("PENDING");
        order.setCreatedAt(LocalDateTime.now());
        claimOrderMapper.insert(order);
        for (SupplyClaimLine cl : toInsert) {
            cl.setOrderId(orderId);
            claimLineMapper.insert(cl);
        }
        logOp("ORDER_CREATE", "CLAIM_ORDER", orderId, user.getId(), Map.of("lineCount", toInsert.size()));
        publishClaimCreated(user, orderId, toInsert.size());
        return Result.success(toOrderView(claimOrderMapper.findById(orderId), true));
    }

    /**
     * 修订待出库领用单明细（覆盖行）：处理端可与申请人本人修订，校验与新建领用一致。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<SupplyClaimOrderView> revisePendingClaimLines(User actor, String orderId, CreateSupplyClaimRequest req) {
        if (actor == null) return Result.error("未登录");
        Result<List<SupplyClaimLine>> vr = validateAndBuildClaimLines(req);
        if (!Boolean.TRUE.equals(vr.getSuccess())) {
            return Result.error(vr.getMessage());
        }
        List<SupplyClaimLine> toInsert = vr.getData();
        SupplyClaimOrder locked = claimOrderMapper.findByIdForUpdate(orderId);
        if (locked == null) {
            return Result.error("领用单不存在");
        }
        if (!"PENDING".equals(locked.getStatus())) {
            return Result.error("仅待处理状态可修订明细");
        }
        boolean processor = canProcessClaims(actor);
        boolean owner = actor.getId() != null && actor.getId().equals(locked.getUserId());
        if (!processor && !owner) {
            return Result.error("无权限操作");
        }
        claimLineMapper.deleteByOrderId(orderId);
        for (SupplyClaimLine cl : toInsert) {
            cl.setOrderId(orderId);
            claimLineMapper.insert(cl);
        }
        logOp("ORDER_REVISE", "CLAIM_ORDER", orderId, actor.getId(), Map.of("lineCount", toInsert.size()));
        return Result.success(toOrderView(claimOrderMapper.findById(orderId), true));
    }

    public Result<?> withdraw(User user, String orderId) {
        if (user == null) return Result.error("未登录");
        SupplyClaimOrder o = claimOrderMapper.findById(orderId);
        if (o == null) return Result.error("领用单不存在");
        if (!user.getId().equals(o.getUserId())) return Result.error("仅本人可撤回");
        int n = claimOrderMapper.updateWithdrawn(orderId, user.getId());
        if (n == 0) return Result.error("仅待处理状态可撤回");
        logOp("ORDER_WITHDRAW", "CLAIM_ORDER", orderId, user.getId(), Map.of());
        return Result.success();
    }

    @Transactional
    public Result<?> deleteClaimOrder(User user, String orderId) {
        if (user == null) return Result.error("未登录");
        String oid = trimOrNull(orderId);
        if (!StringUtils.hasText(oid)) return Result.error("领用单号不能为空");
        SupplyClaimOrder order = claimOrderMapper.findByIdAny(oid);
        if (order == null) return Result.error("领用单不存在");
        if (order.getDeleted() != null && order.getDeleted() == 1) return Result.error("工单已在回收站");
        boolean canAdminDelete = canProcessClaims(user);
        boolean canSelfDelete = user.getId() != null && user.getId().equals(order.getUserId());
        if (!canAdminDelete && !canSelfDelete) return Result.error("无权限操作");
        int deleted = claimOrderMapper.deleteById(oid, user.getId(), LocalDateTime.now().plusDays(7));
        if (deleted <= 0) return Result.error("删除工单失败");
        logOp("ORDER_DELETE", "CLAIM_ORDER", oid, user.getId(), Map.of("status", str(order.getStatus())));
        return Result.success();
    }

    public Map<String, Object> listMyClaimRecycle(User user, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        List<SupplyClaimOrderView> rows = claimOrderMapper.listRecycleByUser(user.getId(), s, offset).stream()
                .map(o -> toOrderView(o, false))
                .toList();
        int total = claimOrderMapper.countRecycleByUser(user.getId());
        Map<String, Object> data = new HashMap<>();
        data.put("data", rows);
        data.put("total", total);
        return data;
    }

    public Result<?> restoreMyClaimOrder(User user, String orderId) {
        if (user == null) return Result.error("未登录");
        String oid = trimOrNull(orderId);
        if (!StringUtils.hasText(oid)) return Result.error("领用单号不能为空");
        SupplyClaimOrder row = claimOrderMapper.findRecycleByIdForUser(oid, user.getId());
        if (row == null) return Result.error("回收站工单不存在或无权限");
        int restored = claimOrderMapper.restoreById(oid);
        if (restored <= 0) return Result.error("恢复失败");
        return Result.success();
    }

    public Map<String, Object> listClaimRecycle(int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 200);
        int offset = (p - 1) * s;
        List<SupplyClaimOrderView> rows = claimOrderMapper.listRecycle(s, offset).stream().map(o -> toOrderView(o, false)).toList();
        Map<String, Object> data = new HashMap<>();
        data.put("data", rows);
        data.put("total", claimOrderMapper.countRecycle());
        return data;
    }

    public Result<?> restoreClaimOrder(String orderId) {
        String oid = trimOrNull(orderId);
        if (!StringUtils.hasText(oid)) return Result.error("领用单号不能为空");
        int restored = claimOrderMapper.restoreById(oid);
        if (restored <= 0) return Result.error("恢复失败或工单不在回收站");
        return Result.success();
    }

    @Transactional
    public Result<?> purgeClaimOrder(String orderId) {
        String oid = trimOrNull(orderId);
        if (!StringUtils.hasText(oid)) return Result.error("领用单号不能为空");
        int deleted = claimOrderMapper.hardDeleteById(oid);
        if (deleted <= 0) return Result.error("彻底删除失败");
        claimExportFileMapper.deleteByClaimId(oid);
        claimLineMapper.deleteByOrderId(oid);
        return Result.success();
    }

    @Transactional
    public Result<Map<String, Object>> purgeClaimOrders(List<String> ids) {
        if (ids == null || ids.isEmpty()) return Result.error("请选择要彻底删除的工单");
        List<String> validIds = ids.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .toList();
        if (validIds.isEmpty()) return Result.error("请选择要彻底删除的工单");
        int deleted = claimOrderMapper.hardDeleteByIds(validIds);
        validIds.forEach(id -> {
            claimExportFileMapper.deleteByClaimId(id);
            claimLineMapper.deleteByOrderId(id);
        });
        return Result.success(Map.of("deleted", deleted));
    }

    @Transactional
    public Result<Map<String, Object>> purgeAllClaimOrdersInRecycle() {
        List<SupplyClaimOrder> recycleRows = claimOrderMapper.listRecycle(5000, 0);
        if (recycleRows.isEmpty()) return Result.success(Map.of("deleted", 0));
        List<String> ids = recycleRows.stream().map(SupplyClaimOrder::getId).toList();
        int deleted = claimOrderMapper.hardDeleteByIds(ids);
        ids.forEach(id -> {
            claimExportFileMapper.deleteByClaimId(id);
            claimLineMapper.deleteByOrderId(id);
        });
        return Result.success(Map.of("deleted", deleted));
    }

    public Result<SupplyClaimOrderView> getClaimDetail(User user, String orderId) {
        SupplyClaimOrder o = claimOrderMapper.findById(orderId);
        if (o == null) return Result.error("领用单不存在");
        if (!canProcessClaims(user) && !user.getId().equals(o.getUserId())) {
            return Result.error("无权限查看");
        }
        return Result.success(toOrderView(o, true));
    }

    public List<SupplyClaimOrderView> listPendingTasks(User user) {
        if (capabilityPolicyService.canViewAllPending(user, BizDomains.SUPPLIES_CLAIM)) {
            return claimOrderMapper.listPendingAll().stream().map(o -> toOrderView(o, false)).toList();
        }
        return claimOrderMapper.listPendingByUser(user.getId()).stream().map(o -> toOrderView(o, false)).toList();
    }

    /**
     * 工作台「已处理」：最近出库/撤回的领用单；管理员看全量，非管理员仅本人。
     */
    public List<SupplyClaimOrderView> listRecentClosedClaims(User user, int limit) {
        int lim = Math.min(Math.max(limit, 1), 100);
        if (canProcessClaims(user)) {
            return claimOrderMapper.listRecentClosedAll(lim).stream().map(o -> toOrderView(o, false)).toList();
        }
        return claimOrderMapper.listRecentClosedByUser(user.getId(), lim).stream().map(o -> toOrderView(o, false)).toList();
    }

    public Map<String, Object> listMine(User user, String status, int page, int size) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        String st = StringUtils.hasText(status) ? status.trim().toUpperCase() : null;
        List<SupplyClaimOrderView> rows = claimOrderMapper.listMine(user.getId(), st, s, offset).stream()
                .map(o -> toOrderView(o, false))
                .toList();
        int total = claimOrderMapper.countMine(user.getId(), st);
        Map<String, Object> data = new HashMap<>();
        data.put("data", rows);
        data.put("total", total);
        return data;
    }

    /**
     * 按领用人与领用单「申请时间」筛选区间内的全部领用单（含明细），用于页面聚合展示与导出。
     * 超级管理员及以上可传 applicantUserId 代查他人；否则仅本人。
     */
    public Map<String, Object> listMineClaimsByCreatedRange(User user, LocalDate from, LocalDate to, String applicantUserIdParam) {
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        validateClaimDateRange(from, to);
        String targetUid = resolveTargetApplicantUserIdForRange(user, applicantUserIdParam);
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toExclusive = to.plusDays(1).atStartOfDay();
        int total = claimOrderMapper.countByUserCreatedBetween(targetUid, fromDt, toExclusive);
        if (total > CLAIM_RANGE_LIST_MAX_ORDERS) {
            throw new IllegalArgumentException("区间内领用单数量超过 " + CLAIM_RANGE_LIST_MAX_ORDERS + "，请缩小日期范围");
        }
        List<SupplyClaimOrder> orders = claimOrderMapper.listByUserCreatedBetween(
                targetUid, fromDt, toExclusive, CLAIM_RANGE_LIST_MAX_ORDERS, 0);
        List<SupplyClaimOrderView> rows = orders.stream().map(o -> toOrderView(o, true)).toList();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("from", from.toString());
        data.put("to", to.toString());
        data.put("applicantUserId", targetUid);
        data.put("applicantDisplayName", resolveClaimPersonDisplay(targetUid));
        data.put("total", total);
        data.put("data", rows);
        return data;
    }

    /**
     * 领用区间筛选：曾在领用单中出现过的申请人（展示昵称）。
     * 非超级管理员及以上仅返回本人一行。
     */
    public List<SupplyClaimApplicantOption> listClaimApplicantOptions(User user) {
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        if (!StringUtils.hasText(user.getId())) {
            throw new IllegalArgumentException("未登录");
        }
        String selfId = user.getId().trim();
        if (!isSuperAdminOrAbove(user)) {
            return Collections.singletonList(new SupplyClaimApplicantOption(selfId, resolveClaimPersonDisplay(selfId)));
        }
        List<String> rawIds = claimOrderMapper.listDistinctApplicantUserIds();
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        if (rawIds != null) {
            for (String id : rawIds) {
                String t = id != null ? id.trim() : "";
                if (StringUtils.hasText(t)) {
                    unique.add(t);
                }
            }
        }
        List<SupplyClaimApplicantOption> others = unique.stream()
                .filter((id) -> !selfId.equals(id))
                .map((id) -> new SupplyClaimApplicantOption(id, resolveClaimPersonDisplay(id)))
                .sorted(Comparator.comparing(
                        SupplyClaimApplicantOption::getDisplayName,
                        Comparator.nullsFirst(String.CASE_INSENSITIVE_ORDER)))
                .collect(Collectors.toList());
        List<SupplyClaimApplicantOption> out = new ArrayList<>();
        out.add(new SupplyClaimApplicantOption(selfId, resolveClaimPersonDisplay(selfId)));
        out.addAll(others);
        return out;
    }

    /** 导出「领用聚合明细」Excel（无库存列）；代查他人规则同 {@link #listMineClaimsByCreatedRange}。 */
    public byte[] exportPersonalClaimsRangeExcel(User user, LocalDate from, LocalDate to, String applicantUserIdParam) {
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        validateClaimDateRange(from, to);
        String targetUid = resolveTargetApplicantUserIdForRange(user, applicantUserIdParam);
        LocalDateTime fromDt = from.atStartOfDay();
        LocalDateTime toExclusive = to.plusDays(1).atStartOfDay();
        int total = claimOrderMapper.countByUserCreatedBetween(targetUid, fromDt, toExclusive);
        if (total > CLAIM_RANGE_LIST_MAX_ORDERS) {
            throw new IllegalArgumentException("区间内领用单数量超过 " + CLAIM_RANGE_LIST_MAX_ORDERS + "，请缩小日期范围");
        }
        List<SupplyClaimOrder> orders = claimOrderMapper.listByUserCreatedBetween(
                targetUid, fromDt, toExclusive, CLAIM_RANGE_LIST_MAX_ORDERS, 0);
        List<SupplyClaimOrderView> views = orders.stream().map(o -> toOrderView(o, true)).toList();
        String label = resolveClaimPersonDisplay(targetUid);
        return suppliesExcelExportService.buildPersonalClaimsAggregateSheet(from, to, label, views, this::resolveClaimPersonDisplay);
    }

    private void validateClaimDateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("请填写筛选开始与结束日期");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("筛选开始日期不能晚于结束日期");
        }
        long inclusiveDays = ChronoUnit.DAYS.between(from, to) + 1;
        if (inclusiveDays > CLAIM_RANGE_MAX_INCLUSIVE_DAYS) {
            throw new IllegalArgumentException("日期跨度不能超过 " + CLAIM_RANGE_MAX_INCLUSIVE_DAYS + " 天（含首尾日）");
        }
    }

    private String resolveTargetApplicantUserIdForRange(User user, String applicantUserIdParam) {
        if (!StringUtils.hasText(user.getId())) {
            throw new IllegalArgumentException("未登录");
        }
        String param = trimOrNull(applicantUserIdParam);
        if (!StringUtils.hasText(param)) {
            return user.getId();
        }
        if (user.getId().equals(param)) {
            return param;
        }
        if (!isSuperAdminOrAbove(user)) {
            throw new IllegalArgumentException("无权限代查他人领用记录（需超级管理员及以上）");
        }
        return param;
    }

    @Transactional
    public Result<Map<String, Object>> createOrReuseClaimPdfLink(User user, String claimId) {
        if (user == null) return Result.error("未登录");
        String cid = trimOrNull(claimId);
        if (!StringUtils.hasText(cid)) return Result.error("领用单号不能为空");
        SupplyClaimOrder order = claimOrderMapper.findById(cid);
        if (order == null) return Result.error("领用单不存在");
        if (!canProcessClaims(user) && !user.getId().equals(order.getUserId())) {
            return Result.error("无权限查看");
        }
        LocalDateTime now = LocalDateTime.now();
        claimExportFileMapper.markExpired(now);
        SupplyClaimExportFile reusable = claimExportFileMapper.selectLatestValid(cid, now);
        if (reusable != null) {
            return Result.success(toClaimExportLinkView(reusable, true));
        }
        byte[] pdf = buildClaimPdfBytes(order);
        String fileName = "SC_" + cid.replaceAll("[^A-Za-z0-9_-]", "") + "_" + now.format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmm")) + ".pdf";
        String storageKey = saveClaimPdfToLocal(fileName, pdf);
        SupplyClaimExportFile row = new SupplyClaimExportFile();
        row.setId("SCEF_" + UUID.randomUUID().toString().replace("-", ""));
        row.setClaimId(cid);
        row.setFileName(fileName);
        row.setStorageKey(storageKey);
        row.setStatus("READY");
        row.setSummaryText("领用单 " + cid + " / 状态 " + str(order.getStatus()));
        row.setDownloadToken(UUID.randomUUID().toString().replace("-", ""));
        row.setExpireAt(now.plusDays(7));
        row.setCreatedBy(user.getId());
        row.setCreatedTime(now);
        claimExportFileMapper.insert(row);
        return Result.success(toClaimExportLinkView(row, false));
    }

    public Result<Map<String, Object>> listClaimPdfLinks(User user, String claimId) {
        if (user == null) return Result.error("未登录");
        String cid = trimOrNull(claimId);
        if (!StringUtils.hasText(cid)) return Result.error("领用单号不能为空");
        SupplyClaimOrder order = claimOrderMapper.findById(cid);
        if (order == null) return Result.error("领用单不存在");
        if (!canProcessClaims(user) && !user.getId().equals(order.getUserId())) {
            return Result.error("无权限查看");
        }
        claimExportFileMapper.markExpired(LocalDateTime.now());
        List<Map<String, Object>> links = claimExportFileMapper.listByClaimId(cid, 20).stream()
                .map(row -> toClaimExportLinkView(row, false))
                .toList();
        return Result.success(Map.of("claimId", cid, "links", links));
    }

    @Transactional
    public Result<?> invalidateClaimPdfLink(User user, String claimId, String linkId) {
        if (user == null) return Result.error("未登录");
        String cid = trimOrNull(claimId);
        String lid = trimOrNull(linkId);
        if (!StringUtils.hasText(cid) || !StringUtils.hasText(lid)) {
            return Result.error("参数不能为空");
        }
        SupplyClaimOrder order = claimOrderMapper.findById(cid);
        if (order == null) return Result.error("领用单不存在");
        if (!canProcessClaims(user) && !user.getId().equals(order.getUserId())) {
            return Result.error("无权限操作");
        }
        List<SupplyClaimExportFile> links = claimExportFileMapper.listByClaimId(cid, 100);
        SupplyClaimExportFile target = links.stream()
                .filter(it -> lid.equals(it.getId()))
                .findFirst()
                .orElse(null);
        if (target == null) return Result.error("链接不存在");
        int updated = claimExportFileMapper.deleteById(lid);
        if (updated <= 0) {
            return Result.error("链接删除失败");
        }
        return Result.success();
    }

    public Result<Map<String, Object>> resolveClaimPdfDownload(String token) {
        if (!StringUtils.hasText(token)) return Result.error("下载令牌不能为空");
        LocalDateTime now = LocalDateTime.now();
        SupplyClaimExportFile row = claimExportFileMapper.findByToken(token.trim());
        if (row == null) return Result.error("下载链接不存在");
        if (!"READY".equalsIgnoreCase(str(row.getStatus()))) return Result.error("下载链接不可用，请重新生成");
        if (row.getExpireAt() == null || !row.getExpireAt().isAfter(now)) {
            claimExportFileMapper.markExpired(now);
            return Result.error("链接已过期，请重新生成");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("downloadUrl", resolvePublicUrl(row.getStorageKey()));
        data.put("fileName", row.getFileName());
        data.put("expireAt", row.getExpireAt());
        data.put("claimId", row.getClaimId());
        return Result.success(data);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<SupplyClaimOrderView> fulfill(User admin, String orderId, FulfillSupplyClaimRequest req) {
        if (admin == null) return Result.error("未登录");
        if (req == null || req.getLines() == null || req.getLines().isEmpty()) {
            return Result.error("请提交出库行");
        }
        SupplyClaimOrder locked = claimOrderMapper.findByIdForUpdate(orderId);
        if (locked == null) return Result.error("领用单不存在");
        if (!"PENDING".equals(locked.getStatus())) {
            return Result.error("订单非待处理状态");
        }
        List<SupplyClaimLine> dbLines = claimLineMapper.listByOrderId(orderId);
        Map<Long, FulfillSupplyClaimRequest.Line> byLineId = req.getLines().stream()
                .filter(l -> l != null && l.getLineId() != null)
                .collect(Collectors.toMap(FulfillSupplyClaimRequest.Line::getLineId, l -> l, (a, b) -> a));
        boolean anyGrant = false;
        Map<Long, Integer> outQtyByLine = new HashMap<>();
        for (SupplyClaimLine dl : dbLines) {
            FulfillSupplyClaimRequest.Line fl = byLineId.get(dl.getId());
            if (fl == null || !Boolean.TRUE.equals(fl.getGrant())) {
                continue;
            }
            int max = dl.getQty();
            int fq = fl.getFulfillQty() != null ? fl.getFulfillQty() : max;
            if (fq <= 0) continue;
            if (fq > max) fq = max;
            anyGrant = true;
            outQtyByLine.put(dl.getId(), fq);
        }
        if (!anyGrant) {
            return Result.error("请至少勾选一行同意发放");
        }
        for (SupplyClaimLine dl : dbLines) {
            Integer out = outQtyByLine.get(dl.getId());
            if (out == null) {
                claimLineMapper.updateFulfilledQty(dl.getId(), 0);
                continue;
            }
            SupplyItem it = itemMapper.findById(dl.getItemId());
            if (it == null) {
                throw new IllegalStateException("物资不存在: " + dl.getItemId());
            }
            if (MODE_QUANTIFIED.equals(it.getStockMode())) {
                int u = itemMapper.decreaseStockIfEnough(it.getId(), out);
                if (u == 0) {
                    throw new IllegalStateException("库存不足: " + it.getName());
                }
            }
            claimLineMapper.updateFulfilledQty(dl.getId(), out);
            SupplyItem itAfter = itemMapper.findById(dl.getItemId());
            int stockAfter = itAfter != null && itAfter.getStockQty() != null ? itAfter.getStockQty() : 0;
            recordInventoryMovement("OUTBOUND", dl.getItemId(), out, stockAfter, orderId, dl.getId(),
                    admin.getId(), locked.getUserId(), null);
        }
        int uo = claimOrderMapper.updateFulfilled(orderId, admin.getId(), LocalDateTime.now());
        if (uo == 0) {
            throw new IllegalStateException("更新订单状态失败");
        }
        Map<String, Object> detail = new HashMap<>();
        detail.put("orderId", orderId);
        detail.put("lines", outQtyByLine);
        detail.put("operator", admin.getId());
        logOp("ORDER_FULFILL", "CLAIM_ORDER", orderId, admin.getId(), detail);
        logOp("OUTBOUND", "CLAIM_ORDER", orderId, admin.getId(), detail);
        SupplyClaimOrder done = claimOrderMapper.findById(orderId);
        publishClaimFulfilled(admin, done, outQtyByLine.size());
        return Result.success(toOrderView(done, true));
    }

    public Map<String, Object> listOperationLogs(String opType, int page, int size) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        String ot = StringUtils.hasText(opType) ? opType.trim() : null;
        List<SupplyOperationLog> rows = operationLogMapper.listPaged(ot, s, offset);
        int total = operationLogMapper.countAll(ot);
        Map<String, Object> data = new HashMap<>();
        data.put("data", rows);
        data.put("total", total);
        return data;
    }

    private byte[] buildClaimPdfBytes(SupplyClaimOrder order) {
        List<SupplyClaimLine> lines = claimLineMapper.listByOrderId(order.getId());
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDFont font = loadPreferredFont(document);
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDPageContentStream stream = new PDPageContentStream(document, page);
            float y = 800f;
            y = writePdfLine(stream, font, 16f, 50f, y, "物资领用记录PDF");
            y -= 4f;
            y = writePdfLine(stream, font, 10f, 50f, y, "导出时间: " + LocalDateTime.now().format(PDF_TIME));
            y = writePdfLine(stream, font, 11f, 50f, y, "领用单号: " + str(order.getId()));
            y = writePdfLine(stream, font, 11f, 50f, y, "申请人: " + resolveDisplayName(order.getUserId()));
            y = writePdfLine(stream, font, 11f, 50f, y, "状态: " + str(order.getStatus()));
            y = writePdfLine(stream, font, 11f, 50f, y, "申请时间: " + formatTime(order.getCreatedAt()));
            if (order.getFulfilledAt() != null) {
                y = writePdfLine(stream, font, 11f, 50f, y, "完成时间: " + formatTime(order.getFulfilledAt()));
            }
            if (StringUtils.hasText(order.getFulfilledBy())) {
                y = writePdfLine(stream, font, 11f, 50f, y, "处理人: " + resolveDisplayName(order.getFulfilledBy()));
            }
            y -= 3f;
            y = writePdfLine(stream, font, 12f, 50f, y, "领用清单");
            for (SupplyClaimLine line : lines) {
                String text = "- " + str(line.getSnapshotName())
                        + " / 申请 " + (line.getQty() == null ? 0 : line.getQty())
                        + " / 实发 " + (line.getFulfilledQty() == null ? 0 : line.getFulfilledQty());
                y = writePdfLine(stream, font, 10f, 50f, y, text);
            }
            stream.close();
            document.save(output);
            return output.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("生成PDF失败: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> toClaimExportLinkView(SupplyClaimExportFile row, boolean reused) {
        LocalDateTime now = LocalDateTime.now();
        String status = str(row.getStatus());
        if ("READY".equalsIgnoreCase(status) && row.getExpireAt() != null && !row.getExpireAt().isAfter(now)) {
            status = "EXPIRED";
        }
        String path = "/api/supplies/claims/download/" + row.getDownloadToken();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.getId());
        out.put("claimId", row.getClaimId());
        out.put("fileName", row.getFileName());
        out.put("status", status);
        out.put("expireAt", row.getExpireAt());
        out.put("summaryText", str(row.getSummaryText()));
        out.put("downloadToken", row.getDownloadToken());
        out.put("downloadPath", path);
        out.put("downloadUrl", resolvePublicUrl(path));
        out.put("reused", reused);
        out.put("createdTime", row.getCreatedTime());
        return out;
    }

    private String saveClaimPdfToLocal(String fileName, byte[] content) {
        String dateDir = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String unique = UUID.randomUUID().toString().replace("-", "");
        String safeName = (StringUtils.hasText(fileName) ? fileName : "claim.pdf").replaceAll("[^A-Za-z0-9._-]", "_");
        String finalName = unique + "_" + safeName;
        try {
            Path dir = uploadFileService.resolveBaseDir().resolve(dateDir).normalize();
            Files.createDirectories(dir);
            Path target = dir.resolve(finalName).normalize();
            Files.write(target, content);
            return "/api/upload/files/" + dateDir + "/" + finalName;
        } catch (Exception e) {
            throw new IllegalStateException("保存PDF失败: " + e.getMessage(), e);
        }
    }

    private String resolvePublicUrl(String path) {
        if (!StringUtils.hasText(path)) return "";
        String rawPath = path.trim();
        if (rawPath.matches("(?i)^https?://.*")) return rawPath;
        String base = resolveApiBaseUrl();
        if (!StringUtils.hasText(base)) return rawPath;
        String normalizedBase = base.trim();
        if (normalizedBase.endsWith("/")) normalizedBase = normalizedBase.substring(0, normalizedBase.length() - 1);
        String normalizedPath = rawPath.startsWith("/") ? rawPath : "/" + rawPath;
        if (normalizedBase.endsWith("/api") && ("/api".equals(normalizedPath) || normalizedPath.startsWith("/api/"))) {
            return normalizedBase.substring(0, normalizedBase.length() - 4) + normalizedPath;
        }
        return normalizedBase + normalizedPath;
    }

    private String resolveApiBaseUrl() {
        String configured = trimOrNull(appPublicBaseUrl);
        if (configured != null && configured.matches("(?i)^https?://.*")) {
            return configured;
        }
        try {
            List<SystemConfigItem> network = notificationSettingsMapper.listConfigsByModule("network");
            String frontendApiBase = network.stream()
                    .filter(it -> "network.frontend.apiBaseUrl".equals(it.getConfigKey()))
                    .map(SystemConfigItem::getConfigValue)
                    .filter(StringUtils::hasText)
                    .map(String::trim)
                    .filter(v -> v.matches("(?i)^https?://.*"))
                    .findFirst()
                    .orElse(null);
            if (frontendApiBase != null) return frontendApiBase;
            String uploadBase = network.stream()
                    .filter(it -> "network.upload.publicBaseUrl".equals(it.getConfigKey()))
                    .map(SystemConfigItem::getConfigValue)
                    .filter(StringUtils::hasText)
                    .map(String::trim)
                    .filter(v -> v.matches("(?i)^https?://.*"))
                    .findFirst()
                    .orElse(null);
            if (uploadBase != null) {
                URI uri = URI.create(uploadBase);
                if (uri.getScheme() != null && uri.getAuthority() != null) {
                    return uri.getScheme() + "://" + uri.getAuthority() + "/api";
                }
            }
        } catch (Exception ignored) {
            // fallback to path when runtime config is unavailable
        }
        return null;
    }

    private String formatTime(LocalDateTime time) {
        if (time == null) return "";
        return time.format(PDF_TIME);
    }

    private PDFont loadPreferredFont(PDDocument document) throws IOException {
        String configured = trimOrNull(appPdfFontPath);
        if (configured != null) {
            PDFont loaded = loadCjkFontFromFile(document, new File(configured));
            if (loaded != null) return loaded;
        }
        try (InputStream in = getClass().getResourceAsStream("/fonts/NotoSansSC-Regular.otf")) {
            if (in != null) return PDType0Font.load(document, in, true);
        }
        for (String p : List.of(
                "C:/Windows/Fonts/msyh.ttc",
                "C:/Windows/Fonts/msyh.ttf",
                "C:/Windows/Fonts/simsun.ttc",
                "C:/Windows/Fonts/simsun.ttf"
        )) {
            PDFont loaded = loadCjkFontFromFile(document, new File(p));
            if (loaded != null) return loaded;
        }
        throw new IOException("未找到可用中文字体，请配置 app.pdf.font-path");
    }

    private PDFont loadCjkFontFromFile(PDDocument document, File file) throws IOException {
        if (file == null || !file.isFile()) return null;
        String name = file.getName().toLowerCase(Locale.ROOT);
        if (name.endsWith(".ttc")) {
            try (TrueTypeCollection collection = new TrueTypeCollection(file)) {
                List<TrueTypeFont> fonts = new ArrayList<>();
                collection.processAllFonts(fonts::add);
                if (!fonts.isEmpty()) {
                    return PDType0Font.load(document, fonts.get(0), true);
                }
            }
            return null;
        }
        if (name.endsWith(".ttf") || name.endsWith(".otf")) {
            try (FileInputStream in = new FileInputStream(file)) {
                return PDType0Font.load(document, in, true);
            }
        }
        return null;
    }

    private float writePdfLine(PDPageContentStream stream, PDFont font, float fontSize, float x, float y, String text) throws Exception {
        float safeY = Math.max(y, 50f);
        stream.beginText();
        stream.setFont(font, fontSize);
        stream.newLineAtOffset(x, safeY);
        stream.showText(sanitizePdfText(text));
        stream.endText();
        return safeY - 18f;
    }

    private String sanitizePdfText(String text) {
        if (text == null) return "";
        return text.replace('\r', ' ').replace('\n', ' ');
    }

    private String trimOrNull(String value) {
        if (!StringUtils.hasText(value)) return null;
        return value.trim();
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String resolveDisplayName(String userId) {
        return userDisplayNameService.resolveDisplayName(userId);
    }

    private void publishClaimCreated(User user, String orderId, int lineCount) {
        PublishNotificationEvent event = new PublishNotificationEvent();
        event.setEventType("CREATED");
        event.setBizType("SUPPLIES_CLAIM");
        event.setBizId(orderId);
        event.setSenderId(user.getId());
        event.setApplicantId(user.getId());
        event.setRelatedUserIds(validatedNotifyReceiverUserIds());
        Map<String, String> vars = new HashMap<>();
        vars.put("orderId", orderId);
        vars.put("bizId", orderId);
        vars.put("applicantName", resolveDisplayName(user.getId()));
        vars.put("summary", "共 " + lineCount + " 项物资");
        event.setVariables(vars);
        notificationService.publish(event);
    }

    /** 出库完成 → 申请人站内回执（与报修/采购办结同源：COMPLETED + SUPPLIES_CLAIM） */
    private void publishClaimFulfilled(User operator, SupplyClaimOrder order, int grantedLineKinds) {
        if (order == null || !StringUtils.hasText(order.getUserId())) {
            return;
        }
        PublishNotificationEvent event = new PublishNotificationEvent();
        event.setEventType("COMPLETED");
        event.setBizType("SUPPLIES_CLAIM");
        event.setBizId(order.getId());
        event.setSenderId(operator == null ? null : operator.getId());
        event.setApplicantId(order.getUserId());
        Map<String, String> vars = new HashMap<>();
        vars.put("orderId", order.getId());
        vars.put("bizId", order.getId());
        vars.put("applicantName", resolveDisplayName(order.getUserId()));
        int n = Math.max(grantedLineKinds, 1);
        vars.put("summary", "已出库 " + n + " 类物资");
        event.setVariables(vars);
        notificationService.publish(event);
    }

    /**
     * 系统配置中的接收人，支持英文逗号分隔多个 sys_user.id；仅加入存在且未禁用的用户。
     */
    private Set<String> validatedNotifyReceiverUserIds() {
        Set<String> related = new LinkedHashSet<>();
        for (String id : parseNotifyReceiverIdsFromConfig()) {
            User u = userMapper.findById(id);
            if (u != null && (u.getStatus() == null || u.getStatus() == 1)) {
                related.add(id);
            }
        }
        return related;
    }

    private List<String> parseNotifyReceiverIdsFromConfig() {
        List<String> out = new ArrayList<>();
        for (SystemConfigItem it : notificationSettingsMapper.listConfigsByModule("supplies")) {
            if (!"supply.claim.notifyReceiverUserId".equals(it.getConfigKey()) || !StringUtils.hasText(it.getConfigValue())) {
                continue;
            }
            for (String part : it.getConfigValue().split(",")) {
                String id = part.trim();
                if (StringUtils.hasText(id)) {
                    out.add(id);
                }
            }
        }
        return out;
    }

    private void logOp(String opType, String refType, String refId, String operatorId, Map<String, Object> detail) {
        SupplyOperationLog log = new SupplyOperationLog();
        log.setOpType(opType);
        log.setRefType(refType);
        log.setRefId(refId);
        log.setOperatorUserId(operatorId);
        try {
            log.setDetailJson(objectMapper.writeValueAsString(detail == null ? Map.of() : detail));
        } catch (Exception e) {
            log.setDetailJson("{}");
        }
        log.setCreatedAt(LocalDateTime.now());
        operationLogMapper.insert(log);
    }

    private SupplyCategoryView toCatView(SupplyCategory c) {
        if (c == null) return null;
        SupplyCategoryView v = new SupplyCategoryView();
        v.setId(c.getId());
        v.setName(c.getName());
        v.setSortOrder(c.getSortOrder());
        v.setStatus(c.getStatus());
        return v;
    }

    private SupplyItemView toItemView(SupplyItem it) {
        if (it == null) return null;
        SupplyItemView v = new SupplyItemView();
        v.setId(it.getId());
        v.setCategoryId(it.getCategoryId());
        v.setName(it.getName());
        v.setSubtitle(it.getSubtitle());
        v.setCoverUrl(it.getCoverUrl());
        v.setShelfStatus(it.getShelfStatus());
        v.setStockMode(it.getStockMode());
        v.setStockQty(it.getStockQty());
        v.setDeleted(it.getDeleted());
        v.setDeletedTime(it.getDeletedTime());
        v.setDeletedBy(it.getDeletedBy());
        v.setPurgeAfterTime(it.getPurgeAfterTime());
        v.setCreatedAt(it.getCreatedAt());
        v.setLastInboundAt(it.getLastInboundAt());
        return v;
    }

    private void applyNoveltyTags(String userId, List<SupplyItemView> rows) {
        if (rows == null || rows.isEmpty()) return;
        LocalDateTime now = LocalDateTime.now();
        for (SupplyItemView row : rows) {
            LocalDateTime createdAt = row.getCreatedAt();
            LocalDateTime inboundAt = row.getLastInboundAt();
            boolean isNewItem = shouldShowNovelty(createdAt, now);
            boolean isNewInbound = shouldShowNovelty(inboundAt, now);
            row.setIsNewItem(isNewItem);
            row.setIsNewInbound(isNewInbound);
            if (isNewInbound && isNewItem) {
                row.setNoveltyTag("新品!/进货!");
            } else if (isNewInbound) {
                row.setNoveltyTag("进货!");
            } else if (isNewItem) {
                row.setNoveltyTag("新品!");
            } else {
                row.setNoveltyTag("");
            }
        }
    }

    /**
     * 规则：新增/进货后连续提示 7 天，7 天后自动消失。
     */
    private boolean shouldShowNovelty(LocalDateTime eventAt, LocalDateTime now) {
        if (eventAt == null) return false;
        return eventAt.isAfter(now.minusDays(NOVELTY_KEEP_DAYS));
    }

    private int noveltyRank(SupplyItemView v) {
        if (Boolean.TRUE.equals(v.getIsNewInbound())) return 0;
        if (Boolean.TRUE.equals(v.getIsNewItem())) return 1;
        return 2;
    }

    private LocalDateTime latestNoveltyTime(SupplyItemView v) {
        if (Boolean.TRUE.equals(v.getIsNewInbound())) return v.getLastInboundAt();
        if (Boolean.TRUE.equals(v.getIsNewItem())) return v.getCreatedAt();
        return null;
    }

    private void recordInventoryMovement(String movementType, long itemId, int qty, int stockAfter,
                                         String claimId, Long claimLineId, String operatorUserId,
                                         String applicantUserId, String remark) {
        SupplyInventoryMovement m = new SupplyInventoryMovement();
        m.setItemId(itemId);
        m.setMovementType(movementType);
        m.setQty(qty);
        m.setStockAfter(stockAfter);
        m.setClaimId(claimId);
        m.setClaimLineId(claimLineId);
        m.setOperatorUserId(operatorUserId);
        m.setApplicantUserId(applicantUserId);
        m.setRemark(remark);
        m.setCreatedAt(LocalDateTime.now());
        supplyInventoryMovementMapper.insert(m);
    }

    /** 审计/按物品导出：物资管理员或领用处理权限 */
    public boolean canAuditInventory(User user) {
        return user != null && (isAdmin(user) || canProcessClaims(user));
    }

    public Result<Map<String, Object>> listAuditInventoryMovements(User user, long itemId, int page, int size) {
        if (user == null) {
            return Result.error("未登录");
        }
        if (!canAuditInventory(user)) {
            return Result.error("无权限");
        }
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        int total = supplyInventoryMovementMapper.countByItemId(itemId);
        List<SupplyInventoryMovementRowView> rows = supplyInventoryMovementMapper.listRowsByItemId(itemId, s, offset);
        for (SupplyInventoryMovementRowView row : rows) {
            row.setOperatorName(resolveDisplayName(row.getOperatorUserId()));
            row.setApplicantName(resolveDisplayName(row.getApplicantUserId()));
        }
        int restoredTotal = claimLineMapper.countFulfilledHistoryByItemId(itemId);
        List<SupplyAuditRestoredRow> restored = claimLineMapper.listFulfilledHistoryByItemId(itemId, s, offset);
        for (SupplyAuditRestoredRow rr : restored) {
            rr.setApplicantName(resolveDisplayName(rr.getApplicantUserId()));
            rr.setFulfilledByName(resolveDisplayName(rr.getFulfilledByUserId()));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("data", rows);
        data.put("total", total);
        data.put("restoredData", restored);
        data.put("restoredTotal", restoredTotal);
        return Result.success(data);
    }

    /** 有库存流水或已完成领用实发明细的物资 id，供审计页物品下拉优先展示 */
    public List<Long> listAuditItemIdsWithRecords(User user, Long categoryId) {
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        if (!canAuditInventory(user)) {
            throw new IllegalArgumentException("无权限");
        }
        return itemMapper.selectItemIdsHavingAuditRecords(categoryId);
    }

    /**
     * 领用人导出所选领用单（一单内全部物品）Excel。
     */
    public byte[] exportPersonalClaimExcel(User user, String claimId) {
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        String cid = trimOrNull(claimId);
        if (!StringUtils.hasText(cid)) {
            throw new IllegalArgumentException("领用单号不能为空");
        }
        SupplyClaimOrder order = claimOrderMapper.findById(cid);
        if (order == null) {
            throw new IllegalArgumentException("领用单不存在");
        }
        if (!canProcessClaims(user) && !user.getId().equals(order.getUserId())) {
            throw new IllegalArgumentException("无权限导出");
        }
        SupplyClaimOrderView view = toOrderView(order, true);
        List<SupplyClaimLineView> lines = view.getLines() == null ? List.of() : view.getLines();
        // 个人领用单导出无「当前库存」类列；该类列仅在按物品审计导出中存在。
        return suppliesExcelExportService.buildPersonalClaimSheet(view, lines, this::resolveClaimPersonDisplay);
    }

    /**
     * 领用导出等场景：优先账号「展示昵称」，与小程序/Web 个人中心展示对齐；否则再走人员库/用户名链路。
     */
    private String resolveClaimPersonDisplay(String userId) {
        if (!StringUtils.hasText(userId)) {
            return "";
        }
        User u = userMapper.findById(userId.trim());
        if (u != null && StringUtils.hasText(u.getDisplayNickname())) {
            return u.getDisplayNickname().trim();
        }
        return resolveDisplayName(userId);
    }

    /** 按物品导出审计流水 Excel（最多 10000 行） */
    public byte[] exportAuditItemExcel(User user, long itemId) {
        if (user == null) {
            throw new IllegalArgumentException("未登录");
        }
        if (!canAuditInventory(user)) {
            throw new IllegalArgumentException("无权限导出");
        }
        SupplyItem item = itemMapper.findById(itemId);
        if (item == null) {
            throw new IllegalArgumentException("物资不存在");
        }
        int cap = 10_000;
        List<SupplyInventoryMovementRowView> rows = supplyInventoryMovementMapper.listRowsByItemId(itemId, cap, 0);
        for (SupplyInventoryMovementRowView row : rows) {
            row.setOperatorName(resolveDisplayName(row.getOperatorUserId()));
            row.setApplicantName(resolveDisplayName(row.getApplicantUserId()));
        }
        List<SupplyAuditRestoredRow> restored = claimLineMapper.listFulfilledHistoryByItemId(itemId, cap, 0);
        return suppliesExcelExportService.buildAuditWorkbook(item.getName(), rows, restored, this::resolveDisplayName);
    }

    private SupplyClaimOrderView toOrderView(SupplyClaimOrder o, boolean withLines) {
        SupplyClaimOrderView v = new SupplyClaimOrderView();
        v.setId(o.getId());
        v.setUserId(o.getUserId());
        v.setApplicantName(resolveClaimPersonDisplay(o.getUserId()));
        v.setStatus(o.getStatus());
        v.setCreatedAt(o.getCreatedAt());
        v.setFulfilledAt(o.getFulfilledAt());
        v.setFulfilledBy(o.getFulfilledBy());
        v.setDeleted(o.getDeleted());
        v.setDeletedTime(o.getDeletedTime());
        v.setDeletedBy(o.getDeletedBy());
        v.setPurgeAfterTime(o.getPurgeAfterTime());
        if (StringUtils.hasText(o.getFulfilledBy())) {
            v.setFulfilledByName(resolveClaimPersonDisplay(o.getFulfilledBy()));
        }
        if (withLines) {
            v.setLines(claimLineMapper.listByOrderId(o.getId()).stream().map(this::toLineView).toList());
        }
        return v;
    }

    private SupplyClaimLineView toLineView(SupplyClaimLine l) {
        SupplyClaimLineView v = new SupplyClaimLineView();
        v.setId(l.getId());
        v.setItemId(l.getItemId());
        v.setQty(l.getQty());
        v.setSnapshotName(l.getSnapshotName());
        v.setFulfilledQty(l.getFulfilledQty());
        return v;
    }

    private String validateItemUpsert(SupplyItemUpsertRequest req, boolean isCreate) {
        if (req == null) return "参数无效";
        if (isCreate && (req.getCategoryId() == null || !StringUtils.hasText(req.getName()))) {
            return "分类与名称必填";
        }
        if (StringUtils.hasText(req.getStockMode())) {
            String m = req.getStockMode().trim().toUpperCase();
            if (!MODE_QUANTIFIED.equals(m) && !MODE_FLAG.equals(m)) {
                return "stockMode 无效";
            }
        }
        return null;
    }

    private SupplyItem fromUpsert(SupplyItemUpsertRequest req, SupplyItem existing) {
        SupplyItem it = existing == null ? new SupplyItem() : existing;
        if (req.getCategoryId() != null) it.setCategoryId(req.getCategoryId());
        if (StringUtils.hasText(req.getName())) it.setName(req.getName().trim());
        if (req.getSubtitle() != null) it.setSubtitle(req.getSubtitle());
        if (req.getCoverUrl() != null) it.setCoverUrl(req.getCoverUrl());
        if (StringUtils.hasText(req.getShelfStatus())) it.setShelfStatus(req.getShelfStatus().trim().toUpperCase());
        if (StringUtils.hasText(req.getStockMode())) it.setStockMode(req.getStockMode().trim().toUpperCase());
        if (req.getStockQty() != null) it.setStockQty(req.getStockQty());
        if (existing == null) {
            if (!StringUtils.hasText(it.getShelfStatus())) it.setShelfStatus(SHELF_ON);
            if (!StringUtils.hasText(it.getStockMode())) it.setStockMode(MODE_QUANTIFIED);
            if (it.getStockQty() == null) it.setStockQty(0);
        }
        return it;
    }
}

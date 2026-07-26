package com.example.demo.modules.supplies.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.supplies.dto.*;
import com.example.demo.modules.supplies.entity.*;
import com.example.demo.modules.supplies.mapper.*;
import com.fasterxml.jackson.core.type.TypeReference;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(SuppliesService.class);
    private static final String SHELF_ON = "ON_SHELF";
    private static final String MODE_QUANTIFIED = "QUANTIFIED";
    private static final String MODE_FLAG = "FLAG";
    /** 独立成单：一次提交中最多允许拆出的独立领用单数量（防滥用） */
    private static final int MAX_INDEPENDENT_SPLITS = 10;
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
    private final PushService pushService;
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
                           CapabilityPolicyService capabilityPolicyService,
                           PushService pushService) {
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
        this.pushService = pushService;
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
        // 全部分栏：新品/进货全局置顶；单分类：仅在该分类内置顶（仍按分类 sortOrder 由 SQL 筛出）
        final boolean allCategories = categoryId == null;
        views.sort((a, b) -> {
            int rankCmp = Integer.compare(noveltyRank(a), noveltyRank(b));
            if (rankCmp != 0) return rankCmp;
            LocalDateTime at = latestNoveltyTime(a);
            LocalDateTime bt = latestNoveltyTime(b);
            if (at != null && bt != null) {
                int timeCmp = bt.compareTo(at);
                if (timeCmp != 0) return timeCmp;
            } else if (at != null) {
                return -1;
            } else if (bt != null) {
                return 1;
            }
            if (allCategories) {
                int catCmp = Long.compare(
                        a.getCategoryId() == null ? 0L : a.getCategoryId(),
                        b.getCategoryId() == null ? 0L : b.getCategoryId());
                if (catCmp != 0) return catCmp;
            }
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

    /**
     * 校验购物车行键：纯数字 itemId（"42"）或规格组合键（"42::尺寸=M|颜色=红"）。
     * 合法时返回去除首尾空白的原键（保留规格后缀），非法返回 null。
     */
    private static String normalizeCartLineKey(Object rawKey) {
        String k = rawKey == null ? "" : String.valueOf(rawKey).trim();
        if (k.isEmpty()) {
            return null;
        }
        int sep = k.indexOf("::");
        String idPart = sep >= 0 ? k.substring(0, sep) : k;
        long itemId;
        try {
            itemId = Long.parseLong(idPart.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
        if (itemId <= 0) {
            return null;
        }
        return k;
    }

    /** 领用购物车：PUT /api/supplies/cart，body.lines 为 cartKey(itemId 或 itemId::规格) -> qty */
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
                String key = normalizeCartLineKey(e.getKey());
                if (key == null) {
                    continue;
                }
                int qty = parseNonNegativeInt(e.getValue());
                if (qty <= 0) {
                    continue;
                }
                normalized.put(key, Math.min(qty, 999));
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
                String key = normalizeCartLineKey(e.getKey());
                if (key == null) {
                    continue;
                }
                int qty = parseNonNegativeInt(e.getValue());
                if (qty > 0) {
                    out.put(key, Math.min(qty, 999));
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

    public Result<SupplyItemView> createItem(User operator, SupplyItemUpsertRequest req) {
        String err = validateItemUpsert(req, true);
        if (err != null) return Result.error(err);
        SupplyCategory cat = categoryMapper.findById(req.getCategoryId());
        if (cat == null) return Result.error("分类不存在");
        SupplyItem it = fromUpsert(req, null);
        itemMapper.insert(it);
        // 新建物资时填入的初始库存本质是一次入库，计入库存流水
        int initialQty = it.getStockQty() != null ? it.getStockQty() : 0;
        if (initialQty > 0 && MODE_QUANTIFIED.equals(it.getStockMode())) {
            recordInventoryMovement("INBOUND", it.getId(), initialQty, initialQty, null, null,
                    operator != null ? operator.getId() : null, null, "新建物资初始库存");
        }
        logOp("ITEM_UPSERT", "ITEM", String.valueOf(it.getId()), operator != null ? operator.getId() : null,
                Map.of("action", "CREATE", "itemId", it.getId(), "initialQty", initialQty));
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
        String beforeMode = existing.getStockMode();
        SupplyItem it = fromUpsert(req, existing);
        it.setId(id);
        Integer beforeStock = existing.getStockQty();
        Integer nextStock = it.getStockQty();
        boolean stockChanged = req.getStockQty() != null && !Objects.equals(beforeStock, nextStock);
        boolean modeFlippedToFlag = MODE_QUANTIFIED.equals(beforeMode) && MODE_FLAG.equals(it.getStockMode());
        itemMapper.update(it);
        // 已存在物资仅在库存数量变更时记为“进货/补货”
        if (stockChanged) {
            itemMapper.touchInboundAt(id);
        }
        // QUANTIFIED → FLAG 切换必须清零 locked_qty：所有加锁/释放 SQL 均带 stock_mode='QUANTIFIED'
        // 自守卫，切走后残留的 locked_qty 无法被任何路径释放；一旦再切回 QUANTIFIED，这些“幽灵锁定”
        // 会永久压低可用库存。切到 FLAG 后待处理领用不再跟踪锁定，属可接受行为（FLAG 无数量语义）。
        if (modeFlippedToFlag) {
            itemMapper.resetLockedQty(id);
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

    /** 校验通过的领用行 + 涉及物品缓存（供独立成单拆分复用，避免重复查询） */
    private static final class ValidatedClaimLines {
        final List<SupplyClaimLine> lines;
        final Map<Long, SupplyItem> itemById;

        ValidatedClaimLines(List<SupplyClaimLine> lines, Map<Long, SupplyItem> itemById) {
            this.lines = lines;
            this.itemById = itemById;
        }
    }

    /**
     * 校验并合并领用行（与新建领用单一致），返回待写入的明细（未含 orderId）。
     * 合并键为「物品 + 规格快照（规范化）」：同一物品的不同规格变体各自独立成行，不再合并覆盖。
     */
    private Result<ValidatedClaimLines> validateAndBuildClaimLines(CreateSupplyClaimRequest req) {
        // 新建领用：无既有锁定可抵扣，空 credit 与旧行为完全一致
        return validateAndBuildClaimLines(req, Map.of());
    }

    /**
     * @param lockCredit 当前操作单自身已持有的锁定量（itemId → 数量，仅 QUANTIFIED）。
     *                   修订/合并场景下 locked_qty 里包含本单旧行的预占，预检可用量时需抵扣回来，
     *                   否则持有末位库存的单会误报「库存不足」。真正的强制校验仍由释放旧锁后的
     *                   lockStockIfAvailable 原子守卫完成，此处仅消除预检的自我重复计数。
     */
    private Result<ValidatedClaimLines> validateAndBuildClaimLines(CreateSupplyClaimRequest req,
                                                                   Map<Long, Integer> lockCredit) {
        if (req == null || req.getLines() == null || req.getLines().isEmpty()) {
            return Result.error("请选择至少一件物资");
        }
        Map<String, Integer> mergedQtyByKey = new LinkedHashMap<>();
        Map<String, Long> itemIdByKey = new LinkedHashMap<>();
        Map<String, String> remarkByKey = new LinkedHashMap<>();
        Map<String, String> specSnapshotByKey = new LinkedHashMap<>();
        for (CreateSupplyClaimRequest.Line line : req.getLines()) {
            if (line == null || line.getItemId() == null || line.getQty() == null || line.getQty() <= 0) {
                return Result.error("领用行参数无效");
            }
            // 规格快照先规范化（键排序）再参与合并键与落库：Web 端按 schema 维度顺序、小程序按键序
            // 序列化，同一逻辑规格才不会因字符串不同而拆成两行
            String spec = line.getSpecSnapshot() != null && !line.getSpecSnapshot().trim().isEmpty()
                    ? canonicalizeSpecSnapshot(line.getSpecSnapshot()) : "";
            String key = line.getItemId() + "||" + spec;
            mergedQtyByKey.merge(key, line.getQty(), Integer::sum);
            itemIdByKey.put(key, line.getItemId());
            if (!spec.isEmpty()) {
                specSnapshotByKey.put(key, spec);
            }
            if (line.getRemark() != null && !line.getRemark().trim().isEmpty()) {
                remarkByKey.put(key, line.getRemark().trim());
            }
        }
        // 库存校验按物品聚合全部规格变体的申请总量
        Map<Long, Integer> totalQtyByItem = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> e : mergedQtyByKey.entrySet()) {
            totalQtyByItem.merge(itemIdByKey.get(e.getKey()), e.getValue(), Integer::sum);
        }
        Map<Long, SupplyItem> itemById = new LinkedHashMap<>();
        for (Map.Entry<Long, Integer> e : totalQtyByItem.entrySet()) {
            SupplyItem it = itemMapper.findById(e.getKey());
            if (it == null) return Result.error("物资不存在: " + e.getKey());
            if (!SHELF_ON.equals(it.getShelfStatus())) {
                return Result.error("物资已下架: " + it.getName());
            }
            if (MODE_QUANTIFIED.equals(it.getStockMode())) {
                int stock = it.getStockQty() == null ? 0 : it.getStockQty();
                int locked = it.getLockedQty() == null ? 0 : it.getLockedQty();
                int credit = lockCredit.getOrDefault(e.getKey(), 0);
                int available = Math.max(0, stock - locked + credit);
                if (available < e.getValue()) {
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
            itemById.put(e.getKey(), it);
        }
        List<SupplyClaimLine> toInsert = new ArrayList<>();
        for (Map.Entry<String, Integer> e : mergedQtyByKey.entrySet()) {
            Long itemId = itemIdByKey.get(e.getKey());
            SupplyItem it = itemById.get(itemId);
            String specSnapshot = specSnapshotByKey.get(e.getKey());
            if (it.getSpecRequired() != null && it.getSpecRequired() == 1) {
                if (specSnapshot == null || specSnapshot.isBlank()) {
                    throw new TwinBusinessException(ErrorCodeConstants.MATERIAL_SPEC_REQUIRED, "该物品需要选择完整规格");
                }
            }
            SupplyClaimLine cl = new SupplyClaimLine();
            cl.setItemId(itemId);
            cl.setQty(e.getValue());
            cl.setSnapshotName(it.getName());
            cl.setFulfilledQty(0);
            cl.setRemark(remarkByKey.get(e.getKey()));
            cl.setSpecSnapshot(specSnapshot);
            toInsert.add(cl);
        }
        return Result.success(new ValidatedClaimLines(toInsert, itemById));
    }

    /**
     * 独立成单拆分：independentOrder=1 的物品必须单独成单。
     * 返回按单分组的明细：常规物品合为第一组（如有），每个独立成单物品各自一组
     * （同一独立物品的多个规格变体行保持在同一单内）。
     */
    private Result<List<List<SupplyClaimLine>>> splitLinesByIndependentOrder(List<SupplyClaimLine> lines,
                                                                             Map<Long, SupplyItem> itemById) {
        List<SupplyClaimLine> regular = new ArrayList<>();
        Map<Long, List<SupplyClaimLine>> independentByItem = new LinkedHashMap<>();
        for (SupplyClaimLine cl : lines) {
            SupplyItem it = itemById.get(cl.getItemId());
            if (it != null && it.getIndependentOrder() != null && it.getIndependentOrder() == 1) {
                independentByItem.computeIfAbsent(cl.getItemId(), k -> new ArrayList<>()).add(cl);
            } else {
                regular.add(cl);
            }
        }
        if (independentByItem.size() > MAX_INDEPENDENT_SPLITS) {
            return Result.error("独立下单物资最多 " + MAX_INDEPENDENT_SPLITS + " 种，请分批提交");
        }
        List<List<SupplyClaimLine>> groups = new ArrayList<>();
        if (!regular.isEmpty()) {
            groups.add(regular);
        }
        groups.addAll(independentByItem.values());
        return Result.success(groups);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<SupplyClaimOrderView> createClaim(User user, CreateSupplyClaimRequest req) {
        if (user == null) return Result.error("未登录");
        Result<ValidatedClaimLines> vr = validateAndBuildClaimLines(req);
        if (!Boolean.TRUE.equals(vr.getSuccess())) {
            return Result.error(vr.getMessage());
        }
        Result<List<List<SupplyClaimLine>>> sr = splitLinesByIndependentOrder(vr.getData().lines, vr.getData().itemById);
        if (!Boolean.TRUE.equals(sr.getSuccess())) {
            return Result.error(sr.getMessage());
        }
        List<List<SupplyClaimLine>> groups = sr.getData();
        List<String> orderIds = new ArrayList<>();
        List<Integer> lineCounts = new ArrayList<>();
        for (List<SupplyClaimLine> group : groups) {
            String orderId = "SC_" + UUID.randomUUID().toString().replace("-", "");
            SupplyClaimOrder order = new SupplyClaimOrder();
            order.setId(orderId);
            order.setUserId(user.getId());
            order.setApplicantName(resolveDisplayName(user.getId()));
            order.setStatus("PENDING");
            order.setCreatedAt(LocalDateTime.now());
            claimOrderMapper.insert(order);
            for (SupplyClaimLine cl : group) {
                cl.setOrderId(orderId);
                claimLineMapper.insert(cl);
                lockClaimLineStockOrThrow(vr.getData().itemById, cl);
            }
            logOp("ORDER_CREATE", "CLAIM_ORDER", orderId, user.getId(),
                    Map.of("lineCount", group.size(), "splitCount", groups.size()));
            orderIds.add(orderId);
            lineCounts.add(group.size());
        }
        // 全部写入完成后再统一发通知，避免中途失败回滚时已推送通知
        for (int i = 0; i < orderIds.size(); i++) {
            publishClaimCreated(user, orderIds.get(i), lineCounts.get(i));
        }
        SupplyClaimOrderView view = toOrderView(claimOrderMapper.findById(orderIds.get(0)), true);
        if (orderIds.size() > 1) {
            view.setSplitCount(orderIds.size());
            view.setSplitOrderIds(new ArrayList<>(orderIds.subList(1, orderIds.size())));
        }
        return Result.success(view);
    }

    /**
     * 修订待出库领用单明细（覆盖行）：处理端可与申请人本人修订，校验与新建领用一致。
     * 独立成单物品同样拆分：常规行（或第一组）覆盖当前单，其余独立成单物品各自新建领用单。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<SupplyClaimOrderView> revisePendingClaimLines(User actor, String orderId, CreateSupplyClaimRequest req) {
        if (actor == null) return Result.error("未登录");
        // 先锁单行再校验：credit 抵扣依赖本单旧行快照，必须在行锁保护下读取，
        // 避免校验期间旧行被并发出库/撤回释放导致抵扣口径失真
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
        // 本单旧行仍占着 locked_qty，预检可用量时把自己占用的部分抵扣回来（仅 QUANTIFIED），
        // 否则持有末位库存的单修订/合并会被自己的锁定误判为「库存不足」
        List<SupplyClaimLine> oldLines = claimLineMapper.listByOrderId(orderId);
        Map<Long, Integer> lockCredit = new LinkedHashMap<>();
        for (SupplyClaimLine oldLine : oldLines) {
            if (oldLine == null || oldLine.getItemId() == null) continue;
            int qty = oldLine.getQty() == null ? 0 : oldLine.getQty();
            if (qty <= 0) continue;
            SupplyItem oldItem = itemMapper.findById(oldLine.getItemId());
            if (oldItem != null && MODE_QUANTIFIED.equals(oldItem.getStockMode())) {
                lockCredit.merge(oldLine.getItemId(), qty, Integer::sum);
            }
        }
        Result<ValidatedClaimLines> vr = validateAndBuildClaimLines(req, lockCredit);
        if (!Boolean.TRUE.equals(vr.getSuccess())) {
            return Result.error(vr.getMessage());
        }
        Result<List<List<SupplyClaimLine>>> sr = splitLinesByIndependentOrder(vr.getData().lines, vr.getData().itemById);
        if (!Boolean.TRUE.equals(sr.getSuccess())) {
            return Result.error(sr.getMessage());
        }
        List<List<SupplyClaimLine>> groups = sr.getData();
        // 覆盖写阶段（释放旧锁 → 删旧行 → 插新行并原子锁定）由修订与智能合并共用
        List<SupplyClaimLine> keepLines = groups.get(0);
        applyOrderLinesRewrite(locked, oldLines, keepLines, vr.getData().itemById);
        logOp("ORDER_REVISE", "CLAIM_ORDER", orderId, actor.getId(),
                Map.of("lineCount", keepLines.size(), "splitCount", groups.size()));
        List<String> spawnedOrderIds = new ArrayList<>();
        List<Integer> spawnedLineCounts = new ArrayList<>();
        for (int i = 1; i < groups.size(); i++) {
            List<SupplyClaimLine> group = groups.get(i);
            String newOrderId = "SC_" + UUID.randomUUID().toString().replace("-", "");
            SupplyClaimOrder newOrder = new SupplyClaimOrder();
            newOrder.setId(newOrderId);
            newOrder.setUserId(locked.getUserId());
            newOrder.setApplicantName(resolveDisplayName(locked.getUserId()));
            newOrder.setStatus("PENDING");
            newOrder.setCreatedAt(LocalDateTime.now());
            claimOrderMapper.insert(newOrder);
            for (SupplyClaimLine cl : group) {
                cl.setOrderId(newOrderId);
                claimLineMapper.insert(cl);
                lockClaimLineStockOrThrow(vr.getData().itemById, cl);
            }
            logOp("ORDER_CREATE", "CLAIM_ORDER", newOrderId, actor.getId(),
                    Map.of("lineCount", group.size(), "splitFrom", orderId));
            spawnedOrderIds.add(newOrderId);
            spawnedLineCounts.add(group.size());
        }
        // 全部写入完成后再统一发通知；拆分新单的申请人为原单归属人（locked.userId），发送人为操作者
        for (int i = 0; i < spawnedOrderIds.size(); i++) {
            publishClaimCreated(actor.getId(), locked.getUserId(), spawnedOrderIds.get(i), spawnedLineCounts.get(i));
        }
        SupplyClaimOrderView view = toOrderView(claimOrderMapper.findById(orderId), true);
        if (!spawnedOrderIds.isEmpty()) {
            view.setSplitCount(spawnedOrderIds.size() + 1);
            view.setSplitOrderIds(spawnedOrderIds);
        }
        return Result.success(view);
    }

    /**
     * 修订/智能合并共用的行覆盖写阶段：释放旧行锁定 → 删除旧行 → 插入新行并逐行原子锁定
     * （lockStockIfAvailable 失败抛异常触发整个事务回滚）。
     * 调用前必须已通过 findByIdForUpdate 持有该单行锁，且 newLines 已经过校验与组合键合并。
     */
    private void applyOrderLinesRewrite(SupplyClaimOrder locked,
                                        List<SupplyClaimLine> oldLines,
                                        List<SupplyClaimLine> newLines,
                                        Map<Long, SupplyItem> itemById) {
        // 覆盖前先释放原明细行的锁定（同事务内，失败回滚可恢复）
        for (SupplyClaimLine oldLine : oldLines) {
            releaseClaimLineLock(oldLine);
        }
        claimLineMapper.deleteByOrderId(locked.getId());
        for (SupplyClaimLine cl : newLines) {
            cl.setOrderId(locked.getId());
            claimLineMapper.insert(cl);
            lockClaimLineStockOrThrow(itemById, cl);
        }
    }

    /** 既有明细行转回购物车行输入，供合并时与新行一起走同一套校验/组合键求和逻辑 */
    private CreateSupplyClaimRequest.Line toLineInput(SupplyClaimLine l) {
        CreateSupplyClaimRequest.Line line = new CreateSupplyClaimRequest.Line();
        line.setItemId(l.getItemId());
        line.setQty(l.getQty());
        line.setRemark(l.getRemark());
        line.setSpecSnapshot(l.getSpecSnapshot());
        return line;
    }

    /**
     * 智能合并提交：购物车行按独立下单规则拆组后，指定了目标的组并入本人对应的待处理单
     * （同物品同规格快照的行数量求和为一行），未指定目标的组各自新建工单。
     * 目标匹配规则：常规组只能并入不含独立下单物资的待处理单；独立物资 X 只能并入
     * 「全部行均为 X 且 X 为独立下单」的待处理单。全部校验通过后才开始写入。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<Map<String, Object>> mergeSubmit(User user, SupplyMergeSubmitRequest req) {
        if (user == null || !StringUtils.hasText(user.getId())) {
            return Result.error("未登录");
        }
        if (req == null || req.getLines() == null || req.getLines().isEmpty()) {
            return Result.error("请选择至少一件物资");
        }
        String regularTargetId = trimOrNull(req.getRegularTargetOrderId());
        Map<Long, String> independentTargets = new LinkedHashMap<>();
        if (req.getIndependentTargets() != null) {
            for (Map.Entry<Long, String> e : req.getIndependentTargets().entrySet()) {
                String oid = e.getValue() == null ? null : e.getValue().trim();
                if (e.getKey() != null && StringUtils.hasText(oid)) {
                    independentTargets.put(e.getKey(), oid);
                }
            }
        }
        // —— 阶段一：按单号排序逐一行锁全部目标单（固定加锁顺序避免并发合并互相死锁），
        //    findByIdForUpdate 自带 deleted=0 过滤，再校验状态与归属
        SortedSet<String> targetIds = new TreeSet<>();
        if (regularTargetId != null) {
            targetIds.add(regularTargetId);
        }
        targetIds.addAll(independentTargets.values());
        Map<String, SupplyClaimOrder> lockedOrderById = new LinkedHashMap<>();
        Map<String, List<SupplyClaimLine>> existingLinesByOrder = new LinkedHashMap<>();
        for (String oid : targetIds) {
            SupplyClaimOrder locked = claimOrderMapper.findByIdForUpdate(oid);
            if (locked == null) {
                return Result.error("目标工单不存在或已删除: " + oid);
            }
            if (!"PENDING".equals(locked.getStatus())) {
                return Result.error("目标工单已被处理，无法合并: " + oid);
            }
            if (!user.getId().equals(locked.getUserId())) {
                return Result.error("仅本人的待处理工单可合并: " + oid);
            }
            lockedOrderById.put(oid, locked);
            existingLinesByOrder.put(oid, claimLineMapper.listByOrderId(oid));
        }
        // —— 阶段二：目标单按独立下单规则分类，并与请求声明比对（不匹配即拒绝，尚未写入）
        Map<Long, SupplyItem> targetItemCache = new HashMap<>();
        Map<String, Boolean> targetHasIndependent = new LinkedHashMap<>();
        Map<String, Long> targetSoleIndependentItem = new LinkedHashMap<>();
        for (String oid : targetIds) {
            boolean hasIndependent = false;
            Set<Long> distinctItemIds = new LinkedHashSet<>();
            for (SupplyClaimLine l : existingLinesByOrder.get(oid)) {
                if (l == null || l.getItemId() == null) continue;
                distinctItemIds.add(l.getItemId());
                SupplyItem it = targetItemCache.computeIfAbsent(l.getItemId(), itemMapper::findById);
                if (it != null && it.getIndependentOrder() != null && it.getIndependentOrder() == 1) {
                    hasIndependent = true;
                }
            }
            targetHasIndependent.put(oid, hasIndependent);
            // 独立单判定：全部行为同一物品且该物品独立下单（混合遗留单两者皆非，不可作目标）
            targetSoleIndependentItem.put(oid,
                    hasIndependent && distinctItemIds.size() == 1 ? distinctItemIds.iterator().next() : null);
        }
        if (regularTargetId != null && Boolean.TRUE.equals(targetHasIndependent.get(regularTargetId))) {
            return Result.error("目标工单包含独立下单物资，无法作为常规合并目标");
        }
        for (Map.Entry<Long, String> e : independentTargets.entrySet()) {
            Long sole = targetSoleIndependentItem.get(e.getValue());
            if (sole == null || !sole.equals(e.getKey())) {
                return Result.error("目标工单不是该物资的独立下单工单，无法合并: " + e.getValue());
            }
        }
        // —— 阶段三：整车预检。credit = 全部目标单既有行（QUANTIFIED），这些锁定在各自
        //    合并重写时会先释放再连同新行重锁，预检抵扣回来避免自我重复计数；
        //    真正的强制校验由重写阶段的 lockStockIfAvailable 原子守卫完成
        Map<Long, Integer> lockCredit = new LinkedHashMap<>();
        for (String oid : targetIds) {
            for (SupplyClaimLine l : existingLinesByOrder.get(oid)) {
                if (l == null || l.getItemId() == null) continue;
                int qty = l.getQty() == null ? 0 : l.getQty();
                if (qty <= 0) continue;
                SupplyItem it = targetItemCache.computeIfAbsent(l.getItemId(), itemMapper::findById);
                if (it != null && MODE_QUANTIFIED.equals(it.getStockMode())) {
                    lockCredit.merge(l.getItemId(), qty, Integer::sum);
                }
            }
        }
        CreateSupplyClaimRequest cartReq = new CreateSupplyClaimRequest();
        cartReq.setLines(req.getLines());
        Result<ValidatedClaimLines> vr = validateAndBuildClaimLines(cartReq, lockCredit);
        if (!Boolean.TRUE.equals(vr.getSuccess())) {
            return Result.error(vr.getMessage());
        }
        Result<List<List<SupplyClaimLine>>> sr = splitLinesByIndependentOrder(vr.getData().lines, vr.getData().itemById);
        if (!Boolean.TRUE.equals(sr.getSuccess())) {
            return Result.error(sr.getMessage());
        }
        // —— 阶段四：分组归位（常规组 / 独立组按 itemId），并校验声明的目标与实际分组一致
        List<SupplyClaimLine> regularGroup = null;
        Map<Long, List<SupplyClaimLine>> independentGroups = new LinkedHashMap<>();
        for (List<SupplyClaimLine> group : sr.getData()) {
            SupplyItem first = vr.getData().itemById.get(group.get(0).getItemId());
            if (first != null && first.getIndependentOrder() != null && first.getIndependentOrder() == 1) {
                independentGroups.put(first.getId(), group);
            } else {
                regularGroup = group;
            }
        }
        if (regularTargetId != null && regularGroup == null) {
            return Result.error("本次提交不包含常规物资，无法执行常规合并");
        }
        for (Long itemId : independentTargets.keySet()) {
            if (!independentGroups.containsKey(itemId)) {
                return Result.error("本次提交不包含该独立下单物资，无法合并: " + itemId);
            }
        }
        LinkedHashMap<String, List<SupplyClaimLine>> mergeGroupByTarget = new LinkedHashMap<>();
        List<List<SupplyClaimLine>> createGroups = new ArrayList<>();
        if (regularGroup != null) {
            if (regularTargetId != null) {
                mergeGroupByTarget.put(regularTargetId, regularGroup);
            } else {
                createGroups.add(regularGroup);
            }
        }
        for (Map.Entry<Long, List<SupplyClaimLine>> e : independentGroups.entrySet()) {
            String tid = independentTargets.get(e.getKey());
            if (tid != null) {
                mergeGroupByTarget.put(tid, e.getValue());
            } else {
                createGroups.add(e.getValue());
            }
        }
        // —— 阶段五：写前完成每个合并目标「既有行 + 本组行」的重合并校验：
        //    同 (itemId, 规范化规格) 组合键求和为一行（与新建/修订同一套逻辑）；
        //    credit 仅抵扣该单自身既有行（与修订同口径，等价于校验 库存-他单锁定 ≥ 新增量）
        Map<String, ValidatedClaimLines> combinedByTarget = new LinkedHashMap<>();
        for (Map.Entry<String, List<SupplyClaimLine>> e : mergeGroupByTarget.entrySet()) {
            String oid = e.getKey();
            List<SupplyClaimLine> existing = existingLinesByOrder.get(oid);
            List<CreateSupplyClaimRequest.Line> combinedLines = new ArrayList<>();
            for (SupplyClaimLine l : existing) {
                combinedLines.add(toLineInput(l));
            }
            for (SupplyClaimLine l : e.getValue()) {
                combinedLines.add(toLineInput(l));
            }
            CreateSupplyClaimRequest combinedReq = new CreateSupplyClaimRequest();
            combinedReq.setLines(combinedLines);
            Map<Long, Integer> ownCredit = new LinkedHashMap<>();
            for (SupplyClaimLine l : existing) {
                if (l == null || l.getItemId() == null) continue;
                int qty = l.getQty() == null ? 0 : l.getQty();
                if (qty <= 0) continue;
                SupplyItem it = targetItemCache.computeIfAbsent(l.getItemId(), itemMapper::findById);
                if (it != null && MODE_QUANTIFIED.equals(it.getStockMode())) {
                    ownCredit.merge(l.getItemId(), qty, Integer::sum);
                }
            }
            Result<ValidatedClaimLines> cvr = validateAndBuildClaimLines(combinedReq, ownCredit);
            if (!Boolean.TRUE.equals(cvr.getSuccess())) {
                return Result.error(cvr.getMessage());
            }
            combinedByTarget.put(oid, cvr.getData());
        }
        // —— 阶段六：写入。合并单走修订同款覆盖写阶段（释放旧锁 → 删旧行 → 插合并行并原子锁定）
        List<String> mergedOrderIds = new ArrayList<>();
        for (Map.Entry<String, List<SupplyClaimLine>> e : mergeGroupByTarget.entrySet()) {
            String oid = e.getKey();
            ValidatedClaimLines combined = combinedByTarget.get(oid);
            applyOrderLinesRewrite(lockedOrderById.get(oid), existingLinesByOrder.get(oid),
                    combined.lines, combined.itemById);
            logOp("ORDER_MERGE_APPEND", "CLAIM_ORDER", oid, user.getId(),
                    Map.of("appendedLineCount", e.getValue().size(), "lineCount", combined.lines.size()));
            mergedOrderIds.add(oid);
        }
        List<String> createdOrderIds = new ArrayList<>();
        List<Integer> createdLineCounts = new ArrayList<>();
        for (List<SupplyClaimLine> group : createGroups) {
            String orderId = "SC_" + UUID.randomUUID().toString().replace("-", "");
            SupplyClaimOrder order = new SupplyClaimOrder();
            order.setId(orderId);
            order.setUserId(user.getId());
            order.setApplicantName(resolveDisplayName(user.getId()));
            order.setStatus("PENDING");
            order.setCreatedAt(LocalDateTime.now());
            claimOrderMapper.insert(order);
            for (SupplyClaimLine cl : group) {
                cl.setOrderId(orderId);
                claimLineMapper.insert(cl);
                lockClaimLineStockOrThrow(vr.getData().itemById, cl);
            }
            logOp("ORDER_CREATE", "CLAIM_ORDER", orderId, user.getId(),
                    Map.of("lineCount", group.size(), "splitCount", createGroups.size(), "mergeSubmit", true));
            createdOrderIds.add(orderId);
            createdLineCounts.add(group.size());
        }
        // 全部写入完成后再统一发通知：仅新建单发 CREATED；合并单创建时已通知过，不重复推送
        for (int i = 0; i < createdOrderIds.size(); i++) {
            publishClaimCreated(user, createdOrderIds.get(i), createdLineCounts.get(i));
        }
        List<SupplyClaimOrderView> views = new ArrayList<>();
        for (String oid : mergedOrderIds) {
            views.add(toOrderView(claimOrderMapper.findById(oid), true));
        }
        for (String oid : createdOrderIds) {
            views.add(toOrderView(claimOrderMapper.findById(oid), true));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orders", views);
        data.put("mergedOrderIds", mergedOrderIds);
        data.put("createdOrderIds", createdOrderIds);
        return Result.success(data);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> withdraw(User user, String orderId) {
        if (user == null) return Result.error("未登录");
        SupplyClaimOrder o = claimOrderMapper.findById(orderId);
        if (o == null) return Result.error("领用单不存在");
        if (!user.getId().equals(o.getUserId())) return Result.error("仅本人可撤回");
        int n = claimOrderMapper.updateWithdrawn(orderId, user.getId());
        if (n == 0) return Result.error("仅待处理状态可撤回");
        // 撤回成功后释放本单全部行的锁定
        releaseClaimOrderLocks(orderId);
        logOp("ORDER_WITHDRAW", "CLAIM_ORDER", orderId, user.getId(), Map.of());
        return Result.success();
    }

    @Transactional(rollbackFor = Exception.class)
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
        // 释放锁定必须以 deleteById 之后重读的“新鲜”状态为准，而非上方无锁快照：
        // 并发撤回/出库（updateWithdrawn/updateFulfilled，均带 status='PENDING' AND deleted=0 守卫）
        // 可能在快照读取后、deleteById 前已提交并释放过锁，若按过期快照再放一次会吃掉其他单的预占。
        // deleteById 是 UPDATE，已对该行加了行锁且不修改 status：
        // - 若撤回/出库先提交：此处重读看到 WITHDRAWN/FULFILLED → 不再释放（对方已释放过）；
        // - 若撤回/出库被我们的行锁阻塞：我们提交后 deleted=1 使其守卫失配 → 对方 0 行更新、不释放。
        // 两个方向都恰好释放一次，锁定量不会被双重扣减。
        SupplyClaimOrder fresh = claimOrderMapper.findByIdAny(oid);
        String freshStatus = fresh != null ? fresh.getStatus() : null;
        // 待处理单进回收站需释放锁定（恢复时再重新锁定）
        if ("PENDING".equals(freshStatus)) {
            releaseClaimOrderLocks(oid);
        }
        logOp("ORDER_DELETE", "CLAIM_ORDER", oid, user.getId(), Map.of("status", str(freshStatus)));
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

    @Transactional(rollbackFor = Exception.class)
    public Result<?> restoreMyClaimOrder(User user, String orderId) {
        if (user == null) return Result.error("未登录");
        String oid = trimOrNull(orderId);
        if (!StringUtils.hasText(oid)) return Result.error("领用单号不能为空");
        SupplyClaimOrder row = claimOrderMapper.findRecycleByIdForUser(oid, user.getId());
        if (row == null) return Result.error("回收站工单不存在或无权限");
        int restored = claimOrderMapper.restoreById(oid);
        if (restored <= 0) return Result.error("恢复失败");
        // 恢复的待处理单重新锁定库存（允许超锁）
        if ("PENDING".equals(row.getStatus())) {
            forceLockClaimOrderLocks(oid);
        }
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

    @Transactional(rollbackFor = Exception.class)
    public Result<?> restoreClaimOrder(String orderId) {
        String oid = trimOrNull(orderId);
        if (!StringUtils.hasText(oid)) return Result.error("领用单号不能为空");
        SupplyClaimOrder row = claimOrderMapper.findByIdAny(oid);
        int restored = claimOrderMapper.restoreById(oid);
        if (restored <= 0) return Result.error("恢复失败或工单不在回收站");
        // 恢复的待处理单重新锁定库存（允许超锁）
        if (row != null && "PENDING".equals(row.getStatus())) {
            forceLockClaimOrderLocks(oid);
        }
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
        return listMine(user, status, page, size, false);
    }

    /** @param withLines true 时逐单附带明细行（合并弹窗需要展示各待处理单包含的物品） */
    public Map<String, Object> listMine(User user, String status, int page, int size, boolean withLines) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), 100);
        int offset = (p - 1) * s;
        String st = StringUtils.hasText(status) ? status.trim().toUpperCase() : null;
        List<SupplyClaimOrderView> rows = claimOrderMapper.listMine(user.getId(), st, s, offset).stream()
                .map(o -> toOrderView(o, withLines))
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
        Map<Long, String> remarkByLine = new HashMap<>();
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
            if (fl.getRemark() != null && !fl.getRemark().trim().isEmpty()) {
                remarkByLine.put(dl.getId(), fl.getRemark().trim());
            }
        }
        if (!anyGrant) {
            return Result.error("请至少勾选一行同意发放");
        }
        // 出库处理即终结本单：释放全部行的申请锁定（无论是否同意发放）
        for (SupplyClaimLine dl : dbLines) {
            releaseClaimLineLock(dl);
        }
        List<String> grantedItemNames = new ArrayList<>();
        for (SupplyClaimLine dl : dbLines) {
            Integer out = outQtyByLine.get(dl.getId());
            String remark = remarkByLine.get(dl.getId());
            if (out == null) {
                claimLineMapper.updateFulfilledQty(dl.getId(), 0);
                continue;
            }
            SupplyItem it = itemMapper.findById(dl.getItemId());
            if (it != null && StringUtils.hasText(it.getName())) {
                grantedItemNames.add(it.getName().trim());
            }
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
            if (remark != null) {
                claimLineMapper.updateRemark(dl.getId(), remark);
            }
            SupplyItem itAfter = itemMapper.findById(dl.getItemId());
            int stockAfter = itAfter != null && itAfter.getStockQty() != null ? itAfter.getStockQty() : 0;
            recordInventoryMovement("OUTBOUND", dl.getItemId(), out, stockAfter, orderId, dl.getId(),
                    admin.getId(), locked.getUserId(), remark);
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
        publishClaimFulfilled(admin, done, grantedItemNames);
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

    /**
     * 规格快照规范化：JSON 对象按键名字典序重排后重新序列化，保证 Web（schema 维度顺序）与
     * 小程序（键排序）产出的同一逻辑规格得到同一字符串，合并键与落库口径一致。
     * 解析失败（非 JSON 对象等）时退回 trim 后的原文。
     */
    private String canonicalizeSpecSnapshot(String raw) {
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

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String resolveDisplayName(String userId) {
        return userDisplayNameService.resolveDisplayName(userId);
    }

    private void publishClaimCreated(User user, String orderId, int lineCount) {
        publishClaimCreated(user.getId(), user.getId(), orderId, lineCount);
    }

    /** 新建领用通知；拆分/代提交场景下发送人（senderId）与申请人（applicantUserId）可不同 */
    private void publishClaimCreated(String senderId, String applicantUserId, String orderId, int lineCount) {
        PublishNotificationEvent event = new PublishNotificationEvent();
        event.setEventType("CREATED");
        event.setBizType("SUPPLIES_CLAIM");
        event.setBizId(orderId);
        event.setSenderId(senderId);
        event.setApplicantId(applicantUserId);
        event.setRelatedUserIds(validatedNotifyReceiverUserIds());
        Map<String, String> vars = new HashMap<>();
        vars.put("orderId", orderId);
        vars.put("bizId", orderId);
        vars.put("applicantName", resolveDisplayName(applicantUserId));
        vars.put("summary", "共 " + lineCount + " 项物资");
        event.setVariables(vars);
        notificationService.publish(event);
        try { String itemDetail = claimLineMapper.listByOrderId(orderId).stream().map(l -> (l.getSnapshotName() != null ? l.getSnapshotName() : "物品") + " ×" + l.getQty()).collect(Collectors.joining("、")); pushService.send("SUPPLIES_REQUESTED", Map.of("applicantName", resolveDisplayName(applicantUserId), "summary", itemDetail, "createdAt", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))); } catch (Exception e) { log.warn("[Push] SUPPLIES_REQUESTED failed: {}", e.getMessage()); }
    }

    /** 出库完成 → 申请人站内回执（与报修/采购办结同源：COMPLETED + SUPPLIES_CLAIM） */
    private void publishClaimFulfilled(User operator, SupplyClaimOrder order, List<String> itemNames) {
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
        if (itemNames != null && !itemNames.isEmpty()) {
            // 去重取前5个物品名称
            List<String> distinct = itemNames.stream().distinct().limit(5).toList();
            String items = String.join("、", distinct);
            if (itemNames.stream().distinct().count() > 5) items += "等";
            vars.put("summary", "已出库：" + items);
        } else {
            vars.put("summary", "已出库");
        }
        event.setVariables(vars);
        notificationService.publish(event);
        try { pushService.send("SUPPLIES_COMPLETED", Map.of("applicantName", resolveDisplayName(order.getUserId()), "summary", vars.get("summary"), "bizId", order.getId()), Set.of(order.getUserId())); } catch (Exception e) { log.warn("[Push] SUPPLIES_COMPLETED failed: {}", e.getMessage()); }
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
        int locked = it.getLockedQty() == null ? 0 : it.getLockedQty();
        v.setLockedQty(locked);
        if (MODE_QUANTIFIED.equals(it.getStockMode())) {
            int stock = it.getStockQty() == null ? 0 : it.getStockQty();
            v.setAvailableQty(Math.max(0, stock - locked));
        } else {
            v.setAvailableQty(it.getStockQty());
        }
        v.setDeleted(it.getDeleted());
        v.setDeletedTime(it.getDeletedTime());
        v.setDeletedBy(it.getDeletedBy());
        v.setPurgeAfterTime(it.getPurgeAfterTime());
        v.setCreatedAt(it.getCreatedAt());
        v.setLastInboundAt(it.getLastInboundAt());
        v.setSpecSchema(it.getSpecSchema());
        v.setSpecRequired(it.getSpecRequired());
        v.setIndependentOrder(it.getIndependentOrder());
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

    // ==================== 库存锁定（待处理领用预占） ====================

    /** 领用行提交锁定（仅 QUANTIFIED）：可用库存不足时抛异常触发事务回滚 */
    private void lockClaimLineStockOrThrow(Map<Long, SupplyItem> itemById, SupplyClaimLine cl) {
        if (cl == null || cl.getItemId() == null) return;
        SupplyItem it = itemById.get(cl.getItemId());
        if (it == null || !MODE_QUANTIFIED.equals(it.getStockMode())) return;
        int qty = cl.getQty() == null ? 0 : cl.getQty();
        if (qty <= 0) return;
        int n = itemMapper.lockStockIfAvailable(cl.getItemId(), qty);
        if (n == 0) {
            throw new IllegalStateException("库存不足(已被其他待处理订单锁定): " + it.getName());
        }
    }

    /** 释放单行锁定（SQL 侧仅作用于 QUANTIFIED，下限 0） */
    private void releaseClaimLineLock(SupplyClaimLine line) {
        if (line == null || line.getItemId() == null) return;
        int qty = line.getQty() == null ? 0 : line.getQty();
        if (qty > 0) {
            itemMapper.releaseLockedStock(line.getItemId(), qty);
        }
    }

    /** 释放订单全部明细行的锁定 */
    private void releaseClaimOrderLocks(String orderId) {
        for (SupplyClaimLine line : claimLineMapper.listByOrderId(orderId)) {
            releaseClaimLineLock(line);
        }
    }

    /** 回收站恢复待处理单：强制重新锁定全部明细行（允许超锁） */
    private void forceLockClaimOrderLocks(String orderId) {
        for (SupplyClaimLine line : claimLineMapper.listByOrderId(orderId)) {
            if (line == null || line.getItemId() == null) continue;
            int qty = line.getQty() == null ? 0 : line.getQty();
            if (qty > 0) {
                itemMapper.lockStockForce(line.getItemId(), qty);
            }
        }
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
        v.setRemark(l.getRemark());
        v.setSpecSnapshot(l.getSpecSnapshot());
        if (l.getItemId() != null) {
            SupplyItem it = itemMapper.findById(l.getItemId());
            if (it != null) {
                v.setCoverUrl(it.getCoverUrl());
                // 物品已删除时保持 null，前端据此把工单按独立下单规则分类
                v.setIndependentOrder(it.getIndependentOrder());
            }
        }
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
        if (req.getSpecSchema() != null) {
            it.setSpecSchema(req.getSpecSchema().isBlank() ? null : req.getSpecSchema());
        }
        if (req.getSpecRequired() != null) it.setSpecRequired(req.getSpecRequired());
        if (req.getIndependentOrder() != null) it.setIndependentOrder(req.getIndependentOrder());
        if (existing == null) {
            if (!StringUtils.hasText(it.getShelfStatus())) it.setShelfStatus(SHELF_ON);
            if (!StringUtils.hasText(it.getStockMode())) it.setStockMode(MODE_QUANTIFIED);
            if (it.getStockQty() == null) it.setStockQty(0);
            if (it.getIndependentOrder() == null) it.setIndependentOrder(0);
        }
        return it;
    }
}

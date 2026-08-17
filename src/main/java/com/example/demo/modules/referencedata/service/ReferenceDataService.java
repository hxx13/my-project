package com.example.demo.modules.referencedata.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.referencedata.dto.*;
import com.example.demo.modules.referencedata.entity.*;
import com.example.demo.modules.referencedata.mapper.*;
import com.example.demo.modules.referencedata.registry.ReferenceFieldRegistry;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ReferenceDataService {
    private static final Logger log = LoggerFactory.getLogger(ReferenceDataService.class);

    private final ReferenceDataMapper referenceDataMapper;
    private final RefSpecTemplateMapper specTemplateMapper;
    private final RefCartMapper cartMapper;
    private final RefOrderMapper orderMapper;
    private final RefOrderLineMapper orderLineMapper;
    private final RefOrderLogMapper orderLogMapper;
    private final ReferenceFieldRegistry fieldRegistry;
    private final ObjectMapper objectMapper;
    private final PersonIdentityService personIdentityService;
    private final NotificationService notificationService;

    public ReferenceDataService(ReferenceDataMapper referenceDataMapper,
                                RefSpecTemplateMapper specTemplateMapper,
                                RefCartMapper cartMapper,
                                RefOrderMapper orderMapper,
                                RefOrderLineMapper orderLineMapper,
                                RefOrderLogMapper orderLogMapper,
                                ReferenceFieldRegistry fieldRegistry,
                                ObjectMapper objectMapper,
                                PersonIdentityService personIdentityService,
                                NotificationService notificationService) {
        this.referenceDataMapper = referenceDataMapper;
        this.specTemplateMapper = specTemplateMapper;
        this.cartMapper = cartMapper;
        this.orderMapper = orderMapper;
        this.orderLineMapper = orderLineMapper;
        this.orderLogMapper = orderLogMapper;
        this.fieldRegistry = fieldRegistry;
        this.objectMapper = objectMapper;
        this.personIdentityService = personIdentityService;
        this.notificationService = notificationService;
    }

    // ==================== RefData CRUD ====================

    public List<RefDataView> listByType(String typeKey, Long parentId, Integer status,
                                          String keyword, int page, int size) {
        if (!fieldRegistry.isValidType(typeKey)) {
            throw new TwinBusinessException(ErrorCodeConstants.BAD_REQUEST, "未知参考数据类型: " + typeKey);
        }
        int p = Math.max(1, page);
        int s = Math.min(Math.max(size, 1), 1000);
        int offset = (p - 1) * s;
        List<RefData> rows = referenceDataMapper.listByType(typeKey, parentId, status, keyword, s, offset);
        return rows.stream().map(this::toView).toList();
    }

    public RefDataView findById(Long id) {
        RefData row = referenceDataMapper.findById(id);
        if (row == null) return null;
        return toView(row);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefDataView> create(String typeKey, RefDataUpsertRequest req) {
        if (!fieldRegistry.isValidType(typeKey)) {
            return Result.error("未知参考数据类型: " + typeKey);
        }
        if (req == null) {
            return Result.error("参数无效");
        }
        Map<String, Object> fieldData = req.getFieldData();
        String validationError = fieldRegistry.validate(typeKey, fieldData);
        if (validationError != null) {
            return Result.error(validationError);
        }
        // Validate parent if type has parentType
        ReferenceFieldRegistry.FieldSchema schema = fieldRegistry.getSchema(typeKey);
        if (schema != null && schema.hasParent()) {
            if (req.getParentId() == null) {
                return Result.error("该类型需要指定父级");
            }
            RefData parent = referenceDataMapper.findById(req.getParentId());
            if (parent == null || !schema.parentType().equals(parent.getRefType())) {
                return Result.error("父级数据不存在或类型不匹配");
            }
        }
        RefData entity = new RefData();
        entity.setRefType(typeKey);
        entity.setParentId(req.getParentId());
        entity.setSortOrder(req.getSortOrder() != null ? req.getSortOrder()
                : referenceDataMapper.maxSortOrder(typeKey, req.getParentId()) + 1);
        entity.setStatus(req.getStatus() != null ? req.getStatus() : 1);
        entity.setFieldData(toJson(fieldData));
        referenceDataMapper.insert(entity);
        return Result.success(toView(referenceDataMapper.findById(entity.getId())));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefDataView> update(Long id, RefDataUpsertRequest req) {
        RefData existing = referenceDataMapper.findById(id);
        if (existing == null) {
            return Result.error("参考数据不存在");
        }
        if (req == null) {
            return Result.error("参数无效");
        }
        Map<String, Object> fieldData = req.getFieldData();
        String validationError = fieldRegistry.validate(existing.getRefType(), fieldData);
        if (validationError != null) {
            return Result.error(validationError);
        }
        if (req.getParentId() != null) existing.setParentId(req.getParentId());
        if (req.getSortOrder() != null) existing.setSortOrder(req.getSortOrder());
        if (req.getStatus() != null) existing.setStatus(req.getStatus());
        if (fieldData != null) existing.setFieldData(toJson(fieldData));
        referenceDataMapper.update(existing);
        return Result.success(toView(referenceDataMapper.findById(id)));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> delete(Long id) {
        RefData existing = referenceDataMapper.findById(id);
        if (existing == null) {
            return Result.error("参考数据不存在");
        }
        int children = referenceDataMapper.countChildren(id);
        if (children > 0) {
            return Result.error("该数据下存在子数据，无法删除");
        }
        referenceDataMapper.deleteById(id);
        return Result.success();
    }

    public List<RefDataView> listOptions(String typeKey) {
        if (!fieldRegistry.isValidType(typeKey)) {
            return List.of();
        }
        return referenceDataMapper.listOptions(typeKey).stream().map(this::toView).toList();
    }

    // ==================== Spec Templates ====================

    public List<RefSpecTemplateView> listSpecTemplates() {
        return specTemplateMapper.listAll().stream().map(this::toTemplateView).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefSpecTemplateView> createSpecTemplate(RefSpecTemplateUpsertRequest req) {
        if (req == null || !StringUtils.hasText(req.getName())) {
            return Result.error("模板名称不能为空");
        }
        if (req.getOptions() == null || req.getOptions().isEmpty()) {
            return Result.error("模板选项不能为空");
        }
        RefSpecTemplate entity = new RefSpecTemplate();
        entity.setName(req.getName().trim());
        entity.setScope(req.getScope() != null ? req.getScope() : "ALL");
        entity.setBreedType(req.getBreedType());
        entity.setOptions(toJson(req.getOptions()));
        specTemplateMapper.insert(entity);
        return Result.success(toTemplateView(specTemplateMapper.findById(entity.getId())));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefSpecTemplateView> updateSpecTemplate(Long id, RefSpecTemplateUpsertRequest req) {
        RefSpecTemplate existing = specTemplateMapper.findById(id);
        if (existing == null) {
            return Result.error("规格模板不存在");
        }
        if (StringUtils.hasText(req.getName())) existing.setName(req.getName().trim());
        if (req.getScope() != null) existing.setScope(req.getScope());
        if (req.getBreedType() != null) existing.setBreedType(req.getBreedType());
        if (req.getOptions() != null && !req.getOptions().isEmpty()) existing.setOptions(toJson(req.getOptions()));
        specTemplateMapper.update(existing);
        return Result.success(toTemplateView(specTemplateMapper.findById(id)));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> deleteSpecTemplate(Long id) {
        if (specTemplateMapper.findById(id) == null) {
            return Result.error("规格模板不存在");
        }
        specTemplateMapper.deleteById(id);
        return Result.success();
    }

    // ==================== Cart ====================

    public List<RefCartView> listCart(String groupId) {
        return cartMapper.listByGroupId(groupId).stream().map(this::toCartView).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefCartView> addToCart(String groupId, String userId, RefCartUpsertRequest req) {
        if (req == null || req.getRefDataId() == null) {
            return Result.error("参数无效");
        }
        RefData refData = referenceDataMapper.findById(req.getRefDataId());
        if (refData == null) {
            return Result.error("参考数据不存在");
        }
        RefCart entity = new RefCart();
        entity.setGroupId(groupId);
        entity.setRefDataId(req.getRefDataId());
        entity.setSpecSelections(toJson(req.getSpecSelections()));
        entity.setQuantity(req.getQuantity() != null ? req.getQuantity() : 1);
        entity.setRemark(req.getRemark());
        entity.setAddedBy(userId);
        cartMapper.insert(entity);
        return Result.success(toCartView(cartMapper.findById(entity.getId())));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefCartView> updateCartItem(Long id, RefCartUpsertRequest req) {
        RefCart existing = cartMapper.findById(id);
        if (existing == null) {
            return Result.error("购物车项不存在");
        }
        if (req.getSpecSelections() != null) existing.setSpecSelections(toJson(req.getSpecSelections()));
        if (req.getQuantity() != null) existing.setQuantity(req.getQuantity());
        if (req.getRemark() != null) existing.setRemark(req.getRemark());
        cartMapper.update(existing);
        return Result.success(toCartView(cartMapper.findById(id)));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> removeFromCart(Long id) {
        if (cartMapper.findById(id) == null) {
            return Result.error("购物车项不存在");
        }
        cartMapper.deleteById(id);
        return Result.success();
    }

    @Transactional(rollbackFor = Exception.class)
    public void clearCart(String groupId) {
        cartMapper.deleteByGroupId(groupId);
    }

    // ==================== Orders ====================

    @Transactional(rollbackFor = Exception.class)
    public Result<RefOrderView> submitOrder(String userId, RefOrderSubmitRequest req) {
        if (req == null || !StringUtils.hasText(req.getGroupId())) {
            return Result.error("参数无效，缺少 groupId");
        }
        // 仅组长（GROUP_LEADER 身份标识）可提交订单，组员只能加购
        if (!personIdentityService.isPi(userId)) {
            return Result.error("仅组长可提交订单（组员请先加购，由组长统一提交）");
        }
        List<RefCart> cartItems = cartMapper.listByGroupId(req.getGroupId());
        if (cartItems.isEmpty() && (req.getLines() == null || req.getLines().isEmpty())) {
            return Result.error("购物车为空，无法提交订单");
        }
        // Create order
        RefOrder order = new RefOrder();
        order.setGroupId(req.getGroupId());
        // 提交人以服务端登录人为准，不信任客户端传入的 submitterId
        order.setSubmitterId(userId);
        order.setSubmitterName(req.getSubmitterName());
        order.setProjectGroupName(req.getProjectGroupName());
        order.setStatus("PENDING");
        order.setSubmitRemark(req.getSubmitRemark());
        order.setSubmittedAt(LocalDateTime.now());
        orderMapper.insert(order);
        // Create order lines from cart or explicit lines
        List<RefCart> itemsToProcess = (req.getLines() != null && !req.getLines().isEmpty())
                ? convertLinesToCart(req.getGroupId(), userId, req.getLines())
                : cartItems;
        List<String> itemNames = new ArrayList<>();
        for (RefCart item : itemsToProcess) {
            RefOrderLine line = new RefOrderLine();
            line.setOrderId(order.getId());
            line.setRefDataId(item.getRefDataId());
            line.setSpecSelections(item.getSpecSelections());
            line.setHierarchyChain(resolveHierarchyChain(item.getRefDataId()));
            line.setQuantity(item.getQuantity());
            line.setLineRemark(item.getRemark());
            orderLineMapper.insert(line);
            RefData refData = referenceDataMapper.findById(item.getRefDataId());
            if (refData != null) {
                itemNames.add(extractDisplayName(refData));
            }
        }
        // Clear cart
        cartMapper.deleteByGroupId(req.getGroupId());
        // Log
        logOrderAction(order.getId(), "CREATED", userId,
                "提交订单，共 " + itemsToProcess.size() + " 项");
        // 通知接收人（秘书）
        notifyReceivers(order, userId, itemNames);
        return Result.success(toOrderView(orderMapper.findById(order.getId())));
    }

    private void notifyReceivers(RefOrder order, String senderId, List<String> itemNames) {
        try {
            List<String> receivers = personIdentityService.listSecretaryUserIds();
            if (receivers.isEmpty()) {
                return;
            }
            PublishNotificationEvent event = new PublishNotificationEvent();
            event.setEventType("REF_ORDER_SUBMITTED");
            event.setBizType("REF_ORDER");
            event.setBizId(String.valueOf(order.getId()));
            event.setSenderId(senderId);
            event.setApplicantId(senderId);
            event.setRelatedUserIds(new LinkedHashSet<>(receivers));
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("orderId", String.valueOf(order.getId()));
            vars.put("projectGroupName", order.getProjectGroupName() != null ? order.getProjectGroupName() : "");
            vars.put("itemCount", String.valueOf(itemNames != null ? itemNames.size() : 0));
            vars.put("items", itemNames != null ? String.join("、", itemNames) : "");
            event.setVariables(vars);
            notificationService.publish(event);
        } catch (Exception e) {
            log.warn("[reference-data] 订单通知发送失败 orderId={} err={}", order.getId(), e.getMessage());
        }
    }

    public RefOrderView getOrder(Long orderId) {
        RefOrder order = orderMapper.findById(orderId);
        if (order == null) return null;
        return toOrderView(order);
    }

    public List<RefOrderView> listOrders(String groupId) {
        return orderMapper.listByGroupId(groupId).stream().map(this::toOrderView).toList();
    }

    /** 全部订单（后台审核页：按状态 tab 前端过滤） */
    public Map<String, Object> listAllOrders(int page, int pageSize) {
        int offset = (page - 1) * pageSize;
        List<RefOrderView> list = orderMapper.listAll(pageSize, offset).stream().map(this::toOrderView).toList();
        return Map.of("list", list, "total", orderMapper.countAll(), "page", page, "pageSize", pageSize);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefOrderView> updateOrderStatus(Long orderId, String newStatus, String operatorId) {
        RefOrder order = orderMapper.findById(orderId);
        if (order == null) {
            return Result.error("订单不存在");
        }
        if (!isValidStatusTransition(order.getStatus(), newStatus)) {
            return Result.error("无效的状态变更: " + order.getStatus() + " -> " + newStatus);
        }
        orderMapper.updateStatus(orderId, newStatus.toUpperCase(),
                "SUBMITTED".equalsIgnoreCase(newStatus) ? LocalDateTime.now() : null);
        logOrderAction(orderId, newStatus.toUpperCase(), operatorId,
                "状态变更: " + order.getStatus() + " -> " + newStatus.toUpperCase());
        return Result.success(toOrderView(orderMapper.findById(orderId)));
    }

    public List<RefOrderLogView> getOrderLogs(Long orderId) {
        return orderLogMapper.listByOrderId(orderId).stream().map(this::toLogView).toList();
    }

    // ==================== Private helpers ====================

    private String toJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            log.warn("JSON序列化失败: {}", e.getMessage());
            return null;
        }
    }

    private RefDataView toView(RefData row) {
        if (row == null) return null;
        RefDataView v = new RefDataView();
        v.setId(row.getId());
        v.setRefType(row.getRefType());
        v.setParentId(row.getParentId());
        v.setSortOrder(row.getSortOrder());
        v.setStatus(row.getStatus());
        // Parse JSON string to object so frontend receives a proper object
        try {
            v.setFieldData(objectMapper.readValue(row.getFieldData(), Map.class));
        } catch (Exception e) {
            v.setFieldData(row.getFieldData());
        }
        v.setCreatedAt(row.getCreatedAt());
        v.setUpdatedAt(row.getUpdatedAt());
        v.setChildCount(referenceDataMapper.countChildren(row.getId()));
        return v;
    }

    private RefSpecTemplateView toTemplateView(RefSpecTemplate row) {
        if (row == null) return null;
        RefSpecTemplateView v = new RefSpecTemplateView();
        v.setId(row.getId());
        v.setName(row.getName());
        v.setScope(row.getScope());
        v.setBreedType(row.getBreedType());
        v.setOptions(row.getOptions());
        v.setCreatedAt(row.getCreatedAt());
        return v;
    }

    private RefCartView toCartView(RefCart row) {
        if (row == null) return null;
        RefCartView v = new RefCartView();
        v.setId(row.getId());
        v.setGroupId(row.getGroupId());
        v.setRefDataId(row.getRefDataId());
        v.setSpecSelections(row.getSpecSelections());
        v.setQuantity(row.getQuantity());
        v.setRemark(row.getRemark());
        v.setAddedBy(row.getAddedBy());
        v.setAddedAt(row.getAddedAt());
        return v;
    }

    private RefOrderView toOrderView(RefOrder row) {
        if (row == null) return null;
        RefOrderView v = new RefOrderView();
        v.setId(row.getId());
        v.setGroupId(row.getGroupId());
        v.setSubmitterId(row.getSubmitterId());
        v.setSubmitterName(row.getSubmitterName());
        v.setProjectGroupName(row.getProjectGroupName());
        v.setStatus(row.getStatus());
        v.setSubmitRemark(row.getSubmitRemark());
        v.setSubmittedAt(row.getSubmittedAt());
        v.setCreatedAt(row.getCreatedAt());
        v.setLines(orderLineMapper.listByOrderId(row.getId()).stream().map(this::toOrderLineView).toList());
        return v;
    }

    private RefOrderLineView toOrderLineView(RefOrderLine row) {
        if (row == null) return null;
        RefOrderLineView v = new RefOrderLineView();
        v.setId(row.getId());
        v.setOrderId(row.getOrderId());
        v.setRefDataId(row.getRefDataId());
        v.setSpecSelections(row.getSpecSelections());
        if (row.getHierarchyChain() != null) {
            try {
                v.setHierarchyChain(objectMapper.readValue(row.getHierarchyChain(), Object.class));
            } catch (Exception e) {
                v.setHierarchyChain(row.getHierarchyChain());
            }
        }
        v.setQuantity(row.getQuantity());
        v.setLineRemark(row.getLineRemark());
        return v;
    }

    /** Walk parent_id chain upward from a leaf. Returns JSON array [{id, refType, displayName}] leaf-first. */
    private String resolveHierarchyChain(Long leafId) {
        List<RefData> ancestors = referenceDataMapper.findAncestors(leafId);
        if (ancestors == null || ancestors.isEmpty()) return null;
        List<Map<String, Object>> chain = ancestors.stream().map(a -> {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", a.getId());
            node.put("refType", a.getRefType());
            node.put("displayName", extractDisplayName(a));
            return node;
        }).collect(Collectors.toList());
        try {
            return objectMapper.writeValueAsString(chain);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize hierarchy chain for leaf {}: {}", leafId, e.getMessage());
            return null;
        }
    }

    private RefOrderLogView toLogView(RefOrderLog row) {
        if (row == null) return null;
        RefOrderLogView v = new RefOrderLogView();
        v.setId(row.getId());
        v.setOrderId(row.getOrderId());
        v.setAction(row.getAction());
        v.setOperatorId(row.getOperatorId());
        v.setDetail(row.getDetail());
        v.setCreatedAt(row.getCreatedAt());
        return v;
    }

    private void logOrderAction(Long orderId, String action, String operatorId, String detail) {
        RefOrderLog log = new RefOrderLog();
        log.setOrderId(orderId);
        log.setAction(action);
        log.setOperatorId(operatorId);
        log.setDetail(detail);
        orderLogMapper.insert(log);
    }

    private List<RefCart> convertLinesToCart(String groupId, String userId, List<RefCartUpsertRequest> lines) {
        List<RefCart> result = new ArrayList<>();
        for (RefCartUpsertRequest line : lines) {
            RefCart item = new RefCart();
            item.setGroupId(groupId);
            item.setRefDataId(line.getRefDataId());
            item.setSpecSelections(toJson(line.getSpecSelections()));
            item.setQuantity(line.getQuantity() != null ? line.getQuantity() : 1);
            item.setRemark(line.getRemark());
            item.setAddedBy(userId);
            result.add(item);
        }
        return result;
    }

    private String extractDisplayName(RefData refData) {
        if (refData == null || !StringUtils.hasText(refData.getFieldData())) {
            return "ID:" + (refData != null ? refData.getId() : "");
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> fd = objectMapper.readValue(refData.getFieldData(), Map.class);
            String[] candidateKeys = {"chineseName", "genotypeName", "supplierName", "englishName", "shortName"};
            for (String key : candidateKeys) {
                Object val = fd.get(key);
                if (val != null && StringUtils.hasText(val.toString())) {
                    return val.toString().trim();
                }
            }
        } catch (JsonProcessingException e) {
            // fall through
        }
        return "ID:" + refData.getId();
    }

    private boolean isValidStatusTransition(String current, String next) {
        if (current == null || next == null) return false;
        String cur = current.toUpperCase();
        String nxt = next.toUpperCase();
        return switch (cur) {
            case "PENDING" -> Set.of("APPROVED", "REJECTED", "CANCELLED").contains(nxt);
            case "APPROVED" -> Set.of("COMPLETED", "CANCELLED", "REJECTED").contains(nxt);
            case "COMPLETED", "REJECTED", "CANCELLED" -> false;
            default -> false;
        };
    }
}

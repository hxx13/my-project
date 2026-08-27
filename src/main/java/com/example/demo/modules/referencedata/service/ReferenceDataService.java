package com.example.demo.modules.referencedata.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.animalorder.service.AnimalOrderTimePolicyService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.aup.service.AupAnimalAllowlistCompat;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ReferenceDataService {
    private static final Logger log = LoggerFactory.getLogger(ReferenceDataService.class);

    private static final ZoneId ORDER_ZONE = ZoneId.of("Asia/Shanghai");

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
    private final AupRecordMapper aupRecordMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final AnimalOrderTimePolicyService animalOrderTimePolicyService;
    private final AupAnimalAllowlistCompat allowlistCompat;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final UserAroBindingMapper userAroBindingMapper;
    private final JdbcTemplate jdbcTemplate;

    public ReferenceDataService(ReferenceDataMapper referenceDataMapper,
                                RefSpecTemplateMapper specTemplateMapper,
                                RefCartMapper cartMapper,
                                RefOrderMapper orderMapper,
                                RefOrderLineMapper orderLineMapper,
                                RefOrderLogMapper orderLogMapper,
                                ReferenceFieldRegistry fieldRegistry,
                                ObjectMapper objectMapper,
                                PersonIdentityService personIdentityService,
                                NotificationService notificationService,
                                AupRecordMapper aupRecordMapper,
                                UserDisplayNameService userDisplayNameService,
                                AnimalOrderTimePolicyService animalOrderTimePolicyService,
                                AupAnimalAllowlistCompat allowlistCompat,
                                AroPersonnelMapper aroPersonnelMapper,
                                UserAroBindingMapper userAroBindingMapper,
                                JdbcTemplate jdbcTemplate) {
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
        this.aupRecordMapper = aupRecordMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.animalOrderTimePolicyService = animalOrderTimePolicyService;
        this.allowlistCompat = allowlistCompat;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.userAroBindingMapper = userAroBindingMapper;
        this.jdbcTemplate = jdbcTemplate;
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
        return toCartViews(cartMapper.listByGroupId(groupId));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefCartView> addToCart(String groupId, String userId, RefCartUpsertRequest req) {
        if (req == null || req.getRefDataId() == null) {
            return Result.error("参数无效");
        }
        if (req.getAupRecordId() == null) {
            return Result.error("请先选择 AUP");
        }
        RefData refData = referenceDataMapper.findById(req.getRefDataId());
        if (refData == null) {
            return Result.error("参考数据不存在");
        }
        AupRecord aup = resolveAupForOrder(req.getAupRecordId(), userId);
        if (aup == null) {
            return Result.error("所选 AUP 不存在或未获批准");
        }
        String allowErr = validateItemAgainstAllowlist(aup, req.getRefDataId());
        if (allowErr != null) {
            return Result.error("不符合当前AUP");
        }
        RefCart entity = new RefCart();
        entity.setGroupId(groupId);
        entity.setRefDataId(req.getRefDataId());
        entity.setAupRecordId(req.getAupRecordId());
        entity.setSpecSelections(toJson(req.getSpecSelections()));
        entity.setQuantity(req.getQuantity() != null ? req.getQuantity() : 1);
        // 加购路径不再写入每规格备注
        entity.setRemark(null);
        entity.setPackageStatus("DRAFT");
        entity.setPackageRemark(null);
        entity.setAddedBy(userId);
        cartMapper.insert(entity);
        return Result.success(toCartView(cartMapper.findById(entity.getId())));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<RefCartView> updateCartItem(Long id, String userId, RefCartUpsertRequest req) {
        RefCart existing = cartMapper.findById(id);
        if (existing == null) {
            return Result.error("购物车项不存在");
        }
        boolean pi = personIdentityService.isPi(userId);
        if (!pi && !Objects.equals(existing.getAddedBy(), userId)) {
            return Result.error("只能修改本人加购的行");
        }
        if (req.getSpecSelections() != null) existing.setSpecSelections(toJson(req.getSpecSelections()));
        if (req.getQuantity() != null) existing.setQuantity(req.getQuantity());
        // READY 行实验员改数量时自动回退 DRAFT（需重新提交订单包）
        if (!pi && "READY".equalsIgnoreCase(existing.getPackageStatus()) && req.getQuantity() != null) {
            existing.setPackageStatus("DRAFT");
            existing.setPackageRemark(null);
        }
        cartMapper.update(existing);
        return Result.success(toCartView(cartMapper.findById(id)));
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> removeFromCart(Long id, String userId) {
        RefCart existing = cartMapper.findById(id);
        if (existing == null) {
            return Result.error("购物车项不存在");
        }
        boolean pi = personIdentityService.isPi(userId);
        if (!pi && !Objects.equals(existing.getAddedBy(), userId)) {
            return Result.error("只能删除本人加购的行");
        }
        cartMapper.deleteById(id);
        return Result.success();
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<?> clearCart(String groupId, String userId) {
        if (!personIdentityService.isPi(userId)) {
            return Result.error("仅组长可清空课题组共享购物车");
        }
        cartMapper.deleteByGroupId(groupId);
        return Result.success();
    }

    /**
     * 实验员将本人行标为 READY 并写入统一 package_remark（订单包，非正式单）。
     */
    @Transactional(rollbackFor = Exception.class)
    public Result<List<RefCartView>> markPackageReady(String groupId, String userId, RefCartPackageRequest req) {
        if (!StringUtils.hasText(groupId)) {
            return Result.error("缺少 groupId");
        }
        List<RefCart> targets = resolveOwnCartLines(groupId, userId, req != null ? req.getCartIds() : null);
        if (targets.isEmpty()) {
            return Result.error("没有可提交的购物车行");
        }
        String remark = req != null ? req.getPackageRemark() : null;
        for (RefCart item : targets) {
            cartMapper.updatePackageStatus(item.getId(), "READY", remark);
        }
        return Result.success(toCartViews(cartMapper.listByGroupId(groupId)));
    }

    /** 撤回订单包：本人 READY → DRAFT（非审批动作）。 */
    @Transactional(rollbackFor = Exception.class)
    public Result<List<RefCartView>> withdrawPackage(String groupId, String userId, RefCartPackageRequest req) {
        if (!StringUtils.hasText(groupId)) {
            return Result.error("缺少 groupId");
        }
        List<RefCart> targets = resolveOwnCartLines(groupId, userId, req != null ? req.getCartIds() : null);
        if (targets.isEmpty()) {
            return Result.error("没有可撤回的购物车行");
        }
        for (RefCart item : targets) {
            if ("READY".equalsIgnoreCase(item.getPackageStatus())) {
                cartMapper.updatePackageStatus(item.getId(), "DRAFT", null);
            }
        }
        return Result.success(toCartViews(cartMapper.listByGroupId(groupId)));
    }

    private List<RefCart> resolveOwnCartLines(String groupId, String userId, List<Long> cartIds) {
        List<RefCart> all = cartMapper.listByGroupId(groupId);
        return all.stream()
                .filter(c -> Objects.equals(c.getAddedBy(), userId))
                .filter(c -> cartIds == null || cartIds.isEmpty() || cartIds.contains(c.getId()))
                .toList();
    }

    // ==================== Orders ====================

    @Transactional(rollbackFor = Exception.class)
    public Result<RefOrderView> submitOrder(String userId, RefOrderSubmitRequest req) {
        if (req == null || !StringUtils.hasText(req.getGroupId())) {
            return Result.error("参数无效，缺少 groupId");
        }
        // 仅组长（GROUP_LEADER 身份标识）可提交订单，组员只能加购 / 提交订单包
        if (!personIdentityService.isPi(userId)) {
            return Result.error("仅组长可提交订单（组员请先加购并提交订单包，由组长统一提交）");
        }

        List<RefCart> itemsToProcess;
        List<Long> cartIdsToClear = new ArrayList<>();
        if (req.getLines() != null && !req.getLines().isEmpty()) {
            itemsToProcess = convertLinesToCart(req.getGroupId(), userId, req.getLines());
            for (RefCart c : itemsToProcess) {
                if (c.getAupRecordId() == null) {
                    return Result.error("订单行缺少 aupRecordId，请升级客户端后按行归属 AUP 再提交");
                }
            }
        } else {
            List<RefCart> cartItems = cartMapper.listByGroupId(req.getGroupId());
            if (req.getCartIds() != null && !req.getCartIds().isEmpty()) {
                Set<Long> idSet = new HashSet<>(req.getCartIds());
                itemsToProcess = cartItems.stream().filter(c -> idSet.contains(c.getId())).toList();
            } else {
                // 默认：全部 READY 行
                itemsToProcess = cartItems.stream()
                        .filter(c -> "READY".equalsIgnoreCase(c.getPackageStatus()))
                        .toList();
                // 若无 READY，兼容旧客户端：整车提交（要求每行有 aup）
                if (itemsToProcess.isEmpty()) {
                    itemsToProcess = cartItems;
                }
            }
            if (itemsToProcess.isEmpty()) {
                return Result.error("购物车为空或没有可提交的 READY 行");
            }
            for (RefCart c : itemsToProcess) {
                if (c.getAupRecordId() == null) {
                    return Result.error("购物车行缺少 AUP 归属，请清空后重新按 AUP 加购");
                }
                cartIdsToClear.add(c.getId());
            }
        }

        // 按行校验 allowlist
        String allowlistError = validateOrderLinesAgainstAllowlist(itemsToProcess);
        if (allowlistError != null) {
            throw new TwinBusinessException(400, allowlistError);
        }

        // 头 AUP：请求显式传入，或全部行同一 AUP 时写入展示字段
        AupRecord headerAup = null;
        if (req.getAupRecordId() != null) {
            headerAup = resolveAupForOrder(req.getAupRecordId(), userId);
            if (headerAup == null) {
                return Result.error("所选 AUP 不存在或未获批准");
            }
        } else {
            Set<Long> distinctAups = itemsToProcess.stream()
                    .map(RefCart::getAupRecordId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            if (distinctAups.size() == 1) {
                headerAup = resolveAupForOrder(distinctAups.iterator().next(), userId);
            }
        }

        RefOrder order = new RefOrder();
        order.setGroupId(req.getGroupId());
        order.setSubmitterId(userId);
        // 展示名以后端统一解析为准（兼容 staffId / 19 位 id），不依赖前端传入
        String resolvedSubmitterName = userDisplayNameService.resolveDisplayName(userId);
        order.setSubmitterName(StringUtils.hasText(resolvedSubmitterName)
                ? resolvedSubmitterName
                : (StringUtils.hasText(req.getSubmitterName()) ? req.getSubmitterName().trim() : userId));
        order.setProjectGroupName(req.getProjectGroupName());
        if (headerAup != null) {
            order.setProjectGroupId(headerAup.getProjectGroupId());
            order.setAupRecordId(headerAup.getId());
            order.setRegisterNo(headerAup.getRegisterNo());
        } else {
            // 多 AUP：尽量从行解析课题组 id
            for (RefCart item : itemsToProcess) {
                AupRecord a = aupRecordMapper.selectById(item.getAupRecordId());
                if (a != null && a.getProjectGroupId() != null) {
                    order.setProjectGroupId(a.getProjectGroupId());
                    if (!StringUtils.hasText(order.getProjectGroupName())) {
                        order.setProjectGroupName(a.getProjectGroupName());
                    }
                    break;
                }
            }
        }
        order.setStatus("PENDING");
        order.setSubmitRemark(req.getSubmitRemark());
        order.setSubmittedAt(LocalDateTime.now());

        ZonedDateTime orderAt = ZonedDateTime.now(ORDER_ZONE);
        LocalDate maxEta = null;
        for (RefCart item : itemsToProcess) {
            String categoryKey = resolveBreedCategoryKey(item.getRefDataId());
            if (!animalOrderTimePolicyService.canOrderAt(orderAt, categoryKey)) {
                throw TwinBusinessException.of(
                        ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CLOSED,
                        "当前不在可购时间窗口内");
            }
            LocalDate lineEta = animalOrderTimePolicyService.estimateDeliveryAt(orderAt, categoryKey);
            if (maxEta == null || lineEta.isAfter(maxEta)) {
                maxEta = lineEta;
            }
        }
        order.setEstimatedDeliveryDate(maxEta);

        orderMapper.insert(order);

        List<String> itemNames = new ArrayList<>();
        for (RefCart item : itemsToProcess) {
            RefOrderLine line = new RefOrderLine();
            line.setOrderId(order.getId());
            line.setRefDataId(item.getRefDataId());
            line.setSpecSelections(item.getSpecSelections());
            line.setHierarchyChain(resolveHierarchyChain(item.getRefDataId()));
            line.setQuantity(item.getQuantity());
            // 行备注：优先 package_remark 快照，不再依赖加购 remark
            String lineRemark = StringUtils.hasText(item.getPackageRemark())
                    ? item.getPackageRemark()
                    : item.getRemark();
            line.setLineRemark(lineRemark);
            line.setAddedBy(item.getAddedBy());
            line.setAupRecordId(item.getAupRecordId());
            orderLineMapper.insert(line);
            RefData refData = referenceDataMapper.findById(item.getRefDataId());
            if (refData != null) {
                itemNames.add(extractDisplayName(refData));
            }
        }

        if (!cartIdsToClear.isEmpty()) {
            cartMapper.deleteByIds(cartIdsToClear);
        } else if (req.getLines() == null || req.getLines().isEmpty()) {
            cartMapper.deleteByGroupId(req.getGroupId());
        }

        String aupNote = headerAup != null
                ? "，AUP " + headerAup.getRegisterNo()
                : "，多 AUP 行级归因";
        logOrderAction(order.getId(), "CREATED", userId,
                "提交订单，共 " + itemsToProcess.size() + " 项" + aupNote);
        notifyReceivers(order, userId, itemNames);
        return Result.success(toOrderView(orderMapper.findById(order.getId())));
    }

    /** 解析并校验下单 AUP：必须存在、已批准、属于当前登录用户的课题组。返回 null 表示未传或未命中。 */
    private AupRecord resolveAupForOrder(Long aupRecordId, String userId) {
        if (aupRecordId == null) {
            return null;
        }
        AupRecord aup = aupRecordMapper.selectById(aupRecordId);
        if (aup == null || !"approved".equals(aup.getCurrentStage())) {
            return null;
        }
        String userGroup = resolveProjectGroupName(userId);
        if (StringUtils.hasText(userGroup) && StringUtils.hasText(aup.getProjectGroupName())
                && !userGroup.equals(aup.getProjectGroupName())) {
            return null;
        }
        return aup;
    }

    /** 登录用户的课题组名：优先 aro_personnel，回退 sys_user。与订购侧下拉同源，杜绝客户端指定课题组绕过。 */
    private String resolveProjectGroupName(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        try {
            // STAFF_* 账号需经 user_aro_binding 展开成 aro_user_id，再索引 aro_personnel
            String aroUserId = userId;
            if (userId.startsWith("STAFF_")) {
                UserAroBinding binding = userAroBindingMapper.selectByUserId(userId);
                if (binding != null && StringUtils.hasText(binding.getAroUserId())) {
                    aroUserId = binding.getAroUserId();
                }
            }
            AroPersonnel p = aroPersonnelMapper.findByUserId(aroUserId);
            if (p != null && StringUtils.hasText(p.getProjectGroupName())) {
                return p.getProjectGroupName();
            }
            if (!aroUserId.equals(userId)) {
                AroPersonnel p2 = aroPersonnelMapper.findByUserId(userId);
                if (p2 != null && StringUtils.hasText(p2.getProjectGroupName())) {
                    return p2.getProjectGroupName();
                }
            }
            List<String> rows = jdbcTemplate.queryForList(
                    "SELECT project_group_name FROM sys_user WHERE id = ?", String.class, userId);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    /** 按行用各自 aup_record_id 校验白名单。 */
    private String validateOrderLinesAgainstAllowlist(List<RefCart> items) {
        Map<Long, AupRecord> aupCache = new HashMap<>();
        Map<Long, List<Map<String, Object>>> allowCache = new HashMap<>();
        for (RefCart item : items) {
            Long aupId = item.getAupRecordId();
            if (aupId == null) {
                return "订单行缺少 AUP 归属";
            }
            AupRecord aup = aupCache.computeIfAbsent(aupId, id -> aupRecordMapper.selectById(id));
            if (aup == null || !"approved".equals(aup.getCurrentStage())) {
                return "订单行关联的 AUP 无效或未获批准";
            }
            if (!StringUtils.hasText(aup.getAnimalAllowlist())) {
                continue;
            }
            List<Map<String, Object>> entries = allowCache.computeIfAbsent(aupId,
                    id -> parseAllowlist(aup.getAnimalAllowlist()));
            if (entries.isEmpty()) {
                continue;
            }
            if (!isAllowedByAllowlist(aup, entries, item.getRefDataId())) {
                String name = extractDisplayName(referenceDataMapper.findById(item.getRefDataId()));
                return "动物「" + name + "」不符合当前AUP（" + aup.getRegisterNo() + "）";
            }
        }
        return null;
    }

    private String validateItemAgainstAllowlist(AupRecord aup, Long refDataId) {
        if (aup == null || !StringUtils.hasText(aup.getAnimalAllowlist())) {
            return null;
        }
        List<Map<String, Object>> entries = parseAllowlist(aup.getAnimalAllowlist());
        if (entries.isEmpty()) {
            return null;
        }
        if (!isAllowedByAllowlist(aup, entries, refDataId)) {
            return "不符合当前AUP";
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseAllowlist(String json) {
        try {
            Object o = objectMapper.readValue(json, Object.class);
            if (o instanceof List<?> l) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object item : l) {
                    if (item instanceof Map<?, ?> m) {
                        out.add((Map<String, Object>) m);
                    }
                }
                return out;
            }
        } catch (Exception e) {
            log.warn("解析 AUP 白名单失败: {}", e.getMessage());
        }
        return List.of();
    }

    /**
     * 判断 refDataId 是否命中白名单；ARO 同步计划书（created_by=aro）走放宽匹配。
     *
     * <p>当前默认<b>不判定</b>（{@code enforce=false} 直接放行）：AUP 的 B5/B6 最深只到品系，
     * 订购链却有「规格(GENOTYPE) → 规格选项」两层更细的粒度，两侧口径尚未定稿。
     * 白名单仍照常构建并写入 {@code aup_record.animal_allowlist}，接口与匹配算法全部保留，
     * 口径定了把 {@code reference-data.animal-allowlist.enforce} 置 true 即可启用。
     */
    private boolean isAllowedByAllowlist(AupRecord aup, List<Map<String, Object>> entries, Long leafId) {
        // ponytail: 判定已暂停。启用前必须先修两处已知缺陷，否则口径是错的——
        //   1) B5 生成的「品种/SUBTREE」比 B6 的「品系/EXACT」更宽，任一命中即放行，
        //      导致品系限制被架空（申报了实验小鼠 → BALB/c 也能买）。
        //   2) EXACT 仅在命中节点就是被订购叶子时成立；一旦 ref_data 建出 GENOTYPE(规格)
        //      子节点，订购规格叶子会被误拒。现在不爆只因 GENOTYPE 表内 0 条。
        // 升级路径：改为「每条动物记录取能解析到的最深节点 + 统一 SUBTREE」，见 AupAnimalAllowlistCompat。
        if (!animalAllowlistEnforce) {
            return true;
        }
        if (aup != null && SYNC_ACTOR_ARO.equals(aup.getCreatedBy())) {
            return allowlistCompat.isAllowedRelaxed(entries, leafId, referenceDataMapper);
        }
        return allowlistCompat.isAllowed(entries, leafId, referenceDataMapper);
    }

    private static final String SYNC_ACTOR_ARO = "aro";

    /** AUP 动物白名单是否参与下单校验。默认 false = 仅留接口不判定。 */
    @Value("${reference-data.animal-allowlist.enforce:false}")
    private boolean animalAllowlistEnforce;

    private Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
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
        List<RefOrderLog> rows = orderLogMapper.listByOrderId(orderId);
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        Set<String> operatorIds = rows.stream()
                .map(RefOrderLog::getOperatorId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<String, String> nameMap = userDisplayNameService.resolveDisplayNames(operatorIds);
        return rows.stream().map(row -> toLogView(row, nameMap)).toList();
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

    private List<RefCartView> toCartViews(List<RefCart> rows) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        Set<String> userIds = rows.stream()
                .map(RefCart::getAddedBy)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<String, String> nameMap = userDisplayNameService.resolveDisplayNames(userIds);

        Set<Long> refIds = rows.stream()
                .map(RefCart::getRefDataId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, String> labelMap = new HashMap<>();
        for (Long refId : refIds) {
            labelMap.put(refId, extractDisplayName(referenceDataMapper.findById(refId)));
        }
        return rows.stream().map(row -> toCartView(row, nameMap, labelMap)).toList();
    }

    private RefCartView toCartView(RefCart row) {
        return toCartView(row, null, null);
    }

    private RefCartView toCartView(RefCart row, Map<String, String> nameMap, Map<Long, String> labelMap) {
        if (row == null) return null;
        RefCartView v = new RefCartView();
        v.setId(row.getId());
        v.setGroupId(row.getGroupId());
        v.setRefDataId(row.getRefDataId());
        v.setAupRecordId(row.getAupRecordId());
        // 与 fieldData 一致：尽量解析为对象，避免前端拿到原始 JSON 字符串
        if (StringUtils.hasText(row.getSpecSelections())) {
            try {
                v.setSpecSelections(objectMapper.readValue(row.getSpecSelections(), Object.class));
            } catch (Exception e) {
                v.setSpecSelections(row.getSpecSelections());
            }
        } else {
            v.setSpecSelections(row.getSpecSelections());
        }
        v.setQuantity(row.getQuantity());
        v.setRemark(row.getRemark());
        v.setPackageStatus(row.getPackageStatus() != null ? row.getPackageStatus() : "DRAFT");
        v.setPackageRemark(row.getPackageRemark());
        v.setAddedBy(row.getAddedBy());
        if (StringUtils.hasText(row.getAddedBy())) {
            String uid = row.getAddedBy().trim();
            String name = nameMap != null ? nameMap.get(uid) : null;
            if (!StringUtils.hasText(name)) {
                name = userDisplayNameService.resolveDisplayName(uid);
            }
            v.setAddedByName(StringUtils.hasText(name) ? name : uid);
        }
        if (row.getRefDataId() != null) {
            String label = labelMap != null ? labelMap.get(row.getRefDataId()) : null;
            if (!StringUtils.hasText(label)) {
                label = extractDisplayName(referenceDataMapper.findById(row.getRefDataId()));
            }
            v.setRefDataLabel(label);
        }
        v.setAddedAt(row.getAddedAt());
        return v;
    }

    private RefOrderView toOrderView(RefOrder row) {
        if (row == null) return null;
        RefOrderView v = new RefOrderView();
        v.setId(row.getId());
        v.setGroupId(row.getGroupId());
        v.setSubmitterId(row.getSubmitterId());
        v.setProjectGroupName(row.getProjectGroupName());
        v.setProjectGroupId(row.getProjectGroupId());
        v.setAupRecordId(row.getAupRecordId());
        v.setRegisterNo(row.getRegisterNo());
        v.setStatus(row.getStatus());
        v.setSubmitRemark(row.getSubmitRemark());
        v.setSubmittedAt(row.getSubmittedAt());
        v.setEstimatedDeliveryDate(row.getEstimatedDeliveryDate());
        v.setCreatedAt(row.getCreatedAt());

        List<RefOrderLine> lines = orderLineMapper.listByOrderId(row.getId());
        Set<String> nameIds = new LinkedHashSet<>();
        if (StringUtils.hasText(row.getSubmitterId())) {
            nameIds.add(row.getSubmitterId().trim());
        }
        if (lines != null) {
            for (RefOrderLine line : lines) {
                if (line != null && StringUtils.hasText(line.getAddedBy())) {
                    nameIds.add(line.getAddedBy().trim());
                }
            }
        }
        Map<String, String> nameMap = userDisplayNameService.resolveDisplayNames(nameIds);

        String submitterResolved = null;
        if (StringUtils.hasText(row.getSubmitterId())) {
            submitterResolved = nameMap.get(row.getSubmitterId().trim());
        }
        if (!StringUtils.hasText(submitterResolved) && StringUtils.hasText(row.getSubmitterId())) {
            submitterResolved = userDisplayNameService.resolveDisplayName(row.getSubmitterId());
        }
        if (!StringUtils.hasText(submitterResolved)) {
            submitterResolved = row.getSubmitterName();
        }
        v.setSubmitterName(submitterResolved);

        Map<Long, String> aupRegisterNoCache = new HashMap<>();
        v.setLines(lines == null ? List.of() : lines.stream()
                .map(line -> toOrderLineView(line, aupRegisterNoCache, nameMap))
                .toList());
        return v;
    }

    private RefOrderLineView toOrderLineView(RefOrderLine row,
                                            Map<Long, String> aupRegisterNoCache,
                                            Map<String, String> nameMap) {
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
        v.setAddedBy(row.getAddedBy());
        if (StringUtils.hasText(row.getAddedBy())) {
            String uid = row.getAddedBy().trim();
            String name = nameMap != null ? nameMap.get(uid) : null;
            if (!StringUtils.hasText(name)) {
                name = userDisplayNameService.resolveDisplayName(uid);
            }
            v.setAddedByName(StringUtils.hasText(name) ? name : uid);
        }
        v.setAupRecordId(row.getAupRecordId());
        if (row.getAupRecordId() != null && aupRegisterNoCache != null) {
            String registerNo = aupRegisterNoCache.computeIfAbsent(row.getAupRecordId(), id -> {
                AupRecord aup = aupRecordMapper.selectById(id);
                return aup != null ? aup.getRegisterNo() : null;
            });
            v.setRegisterNo(registerNo);
        }
        return v;
    }

    /** Walk parent_id chain upward from a leaf. Returns JSON array [{id, refType, displayName}] leaf-first. */
    private String resolveBreedCategoryKey(Long refDataId) {
        List<RefData> ancestors = referenceDataMapper.findAncestors(refDataId);
        if (ancestors == null) {
            return null;
        }
        for (RefData node : ancestors) {
            if ("ANIMAL_BREED".equals(node.getRefType())) {
                return String.valueOf(node.getId());
            }
        }
        return null;
    }

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

    private RefOrderLogView toLogView(RefOrderLog row, Map<String, String> nameMap) {
        if (row == null) return null;
        RefOrderLogView v = new RefOrderLogView();
        v.setId(row.getId());
        v.setOrderId(row.getOrderId());
        v.setAction(row.getAction());
        v.setOperatorId(row.getOperatorId());
        if (StringUtils.hasText(row.getOperatorId())) {
            String uid = row.getOperatorId().trim();
            String name = nameMap != null ? nameMap.get(uid) : null;
            if (!StringUtils.hasText(name)) {
                name = userDisplayNameService.resolveDisplayName(uid);
            }
            v.setOperatorName(StringUtils.hasText(name) ? name : uid);
        }
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
            item.setAupRecordId(line.getAupRecordId());
            item.setSpecSelections(toJson(line.getSpecSelections()));
            item.setQuantity(line.getQuantity() != null ? line.getQuantity() : 1);
            item.setRemark(line.getRemark());
            item.setPackageRemark(line.getPackageRemark() != null ? line.getPackageRemark() : line.getLineRemark());
            item.setPackageStatus(line.getPackageStatus());
            item.setAddedBy(StringUtils.hasText(line.getAddedBy()) ? line.getAddedBy() : userId);
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
            String[] candidateKeys = {
                    "title", "subtitle",
                    "chineseName", "genotypeName", "supplierName", "englishName", "shortName"
            };
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

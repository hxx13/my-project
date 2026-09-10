package com.example.demo.modules.referencedata.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.animalorder.AnimalOrderCampus;
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
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
        entity.setPickupRoomId(trimToNull(req.getPickupRoomId()));
        entity.setPickupRoomName(trimToNull(req.getPickupRoomName()));
        entity.setCollectorId(trimToNull(req.getCollectorId()));
        entity.setCollectorName(trimToNull(req.getCollectorName()));
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
        if (trimToNull(req.getPickupRoomId()) != null) existing.setPickupRoomId(trimToNull(req.getPickupRoomId()));
        if (trimToNull(req.getPickupRoomName()) != null) existing.setPickupRoomName(trimToNull(req.getPickupRoomName()));
        if (trimToNull(req.getCollectorId()) != null) existing.setCollectorId(trimToNull(req.getCollectorId()));
        if (trimToNull(req.getCollectorName()) != null) existing.setCollectorName(trimToNull(req.getCollectorName()));
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
        String campus = AnimalOrderCampus.normalize(req.getCampus());
        order.setCampus(campus);
        order.setSubmitterId(userId);
        // 展示名以后端统一解析为准（兼容 staffId / 19 位 id），不依赖前端传入
        String resolvedSubmitterName = userDisplayNameService.resolveDisplayName(userId);
        order.setSubmitterName(StringUtils.hasText(resolvedSubmitterName)
                ? resolvedSubmitterName
                : (StringUtils.hasText(req.getSubmitterName()) ? req.getSubmitterName().trim() : userId));
        // 课题组以服务端解析为准，不信客户端传值：
        // STAFF_ 账号的 sys_user.project_group_name 常为空，必须经
        // user_aro_binding → aro_personnel 展开才能拿到（与购物车 groupId 同一口径）。
        // 曾经直接落 req.getProjectGroupName()，导致教职工下单后「课题组」列全空。
        // 指定了 AUP 时以 AUP 的课题组为准：多课题组账号可能拿第二个组的 AUP 下单，
        // 若仍落主课题组名，这单在自己的订单列表（按本人课题组筛选）里就会消失。
        String groupName = headerAup != null && StringUtils.hasText(headerAup.getProjectGroupName())
                ? headerAup.getProjectGroupName().trim()
                : resolveProjectGroupName(userId);
        if (!StringUtils.hasText(groupName)) {
            groupName = req.getProjectGroupName();
        }
        order.setProjectGroupName(trimToNull(groupName));
        if (headerAup != null) {
            order.setProjectGroupId(headerAup.getProjectGroupId() != null
                    ? headerAup.getProjectGroupId()
                    : resolveProjectGroupIdByName(groupName));
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
            if (order.getProjectGroupId() == null) {
                order.setProjectGroupId(resolveProjectGroupIdByName(groupName));
            }
        }
        order.setStatus("PENDING");
        order.setSubmitRemark(req.getSubmitRemark());
        order.setSubmittedAt(LocalDateTime.now());

        ZonedDateTime orderAt = ZonedDateTime.now(ORDER_ZONE);
        LocalDate maxEta = null;
        for (RefCart item : itemsToProcess) {
            String categoryKey = resolveBreedCategoryKey(item.getRefDataId());
            if (!animalOrderTimePolicyService.canOrderAt(campus, orderAt, categoryKey)) {
                throw TwinBusinessException.of(
                        ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CLOSED,
                        "当前不在可购时间窗口内");
            }
            LocalDate lineEta = animalOrderTimePolicyService.estimateDeliveryAt(campus, orderAt, categoryKey);
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
            // 领用方式/房间与领用人：从购物车行快照到订单行，后续购物车清空不影响历史单
            line.setPickupRoomId(item.getPickupRoomId());
            line.setPickupRoomName(item.getPickupRoomName());
            line.setCollectorId(item.getCollectorId());
            line.setCollectorName(item.getCollectorName());
            RefData refData = referenceDataMapper.findById(item.getRefDataId());
            // 单价快照：下单这一刻的价格，物品后续改价不影响本单
            line.setUnitPrice(resolveUnitPrice(parseFieldData(refData), extractSpecOption(item.getSpecSelections())));
            orderLineMapper.insert(line);
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
        List<String> myGroups = resolveProjectGroupNames(userId);
        if (!myGroups.isEmpty() && StringUtils.hasText(aup.getProjectGroupName())
                && !matchesAnyOfMyGroups(myGroups, aup.getProjectGroupName())) {
            return null;
        }
        return aup;
    }

    /**
     * 当前登录人所在课题组的成员，供下单时选择领用人。
     *
     * <p>刻意**不接收课题组参数**：只能查本人课题组，从根上杜绝越权查他人课题组。
     * 返回项已排除本人（下单弹窗默认就是「本人」，列表只列可代领的其他人）。
     */
    public Result<List<Map<String, Object>>> listMyGroupMembers(String userId) {
        List<String> groups = resolveProjectGroupNames(userId);
        if (groups.isEmpty()) {
            return Result.success(List.of());
        }
        // 成员行自身的 project_group_name 也可能是多组拼接串，单值 IN 会漏掉这类人：
        // 先用本人组名做一次宽松 LIKE 取候选，再用 sameGroup 逐组精确复核（LIKE 的子串误召回在这里被滤掉）。
        String where = groups.stream()
                .map(g -> "(project_group_name = ? OR project_group_name LIKE CONCAT('%', ?, '%'))")
                .collect(Collectors.joining(" OR "));
        List<Object> args = new ArrayList<>();
        for (String g : groups) {
            args.add(g);
            args.add(g);
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT staff_id, aro_user_id, name, job_number, project_group_name "
                        + "FROM personnel WHERE " + where + " ORDER BY name ASC", args.toArray());

        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            if (!matchesAnyOfMyGroups(groups, asText(row.get("project_group_name")))) {
                continue;
            }
            String accountId = firstNonBlank(asText(row.get("staff_id")), asText(row.get("aro_user_id")));
            if (!StringUtils.hasText(accountId) || accountId.equals(userId) || !seen.add(accountId)) {
                continue;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("accountId", accountId);
            m.put("name", firstNonBlank(asText(row.get("name")), accountId));
            m.put("jobNumber", asText(row.get("job_number")));
            out.add(m);
        }
        return Result.success(out);
    }

    private static String asText(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static String firstNonBlank(String a, String b) {
        return StringUtils.hasText(a) ? a : (b == null ? "" : b);
    }

    /** 课题组名 → project_group.id；查不到返回 null（不阻断下单）。 */
    private Long resolveProjectGroupIdByName(String projectGroupName) {
        if (!StringUtils.hasText(projectGroupName)) {
            return null;
        }
        try {
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM project_group WHERE name = ? LIMIT 1", Long.class, projectGroupName.trim());
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 登录用户的课题组名列表：优先 aro_personnel，回退 sys_user。与订购侧下拉同源，杜绝客户端指定课题组绕过。
     *
     * <p>aro_personnel.project_group_name 是多课题组时逗号/顿号拼接的字段，必须拆开用；
     * 整串去比对 aup_record/ref_order 的单值课题组列永远不命中。
     */
    private List<String> resolveProjectGroupNames(String userId) {
        if (userId == null || userId.isBlank()) {
            return List.of();
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
            if (p == null && !aroUserId.equals(userId)) {
                p = aroPersonnelMapper.findByUserId(userId);
            }
            if (p != null && StringUtils.hasText(p.getProjectGroupName())) {
                return PersonnelProjectGroupUtil.splitGroups(p.getProjectGroupName());
            }
            List<String> rows = jdbcTemplate.queryForList(
                    "SELECT project_group_name FROM sys_user WHERE id = ?", String.class, userId);
            return rows.isEmpty() ? List.of() : PersonnelProjectGroupUtil.splitGroups(rows.get(0));
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 主课题组名（多课题组账号取第一个）：写入只存单值的课题组列、以及单值筛选口径用。 */
    private String resolveProjectGroupName(String userId) {
        List<String> groups = resolveProjectGroupNames(userId);
        return groups.isEmpty() ? null : groups.get(0);
    }

    /** 某课题组名是否命中本人课题组（多课题组账号命中任一即算，逐组精确比对不做模糊）。 */
    private static boolean matchesAnyOfMyGroups(List<String> myGroups, String groupName) {
        return StringUtils.hasText(groupName)
                && myGroups.stream().anyMatch(g -> PersonnelProjectGroupUtil.sameGroup(g, groupName));
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

    /** 全部订单（后台审核页：全字段筛选 + 分页） */
    public Map<String, Object> listAllOrders(int page, int pageSize, RefOrderQuery query) {
        RefOrderQuery q = normalizeQuery(query);
        int offset = (page - 1) * pageSize;
        List<RefOrderView> list = orderMapper.listAll(q, pageSize, offset)
                .stream().map(this::toOrderView).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", list);
        out.put("total", orderMapper.countAll(q));
        out.put("page", page);
        out.put("pageSize", pageSize);
        return out;
    }

    // ── 待处理订单编辑（回填购物车 → 改 → 保存回原单）──
    // 关键约束：编辑期间**原单完全不动**，只有 applyOrderEdit 才写回；
    // 回填行带 editing_order_id 标记，放弃/重入/保存都按标记精确定位，
    // 既不会误删用户其它购物车内容，也不会因中途退出留下半成品订单。

    /** 校验可编辑：存在 + 待处理 + 有权限（本课题组；allowAnyGroup=管理员放行）。 */
    private RefOrder requireEditableOrder(Long orderId, String userId, boolean allowAnyGroup) {
        RefOrder o = orderMapper.findById(orderId);
        if (o == null || !"PENDING".equalsIgnoreCase(o.getStatus())) {
            return null;
        }
        if (allowAnyGroup) {
            return o;
        }
        if (!matchesAnyOfMyGroups(resolveProjectGroupNames(userId), o.getProjectGroupName())) {
            return null;
        }
        return o;
    }

    @Transactional(rollbackFor = Exception.class)
    public Result<List<RefCartView>> loadOrderToCart(Long orderId, String userId, boolean allowAnyGroup) {
        RefOrder o = requireEditableOrder(orderId, userId, allowAnyGroup);
        if (o == null) {
            return Result.error("订单不存在、不是待处理状态，或无权编辑");
        }
        // 重入编辑：先清旧的回填行，保证幂等
        cartMapper.deleteByEditingOrderId(orderId);

        for (RefOrderLine l : orderLineMapper.listByOrderId(orderId)) {
            RefCart c = new RefCart();
            c.setGroupId(o.getGroupId());
            c.setRefDataId(l.getRefDataId());
            c.setAupRecordId(l.getAupRecordId());
            c.setSpecSelections(l.getSpecSelections());
            c.setQuantity(l.getQuantity());
            c.setPickupRoomId(l.getPickupRoomId());
            c.setPickupRoomName(l.getPickupRoomName());
            c.setCollectorId(l.getCollectorId());
            c.setCollectorName(l.getCollectorName());
            c.setEditingOrderId(orderId);
            c.setRemark(null);
            c.setPackageStatus("DRAFT");
            c.setPackageRemark(null);
            c.setAddedBy(userId);
            cartMapper.insert(c);
        }
        return Result.success(toCartViews(cartMapper.listByEditingOrderId(orderId)));
    }

    /** 放弃编辑：只清回填行，原单不受影响。 */
    @Transactional(rollbackFor = Exception.class)
    public Result<Void> discardOrderEdit(Long orderId, String userId, boolean allowAnyGroup) {
        RefOrder o = requireEditableOrder(orderId, userId, allowAnyGroup);
        if (o == null) {
            return Result.error("订单不存在、不是待处理状态，或无权编辑");
        }
        cartMapper.deleteByEditingOrderId(orderId);
        return Result.success(null);
    }

    /** 保存编辑：用回填行整体替换原单明细，单号与状态都不变（链条不断）。 */
    @Transactional(rollbackFor = Exception.class)
    public Result<RefOrderView> applyOrderEdit(Long orderId, String userId, boolean allowAnyGroup) {
        RefOrder o = requireEditableOrder(orderId, userId, allowAnyGroup);
        if (o == null) {
            return Result.error("订单不存在、不是待处理状态，或无权编辑");
        }
        List<RefCart> rows = cartMapper.listByEditingOrderId(orderId);
        if (rows.isEmpty()) {
            return Result.error("没有待保存的编辑内容");
        }

        orderLineMapper.deleteByOrderId(orderId);
        List<String> itemNames = new ArrayList<>();
        for (RefCart c : rows) {
            RefOrderLine l = new RefOrderLine();
            l.setOrderId(orderId);
            l.setRefDataId(c.getRefDataId());
            l.setSpecSelections(c.getSpecSelections());
            l.setHierarchyChain(resolveHierarchyChain(c.getRefDataId()));
            l.setQuantity(c.getQuantity());
            l.setLineRemark(StringUtils.hasText(c.getPackageRemark()) ? c.getPackageRemark() : c.getRemark());
            l.setAddedBy(StringUtils.hasText(c.getAddedBy()) ? c.getAddedBy() : userId);
            l.setAupRecordId(c.getAupRecordId());
            l.setPickupRoomId(c.getPickupRoomId());
            l.setPickupRoomName(c.getPickupRoomName());
            l.setCollectorId(c.getCollectorId());
            l.setCollectorName(c.getCollectorName());
            RefData refData = referenceDataMapper.findById(c.getRefDataId());
            l.setUnitPrice(resolveUnitPrice(parseFieldData(refData), extractSpecOption(c.getSpecSelections())));
            orderLineMapper.insert(l);
            if (refData != null) {
                itemNames.add(extractDisplayName(refData));
            }
        }
        cartMapper.deleteByEditingOrderId(orderId);
        logOrderAction(orderId, "EDITED", userId, "编辑订单明细，共 " + rows.size() + " 项");
        return Result.success(toOrderView(orderMapper.findById(orderId)));
    }

    /**
     * 学生端：本人所在课题组的订单（同组成员互见）。
     *
     * <p>课题组由服务端解析并**强制**写进过滤条件——客户端传的课题组一律被覆盖，
     * 避免越权看别组；解析不到课题组时返回空，而不是退化成「查全部」。
     */
    public Map<String, Object> listMyGroupOrders(String userId, int page, int pageSize, RefOrderQuery query) {
        RefOrderQuery q = scopeToMyGroup(userId, query);
        if (q == null) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("list", List.of());
            empty.put("total", 0);
            empty.put("page", page);
            empty.put("pageSize", pageSize);
            return empty;
        }
        int offset = (page - 1) * pageSize;
        List<RefOrderView> list = orderMapper.listAll(q, pageSize, offset)
                .stream().map(this::toOrderView).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", list);
        out.put("total", orderMapper.countAll(q));
        out.put("page", page);
        out.put("pageSize", pageSize);
        return out;
    }

    /** 学生端导出：同样只导出本人课题组。 */
    public List<RefOrderView> listMyGroupOrdersForExport(String userId, RefOrderQuery query) {
        RefOrderQuery q = scopeToMyGroup(userId, query);
        if (q == null) {
            return List.of();
        }
        return orderMapper.listAll(q, EXPORT_MAX_ROWS, 0).stream().map(this::toOrderView).toList();
    }

    /** 归一筛选条件并把课题组钉死为调用者本人课题组；解析不到课题组返回 null。 */
    private RefOrderQuery scopeToMyGroup(String userId, RefOrderQuery query) {
        List<String> groups = resolveProjectGroupNames(userId);
        if (groups.isEmpty()) {
            return null;
        }
        RefOrderQuery q = normalizeQuery(query);
        // 客户端传的模糊课题组一律丢弃，改用具名精确匹配
        q.setProjectGroup(null);
        q.setGroupIn(groups);
        return q;
    }

    /** 导出用：区间内全部订单（不分页，同样走全字段筛选）。 */
    public List<RefOrderView> listOrdersForExport(RefOrderQuery query) {
        return orderMapper.listAll(normalizeQuery(query), EXPORT_MAX_ROWS, 0)
                .stream().map(this::toOrderView).toList();
    }

    /** 筛选条件归一：空串统一成 null，校区走枚举归一，避免把 "" 当条件传下去。 */
    private RefOrderQuery normalizeQuery(RefOrderQuery query) {
        RefOrderQuery q = query != null ? query : new RefOrderQuery();
        q.setCampus(StringUtils.hasText(q.getCampus()) ? AnimalOrderCampus.normalize(q.getCampus()) : null);
        q.setFrom(StringUtils.hasText(q.getFrom()) ? q.getFrom().trim() : null);
        q.setTo(StringUtils.hasText(q.getTo()) ? q.getTo().trim() : null);
        q.setStatus(trimToNull(q.getStatus()));
        q.setStatusNot(trimToNull(q.getStatusNot()));
        q.setSource(trimToNull(q.getSource()));
        q.setSn(trimToNull(q.getSn()));
        q.setAup(trimToNull(q.getAup()));
        q.setProjectGroup(trimToNull(q.getProjectGroup()));
        q.setSupplier(trimToNull(q.getSupplier()));
        q.setStrain(trimToNull(q.getStrain()));
        q.setCollector(trimToNull(q.getCollector()));
        q.setRoom(trimToNull(q.getRoom()));
        q.setRemark(trimToNull(q.getRemark()));
        return q;
    }

    /** 下拉候选白名单：列名进 ${} 拼接，必须由服务端校验后再用；值 = 该列所在表。 */
    private static final Map<String, Boolean> FILTER_COLUMNS_ON_LINE = Map.of(
            "supplier_name", true,
            "strain_name", true,
            "collector_name", true,
            "pickup_room_name", true,
            "project_group_name", false,
            "register_no", false
    );

    /** 学生端筛选候选：范围限定本人课题组，避免借候选枚举全库。 */
    public Result<List<String>> distinctMyGroupFilterValues(String userId, String column) {
        Boolean onLine = FILTER_COLUMNS_ON_LINE.get(column);
        if (onLine == null) {
            return Result.error("不支持的筛选列");
        }
        List<String> groups = resolveProjectGroupNames(userId);
        if (groups.isEmpty()) {
            return Result.success(List.of());
        }
        return Result.success(onLine
                ? orderMapper.distinctLineValuesInGroup(column, groups)
                : orderMapper.distinctOrderValuesInGroup(column, groups));
    }

    public Result<List<String>> distinctFilterValues(String column) {
        Boolean onLine = FILTER_COLUMNS_ON_LINE.get(column);
        if (onLine == null) {
            return Result.error("不支持的筛选列");
        }
        return Result.success(onLine
                ? orderMapper.distinctLineValues(column)
                : orderMapper.distinctOrderValues(column));
    }

    private static final int EXPORT_MAX_ROWS = 20000;

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

    /** 去空白后为空则归一为 null，避免把 "" 写进可空列。 */
    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
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
        Map<Long, RefData> refDataMap = new HashMap<>();
        for (Long refId : refIds) {
            RefData refData = referenceDataMapper.findById(refId);
            refDataMap.put(refId, refData);
            labelMap.put(refId, extractDisplayName(refData));
        }
        return rows.stream().map(row -> toCartView(row, nameMap, labelMap, refDataMap)).toList();
    }

    private RefCartView toCartView(RefCart row) {
        return toCartView(row, null, null, null);
    }

    private RefCartView toCartView(RefCart row, Map<String, String> nameMap, Map<Long, String> labelMap) {
        return toCartView(row, nameMap, labelMap, null);
    }

    private RefCartView toCartView(RefCart row, Map<String, String> nameMap,
                                   Map<Long, String> labelMap, Map<Long, RefData> refDataMap) {
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
        v.setPickupRoomId(row.getPickupRoomId());
        v.setPickupRoomName(row.getPickupRoomName());
        v.setCollectorId(row.getCollectorId());
        v.setCollectorName(row.getCollectorName());
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
            RefData refData = refDataMap != null ? refDataMap.get(row.getRefDataId()) : null;
            if (refData == null) {
                refData = referenceDataMapper.findById(row.getRefDataId());
            }
            if (!StringUtils.hasText(label)) {
                label = extractDisplayName(refData);
            }
            v.setRefDataLabel(label);

            Map<String, Object> fd = parseFieldData(refData);
            v.setPriceEnabled(Boolean.TRUE.equals(fd.get("priceEnabled")));
            BigDecimal unit = resolveUnitPrice(fd, extractSpecOption(row.getSpecSelections()));
            v.setUnitPrice(unit);
            v.setLineAmount(lineAmount(unit, row.getQuantity()));
        }
        v.setAddedAt(row.getAddedAt());
        return v;
    }

    private RefOrderView toOrderView(RefOrder row) {
        if (row == null) return null;
        RefOrderView v = new RefOrderView();
        v.setId(row.getId());
        v.setSn(row.getSn());
        v.setSource(StringUtils.hasText(row.getSource()) ? row.getSource() : "LOCAL");
        v.setGroupId(row.getGroupId());
        v.setSubmitterId(row.getSubmitterId());
        v.setProjectGroupName(row.getProjectGroupName());
        v.setProjectGroupId(row.getProjectGroupId());
        v.setAupRecordId(row.getAupRecordId());
        v.setRegisterNo(row.getRegisterNo());
        v.setCampus(row.getCampus());
        v.setAroAreaName(row.getAroAreaName());
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
        // ARO 导入单的 submitterId 是合成键（ARO:xxx），拿它反查展示名只会返回它本身，
        // 反而把快照里的真实姓名盖掉，所以这类单直接用 submitter_name。
        if (!"ARO".equalsIgnoreCase(row.getSource())) {
            if (StringUtils.hasText(row.getSubmitterId())) {
                submitterResolved = nameMap.get(row.getSubmitterId().trim());
            }
            if (!StringUtils.hasText(submitterResolved) && StringUtils.hasText(row.getSubmitterId())) {
                submitterResolved = userDisplayNameService.resolveDisplayName(row.getSubmitterId());
            }
        }
        if (!StringUtils.hasText(submitterResolved)) {
            submitterResolved = row.getSubmitterName();
        }
        v.setSubmitterName(submitterResolved);

        Map<Long, String> aupRegisterNoCache = new HashMap<>();
        List<RefOrderLineView> lineViews = lines == null ? List.of() : lines.stream()
                .map(line -> toOrderLineView(line, aupRegisterNoCache, nameMap))
                .toList();
        v.setLines(lineViews);

        // 总金额只累加有定价的行；整单无定价时 totalAmount 保持 null（前端显示「—」而非 0）
        BigDecimal total = null;
        for (RefOrderLineView lv : lineViews) {
            if (lv != null && lv.getUnitPrice() != null && lv.getLineAmount() != null) {
                total = (total == null ? BigDecimal.ZERO : total).add(lv.getLineAmount());
            }
        }
        v.setPriceEnabled(total != null);
        v.setTotalAmount(total);
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
        v.setSupplierName(row.getSupplierName());
        v.setStrainName(row.getStrainName());
        v.setSpecName(row.getSpecName());
        v.setSpecSelections(row.getSpecSelections());
        if (row.getHierarchyChain() != null) {
            try {
                v.setHierarchyChain(objectMapper.readValue(row.getHierarchyChain(), Object.class));
            } catch (Exception e) {
                v.setHierarchyChain(row.getHierarchyChain());
            }
        }
        v.setQuantity(row.getQuantity());
        // 价格取快照列，不重新解析 fieldData：物品后续改价不影响历史订单
        v.setUnitPrice(row.getUnitPrice());
        v.setLineAmount(lineAmount(row.getUnitPrice(), row.getQuantity()));
        v.setArrivalDate(row.getArrivalDate());
        v.setPickupRoomId(row.getPickupRoomId());
        v.setPickupRoomName(row.getPickupRoomName());
        v.setCollectorId(row.getCollectorId());
        v.setCollectorName(row.getCollectorName());
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
            item.setPickupRoomId(trimToNull(line.getPickupRoomId()));
            item.setPickupRoomName(trimToNull(line.getPickupRoomName()));
            item.setCollectorId(trimToNull(line.getCollectorId()));
            item.setCollectorName(trimToNull(line.getCollectorName()));
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

    // ── 价格 ──
    // 价格配置存在 ref_data.field_data：
    //   priceEnabled 该物品是否开启价格（每个物品单独开关）
    //   price        无规格物品的单价
    //   specPrices   有规格物品按规格选项定价 {"性别: 雌性": 80}，key 与 spec_selections.option 同串
    // 单价恒由服务端解析，前端只做展示，避免客户端伪造价格。

    private Map<String, Object> parseFieldData(RefData refData) {
        if (refData == null || !StringUtils.hasText(refData.getFieldData())) {
            return Map.of();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> fd = objectMapper.readValue(refData.getFieldData(), Map.class);
            return fd == null ? Map.of() : fd;
        } catch (JsonProcessingException e) {
            return Map.of();
        }
    }

    /** 从 spec_selections JSON 取 option 值（加购时写入的「模板名: 选项」串）。 */
    private String extractSpecOption(String specSelectionsJson) {
        if (!StringUtils.hasText(specSelectionsJson)) {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> sel = objectMapper.readValue(specSelectionsJson, Map.class);
            Object option = sel == null ? null : sel.get("option");
            return option == null ? null : option.toString().trim();
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /**
     * 解析单价（元）。未开启价格返回 null；有规格价按选项命中，未定价返回 null。
     * 纯函数，便于单测。
     */
    static BigDecimal resolveUnitPrice(Map<String, Object> fieldData, String specOption) {
        if (fieldData == null || !Boolean.TRUE.equals(fieldData.get("priceEnabled"))) {
            return null;
        }
        Object specPrices = fieldData.get("specPrices");
        if (specPrices instanceof Map<?, ?> map && !map.isEmpty()) {
            if (!StringUtils.hasText(specOption)) {
                return null;
            }
            return toMoney(map.get(specOption));
        }
        return toMoney(fieldData.get("price"));
    }

    /** 小计 = 单价 × 数量；单价缺失时返回 null（前端显示「待定」而不是 0）。 */
    static BigDecimal lineAmount(BigDecimal unitPrice, Integer quantity) {
        if (unitPrice == null) {
            return null;
        }
        int qty = quantity == null ? 0 : quantity;
        return unitPrice.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal toMoney(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof BigDecimal bd) {
            return bd.setScale(2, RoundingMode.HALF_UP);
        }
        if (raw instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue()).setScale(2, RoundingMode.HALF_UP);
        }
        String s = raw.toString().trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(s).setScale(2, RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean isValidStatusTransition(String current, String next) {        if (current == null || next == null) return false;
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

package com.example.demo.modules.animalorder.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.animalorder.config.AnimalOrderCageConfigSeed;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.entity.CageShelfIndex;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageOpRequestMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageDivisionService;
import com.example.demo.modules.cageshelf.service.CageFormAuditService;
import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import com.example.demo.modules.referencedata.entity.RefData;
import com.example.demo.modules.referencedata.mapper.CageOrderReservationMapper;
import com.example.demo.modules.referencedata.mapper.ReferenceDataMapper;
import com.example.demo.modules.student.service.StudentCageShelfService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 动物订购 → 笼位预定。
 *
 * <p>加购时把订单行锁定到一个「已预约空笼盒」（cage_type_code=2）笼位上，并把订购信息
 * （品系/性别/数量/来源/实验员）写进该笼位表单。笼位状态本身保持 2 不变 —— 预定记录
 * （{@link CageOrderReservation}，status=LOCKED）才是「已被谁、被哪张单占住」的真相源，
 * 因此不需要状态回滚：动物到货后再把预定转 CONSUMED、笼位 2→3。
 *
 * <p>三个硬约束：**同笼位只能有一条活跃预定**（靠 uk_reservation_active 唯一索引，不靠先查后插）、
 * **一笼一规格**（笼位已有性别/品系须与本单一致）、**受划分名单限制**（有划分只有名单内的人能占）。
 */
@Service
public class CageOrderReservationService {

    private static final Logger log = LoggerFactory.getLogger(CageOrderReservationService.class);
    private static final String MODULE = AnimalOrderCageConfigSeed.MODULE;
    /** 使用时间是 STRING 字段，格式对齐 ARO cageBoxVo.createTime（如 2026-03-09 08:27:36）。 */
    private static final DateTimeFormatter USE_TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final CageCellDetailMapper detailMapper;
    private final CageCellIndexMapper cellIndexMapper;
    private final CageShelfMapper cageShelfMapper;
    private final CageOpRequestMapper opRequestMapper;
    private final CageClaimMapper claimMapper;
    private final StudentCageShelfService studentCageShelfService;
    private final PersonIdentityService personIdentityService;
    private final CageDivisionService divisionService;
    private final CageInfoValueService infoValueService;
    private final CageFormAuditService auditService;
    private final CageOrderReservationMapper reservationMapper;
    private final AupRecordMapper aupRecordMapper;
    private final ReferenceDataMapper referenceDataMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final NotificationSettingsService settingsService;
    private final ObjectMapper objectMapper;

    public CageOrderReservationService(CageCellDetailMapper detailMapper,
                                       CageCellIndexMapper cellIndexMapper,
                                       CageShelfMapper cageShelfMapper,
                                       CageOpRequestMapper opRequestMapper,
                                       CageClaimMapper claimMapper,
                                       StudentCageShelfService studentCageShelfService,
                                       PersonIdentityService personIdentityService,
                                       CageDivisionService divisionService,
                                       CageInfoValueService infoValueService,
                                       CageFormAuditService auditService,
                                       CageOrderReservationMapper reservationMapper,
                                       AupRecordMapper aupRecordMapper,
                                       ReferenceDataMapper referenceDataMapper,
                                       UserDisplayNameService userDisplayNameService,
                                       NotificationSettingsService settingsService,
                                       ObjectMapper objectMapper) {
        this.detailMapper = detailMapper;
        this.cellIndexMapper = cellIndexMapper;
        this.cageShelfMapper = cageShelfMapper;
        this.opRequestMapper = opRequestMapper;
        this.claimMapper = claimMapper;
        this.studentCageShelfService = studentCageShelfService;
        this.personIdentityService = personIdentityService;
        this.divisionService = divisionService;
        this.infoValueService = infoValueService;
        this.auditService = auditService;
        this.reservationMapper = reservationMapper;
        this.aupRecordMapper = aupRecordMapper;
        this.referenceDataMapper = referenceDataMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.settingsService = settingsService;
        this.objectMapper = objectMapper;
    }

    // ==================== 配置 ====================

    /** 单笼位数量上限（设置中心可改）。配错/未配时回退默认值，不让配置错误挡住下单。 */
    public int maxQuantityPerCage() {
        String raw = settingsService.getEffectiveValue(
                MODULE, AnimalOrderCageConfigSeed.KEY_CAPACITY, AnimalOrderCageConfigSeed.DEFAULT_CAPACITY);
        try {
            int n = Integer.parseInt(String.valueOf(raw).trim());
            return n > 0 ? n : 5;
        } catch (Exception e) {
            return 5;
        }
    }

    /** 规格模板名 → 笼位字段 canonical。 */
    private Map<String, String> specFieldMapping() {
        String raw = settingsService.getEffectiveValue(
                MODULE, AnimalOrderCageConfigSeed.KEY_SPEC_MAPPING, AnimalOrderCageConfigSeed.DEFAULT_SPEC_MAPPING);
        try {
            Map<String, String> m = objectMapper.readValue(raw, new TypeReference<Map<String, String>>() {});
            return m != null ? m : Map.of();
        } catch (Exception e) {
            log.warn("[cage-reservation] 规格字段映射配置解析失败，按空处理: {}", e.getMessage());
            return Map.of();
        }
    }

    // ==================== 候选池 ====================

    /**
     * 该 AUP 名下「可以点」的笼位：type2 + AUP 同源 + 未被他人预定 + 划分名单放行。
     *
     * <p>**只管可点性，不管渲染哪些笼架** —— 渲染范围由 {@link #groupShelves} 按课题组给。
     * 用户口径：AUP 只决定「这只老鼠能放进哪个笼位」，不能决定「哪几排架子显示出来」，
     * 否则 AUP 归属为空或口径不一致的架子会整排消失，看起来像「检测不到本课题组的笼架」。
     */
    public Map<String, Object> reservableCages(Long aupRecordId, String userId) {
        if (aupRecordId == null) throw new TwinBusinessException(400, "请先选择 AUP");
        AupRecord aup = aupRecordMapper.selectById(aupRecordId);
        if (aup == null) throw new TwinBusinessException(400, "所选 AUP 不存在");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("aupRecordId", String.valueOf(aupRecordId));
        out.put("aupRegisterNo", aup.getRegisterNo());
        out.put("projectGroupName", aup.getProjectGroupName());
        out.put("maxQuantityPerCage", maxQuantityPerCage());

        List<String> selectable = new ArrayList<>();
        Map<String, String> reasons = new LinkedHashMap<>();
        List<Map<String, Object>> cells = new ArrayList<>();
        out.put("cells", cells);
        out.put("selectableCageIds", selectable);
        out.put("reasons", reasons);

        List<CageCellDetail> cages = detailMapper.selectReservableByAup(aupRecordId, aup.getRegisterNo());
        if (cages.isEmpty()) return out;

        List<Long> cageIds = cages.stream().map(CageCellDetail::getAnimalCageId).filter(Objects::nonNull).toList();

        // 活跃预定：他人锁着的不可点（自己锁的自己还看得到，避免刚选完就消失）
        Map<Long, CageOrderReservation> activeByCage = new HashMap<>();
        for (CageOrderReservation r : reservationMapper.listActiveByCageIds(cageIds)) {
            activeByCage.put(r.getAnimalCageId(), r);
        }
        // 笼位已有的性别/品系：前端据此把「与本单规格不同」的格子提前灰掉（一笼一规格）
        Map<Long, String> sexByCage = infoValueService.textValueByCage(cageIds, "animal_sex");
        Map<Long, String> strainByCage = infoValueService.textValueByCage(cageIds, "animal_strain_name");

        // 「只能选空笼位」：带特殊状态/待处理标记、或有分笼/转移在审（中间态）的笼位都不给点
        Map<Long, Map<String, Boolean>> statusFlags = infoValueService.statusFlagsByCage(cageIds);
        Set<Long> pendingOpCageIds = pendingOpCageIds();
        // 认领中间态（待审批/锁定/已确认/待释放审批）也是中间态，同样不能预定：
        // 那个笼位已经有另一套占用语义在走了，再塞一张订购预定会打架。
        Set<Long> claimedCageIds = new LinkedHashSet<>(claimMapper.selectCageIdsWithActiveClaim(cageIds));

        for (CageCellDetail cage : cages) {
            Long cid = cage.getAnimalCageId();
            if (cid == null) continue;
            CageOrderReservation active = activeByCage.get(cid);
            boolean mine = active != null && personIdentityService.samePerson(active.getReserverId(), userId);
            /**
             * 预定所处阶段：
             * `SELECTING`=某人已锁但还没加购（自己还在选）/ `IN_CART`=已加进购物车、PI 还没提交订单 /
             * `ORDERED`=已随订单提交。中间态要挡得住**任何人**——多人可能同时在选购同一个空笼位。
             */
            String cartState = null;
            if (active != null) {
                cartState = active.getOrderId() != null ? "ORDERED"
                        : active.getCartId() != null ? "IN_CART"
                        : "SELECTING";
            }
            String reserverName = active == null || isBlank(active.getReserverName()) ? "他人" : active.getReserverName();
            String reason = specialStatusReason(statusFlags.get(cid));
            if (reason == null && pendingOpCageIds.contains(cid)) {
                reason = "该笼位有分笼/转移在审，暂时不能预定";
            }
            if (reason == null && claimedCageIds.contains(cid)) {
                reason = "该笼位有认领申请在处理中，暂时不能预定";
            }
            if (reason == null && active != null) {
                if ("ORDERED".equals(cartState)) {
                    reason = "该笼位已下单，等待审批";
                } else if ("IN_CART".equals(cartState)) {
                    reason = mine ? "该笼位已在你的购物车中" : "该笼位已在" + reserverName + "的购物车中";
                } else if (!mine) {
                    reason = "已被" + reserverName + "预定";
                }
            }
            if (reason == null && divisionService.isBlocked(cid, userId)) {
                reason = "已划分给本课题组其他人";
            }
            Map<String, Object> cell = new LinkedHashMap<>();
            cell.put("animalCageId", String.valueOf(cid));
            cell.put("cartState", cartState);
            cell.put("aupNumber", trim(cage.getAupNumber()));
            cell.put("cageTypeCode", cage.getCageTypeCode());
            cell.put("sex", trim(sexByCage.get(cid)));
            cell.put("strainName", trim(strainByCage.get(cid)));
            cell.put("selectable", reason == null);
            cell.put("reason", reason);
            cell.put("reservedByMe", mine);
            cells.add(cell);
            if (reason == null) selectable.add(String.valueOf(cid));
        }
        return out;
    }

    /**
     * 本课题组在笼架树里占用的笼架 —— 抽屉的渲染范围，与 AUP 无关。
     *
     * <p>复用 {@code StudentCageShelfService.resolveOwnGroupShelveIdsByUserId} 的课题组归属判定
     * （project_pi_name / department_name 比对），与刷卡弹窗的平面图同源，不再自造一套口径。
     */
    public List<Map<String, Object>> groupShelves(String userId) {
        if (isBlank(userId)) return List.of();
        Set<String> shelveIds = studentCageShelfService.resolveOwnGroupShelveIdsByUserId(userId);
        if (shelveIds.isEmpty()) return List.of();
        Map<String, Map<String, Object>> byShelfIndex = new LinkedHashMap<>();
        for (CageShelfIndex idx : cageShelfMapper.listIndexesByShelveIds(new ArrayList<>(shelveIds))) {
            if (idx == null || idx.getId() == null) continue;
            String key = String.valueOf(idx.getId());
            if (byShelfIndex.containsKey(key)) continue;
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("shelfIndexId", key);
            s.put("shelveId", idx.getShelveId() == null ? null : String.valueOf(idx.getShelveId()));
            s.put("shelveName", idx.getShelveName());
            s.put("campusName", idx.getCampusName());
            s.put("areaName", idx.getAreaName());
            s.put("floorName", idx.getFloorName());
            s.put("roomName", idx.getRoomName());
            s.put("roomId", idx.getRoomId() == null ? null : String.valueOf(idx.getRoomId()));
            byShelfIndex.put(key, s);
        }
        return new ArrayList<>(byShelfIndex.values());
    }

    // ==================== 预定 ====================

    /**
     * 锁定笼位并把订购信息写进笼位表单。加购事务内调用，整体成功或整体回滚。
     *
     * @param specOptionLabel 规格选项原文（「模板名: 选项」，如「性别: 雌性」）
     */
    @Transactional(rollbackFor = Exception.class)
    public CageOrderReservation reserve(Long aupRecordId, Long animalCageId, Long refDataId,
                                        String specOptionLabel, Integer quantity, String userId) {
        if (aupRecordId == null) throw new TwinBusinessException(400, "请先选择 AUP");
        if (animalCageId == null) throw new TwinBusinessException(400, "请选择笼位");
        int qty = (quantity == null || quantity < 1) ? 1 : quantity;
        int cap = maxQuantityPerCage();
        if (qty > cap) {
            throw new TwinBusinessException(400, "单个笼位最多放 " + cap + " 只，请换笼位或减少数量");
        }

        AupRecord aup = aupRecordMapper.selectById(aupRecordId);
        if (aup == null) throw new TwinBusinessException(400, "所选 AUP 不存在");

        CageCellDetail cage = detailMapper.selectByAnimalCageId(animalCageId);
        if (cage == null) throw new TwinBusinessException(400, "笼位不存在");
        if (!Integer.valueOf(2).equals(cage.getCageTypeCode())) {
            throw new TwinBusinessException(400, "只能预定「已预约空笼盒」状态的笼位");
        }
        if (!sameAup(cage, aup)) {
            throw new TwinBusinessException(400, "该笼位的 AUP 与本单不一致，请换笼位");
        }
        if (divisionService.isBlocked(animalCageId, userId)) {
            throw new TwinBusinessException(403, "该笼位已划分给本课题组其他人，无法预定");
        }
        // 与候选池同一口径，API 直调也拦：只能选没有特殊状态、也不在分笼/转移待审中的空笼位
        String statusReason = specialStatusReason(
                infoValueService.statusFlagsByCage(List.of(animalCageId)).get(animalCageId));
        if (statusReason != null) {
            throw new TwinBusinessException(400, statusReason);
        }
        if (pendingOpCageIds().contains(animalCageId)) {
            throw new TwinBusinessException(400, "该笼位有分笼/转移在审，暂时不能预定");
        }
        if (!claimMapper.selectCageIdsWithActiveClaim(List.of(animalCageId)).isEmpty()) {
            throw new TwinBusinessException(400, "该笼位有认领申请在处理中，暂时不能预定");
        }

        String strain = chainNodeName(refDataId, "ANIMAL_STRAIN");
        String supplier = chainNodeName(refDataId, "SUPPLIER");
        SpecParts spec = SpecParts.parse(specOptionLabel);
        String sex = spec.sex();

        // 一笼一规格：笼位已放进别的东西就换笼位，别混笼
        String existingSex = firstValue(animalCageId, "animal_sex");
        if (notBlank(existingSex) && notBlank(sex) && !existingSex.trim().equals(sex.trim())) {
            throw new TwinBusinessException(400,
                    "该笼位已放入「" + existingSex.trim() + "」，单个笼位仅限同一种规格，请换笼位");
        }
        String existingStrain = firstValue(animalCageId, "animal_strain_name");
        if (notBlank(existingStrain) && notBlank(strain) && !existingStrain.trim().equals(strain.trim())) {
            throw new TwinBusinessException(400,
                    "该笼位已放入品系「" + existingStrain.trim() + "」，请换笼位");
        }

        String reserverName = userDisplayNameService.resolveDisplayName(userId);
        Map<String, Object> written = new LinkedHashMap<>();
        if (notBlank(strain)) written.put("animal_strain_name", strain);
        if (notBlank(supplier)) written.put("animal_come_from", supplier);
        if (notBlank(sex)) written.put("animal_sex", sex);
        if (qty > 0) {
            if (spec.isFemale()) written.put("animal_female_number", qty);
            else if (spec.isMale()) written.put("animal_male_number", qty);
            // 性别识别不出来就不猜男/女，数量账交给饲养端到货时点
        }
        written.put("experimenter_name", reserverName);
        // 规格模板 → 字段映射：命中哪个模板就把该规格选中的值写进对应笼位字段
        for (Map.Entry<String, String> e : specFieldMapping().entrySet()) {
            if (e.getKey().equals(spec.templateName()) && notBlank(e.getValue()) && notBlank(spec.label())) {
                written.put(e.getValue(), spec.label());
            }
        }

        CageOrderReservation row = new CageOrderReservation();
        row.setAnimalCageId(animalCageId);
        row.setActiveCageId(animalCageId);   // 竞态闸门：唯一索引挡并发
        row.setAupRecordId(aupRecordId);
        row.setSpecKey(specOptionLabel);
        row.setStrainName(strain);
        row.setSex(sex);
        row.setQuantity(qty);
        row.setReserverId(userId);
        row.setReserverName(reserverName);
        row.setGroupName(aup.getProjectGroupName());
        row.setStatus("LOCKED");
        row.setWrittenJson(toJson(written));

        try {
            reservationMapper.insert(row);
        } catch (DuplicateKeyException e) {
            // 同一秒另一个人先锁了这个笼位
            throw new TwinBusinessException(409, "该笼位刚被他人预定，请换一个笼位");
        }

        infoValueService.syncFromMapped(animalCageId, written);
        log.info("[cage-reservation] 笼位 {} 被 {} 预定（AUP {}，{} 只，规格 {}）",
                animalCageId, reserverName, aup.getRegisterNo(), qty, specOptionLabel);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public void bindCart(Long reservationId, Long cartId) {
        if (reservationId == null || cartId == null) return;
        reservationMapper.bindCart(reservationId, cartId);
    }

    /**
     * 加购前校验：预定还在、是本人锁的、规格没被换掉。
     *
     * <p>数量与锁定时不同就按最终数量改预定量并重刷笼位表单——否则笼位里预填的数量
     * 会和订单行对不上（先锁笼位、再改数量是常见操作顺序）。
     * 规格换了则直接拒绝：那个笼位是按另一种规格挑的，得重新选。
     */
    /**
     * 加购前校验：预定还在、是本人锁的、规格没被换掉，并把这一刻才知道的信息补进笼位表单。
     *
     * <p>数量/规格：与锁定时不同就按最终值改写，否则笼位里预填的数量会和订单行对不上
     * （先锁笼位、再改数量是常见操作顺序）。规格换了则直接拒绝：那个笼位是按另一种规格挑的。
     *
     * <p>品系/来源：**只能在这时写**。预定是「先点笼位、后选规格」，reserve() 那一刻还不知道
     * 订的是哪个物品（refDataId 为空），链上取不到品系与来源；走到加购才拿到 refDataId。
     */
    @Transactional(rollbackFor = Exception.class)
    public CageOrderReservation requireActiveForCart(Long reservationId, String userId, Long refDataId,
                                                     String specOptionLabel, Integer quantity) {
        CageOrderReservation r = reservationMapper.findById(reservationId);
        if (r == null || !"LOCKED".equals(r.getStatus())) {
            throw new TwinBusinessException(409, "笼位预定已失效，请重新选择笼位");
        }
        if (!personIdentityService.samePerson(r.getReserverId(), userId)) {
            throw new TwinBusinessException(403, "该笼位不是你预定的，请重新选择");
        }
        String spec = specOptionLabel == null ? "" : specOptionLabel.trim();
        String locked = r.getSpecKey() == null ? "" : r.getSpecKey().trim();
        /**
         * 锁定时规格为空 = **当时还没定**，不是「换了别的规格」。
         *
         * 「先点笼位、后填规格」是支持的正常顺序（见 CagePickerPanel 的注释：数量由笼位数
         * 决定上限，所以先点笼位），那一刻 specOptionLabel 还是空串。若把它当成不匹配，
         * 用户填完规格一加购就被拒——这是实际发生过的线上问题。
         *
         * 只有**两边都非空且不相等**才是真的换过规格，那种必须拦（笼位是按另一种规格挑的）。
         */
        boolean specAdopted = locked.isEmpty() && !spec.isEmpty();
        if (!specAdopted && !locked.equals(spec)) {
            throw new TwinBusinessException(409,
                    "笼位是按「" + (locked.isEmpty() ? "无规格" : locked) + "」选的，与本行规格不一致，请重新选择笼位");
        }

        int qty = (quantity == null || quantity < 1)
                ? (r.getQuantity() == null ? 1 : r.getQuantity())
                : quantity;
        int cap = maxQuantityPerCage();
        if (qty > cap) {
            throw new TwinBusinessException(400, "单个笼位最多放 " + cap + " 只，请换笼位或减少数量");
        }

        // 规格补写 + 数量调整 + 品系/来源 合并成一次写入，只把**真正改动**的字段回写笼位表单
        String strain = chainNodeName(refDataId, "ANIMAL_STRAIN");
        String supplier = chainNodeName(refDataId, "SUPPLIER");
        boolean qtyChanged = !Objects.equals(r.getQuantity(), qty);
        boolean hasRefInfo = notBlank(strain) || notBlank(supplier);
        if (specAdopted || qtyChanged || hasRefInfo) {
            Map<String, Object> written = readWritten(r);
            Map<String, Object> patch = new LinkedHashMap<>();
            if (specAdopted) {
                SpecParts parsed = SpecParts.parse(spec);
                if (notBlank(parsed.sex())) { written.put("animal_sex", parsed.sex()); patch.put("animal_sex", parsed.sex()); }
                for (Map.Entry<String, String> e : specFieldMapping().entrySet()) {
                    if (e.getKey().equals(parsed.templateName()) && notBlank(e.getValue()) && notBlank(parsed.label())) {
                        written.put(e.getValue(), parsed.label());
                        patch.put(e.getValue(), parsed.label());
                    }
                }
                r.setSpecKey(spec);
                r.setSex(parsed.sex());   // 先落性别，下面的数量列才能按新性别写对
            }
            if (qtyChanged) {
                String countField = "雌性".equals(r.getSex()) ? "animal_female_number"
                        : "雄性".equals(r.getSex()) ? "animal_male_number" : null;
                if (countField != null) {
                    written.put(countField, qty);
                    patch.put(countField, qty);
                }
                r.setQuantity(qty);
            }
            if (notBlank(strain)) { written.put("animal_strain_name", strain); patch.put("animal_strain_name", strain); }
            if (notBlank(supplier)) { written.put("animal_come_from", supplier); patch.put("animal_come_from", supplier); }
            r.setWrittenJson(toJson(written));
            reservationMapper.updateSpecQuantityWritten(
                    r.getId(), r.getSpecKey(), r.getSex(), r.getQuantity(), strain, r.getWrittenJson());
            if (!patch.isEmpty()) infoValueService.syncFromMapped(r.getAnimalCageId(), patch);
        }
        return r;
    }

    private Map<String, Object> readWritten(CageOrderReservation r) {
        if (r.getWrittenJson() == null || r.getWrittenJson().isBlank()) return new LinkedHashMap<>();
        try {
            Map<String, Object> m = objectMapper.readValue(r.getWrittenJson(), new TypeReference<Map<String, Object>>() {});
            return m != null ? m : new LinkedHashMap<>();
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    /** 下单：把该批购物车行的预定挂到订单上（不再算孤儿）。 */
    @Transactional(rollbackFor = Exception.class)
    public void bindOrder(List<Long> cartIds, Long orderId) {
        if (cartIds == null || cartIds.isEmpty() || orderId == null) return;
        reservationMapper.bindOrderByCartIds(cartIds, orderId);
    }

    // ==================== 释放 ====================

    /**
     * 订单状态落定后处理笼位预定：
     * <ul>
     *   <li>APPROVED（审核通过）：把订购字段正式写进笼位表单，笼位 2→3 进「已预约(饲养中)」，
     *       预定转 CONSUMED。到这一步笼位才真正被占用。</li>
     *   <li>REJECTED / CANCELLED（驳回/取消）：释放该单下所有预定并撤掉预填字段，
     *       笼位回到可被重新预定的空笼位。</li>
     * </ul>
     * 其他状态（SUBMITTED/PENDING…）不动笼位——预定态本来就是给「还没定下来」用的。
     */
    @Transactional(rollbackFor = Exception.class)
    public int settleForOrderStatus(Long orderId, String status, String operatorId) {
        if (orderId == null || isBlank(status)) return 0;
        List<CageOrderReservation> rows = reservationMapper.listActiveByOrderId(orderId);
        if (rows.isEmpty()) return 0;

        String s = status.trim().toUpperCase();
        if ("APPROVED".equals(s)) {
            for (CageOrderReservation r : rows) {
                // 以预定时的快照为准重写一遍：预定到现在笼位可能被人动过
                Map<String, Object> written = readWritten(r);
                if (!written.isEmpty()) infoValueService.syncFromMapped(r.getAnimalCageId(), written);
                occupyCage(r.getAnimalCageId(), r.getId(), operatorId);
            }
            log.info("[cage-reservation] 订单 {} 通过，{} 个笼位转入饲养中", orderId, rows.size());
            return rows.size();
        }
        if ("REJECTED".equals(s) || "CANCELLED".equals(s)) {
            for (CageOrderReservation r : rows) clearWrittenFields(r);
            reservationMapper.releaseByOrderId(orderId, "REJECTED".equals(s) ? "订单已驳回" : "订单已取消");
            log.info("[cage-reservation] 订单 {} {}，释放 {} 个笼位预定", orderId, s, rows.size());
            return rows.size();
        }
        return 0;
    }

    /** 笼位 2→3：整行取回改一个字段再 upsert，避免把 state/rent_type 等写成 null。 */
    private void occupyCage(Long animalCageId, Long reservationId, String operatorId) {
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null) {
            log.warn("[cage-reservation] 笼位 {} 详情缺失，无法转饲养中", animalCageId);
            return;
        }
        Integer before = d.getCageTypeCode();
        d.setCageTypeCode(3);
        detailMapper.batchUpsert(List.of(d));
        reservationMapper.markConsumed(reservationId);
        // 使用时间 = 笼位 2→3（进饲养中）的这一刻。ARO 那条路走 /back 同步 createTime，
        // 本地订购这条路以前完全没写，审核通过后笼位上的「使用时间」会一直是空的。
        infoValueService.syncFromMapped(animalCageId, Map.of("cage_use_time",
                LocalDateTime.now().format(USE_TIME_FMT)));
        try {
            auditService.logDataChange("UPDATE", "cage_box", animalCageId, String.valueOf(animalCageId), null,
                    "animal_cage", animalCageId, String.valueOf(animalCageId),
                    "cage_type_code", "笼位状态",
                    before == null ? null : String.valueOf(before), "3", operatorId);
        } catch (Exception e) {
            log.warn("[cage-reservation] 笼位状态变更留痕失败 cage={}: {}", animalCageId, e.getMessage());
        }
    }

    /**
     * 主动释放（关抽屉 / 换笼位 / 取消选择）。
     *
     * <p>**已经挂到购物车行的不释放**：那种预定已经「加购完成」，只应由删除购物车行、
     * 清空购物车、或订单被驳回/取消来释放。否则前端一关抽屉就把车里的笼位放掉，
     * 留下「购物车行还写着这个笼位、但笼位已经没人占」的不一致，别人还能把它选走。
     */
    @Transactional(rollbackFor = Exception.class)
    public void release(Long reservationId, String reason) {
        CageOrderReservation r = reservationMapper.findById(reservationId);
        if (r == null || !"LOCKED".equals(r.getStatus())) return;
        if (r.getCartId() != null) {
            log.debug("[cage-reservation] 预定 {} 已挂购物车行 {}，忽略主动释放", reservationId, r.getCartId());
            return;
        }
        clearWrittenFields(r);
        reservationMapper.releaseById(r.getId(), reason);
    }

    /** 该购物车行是否挂了活跃的笼位预定 —— 挂了才受「单笼上限」约束（房间领用路径没笼位，不适用）。 */
    public boolean hasActiveReservation(Long cartId) {
        if (cartId == null) return false;
        return !reservationMapper.listActiveByCartIds(List.of(cartId)).isEmpty();
    }

    /**
     * 本单当前实际持有的笼位预定，按笼位聚合，供「编辑保存 / 提交订单」校验用。
     *
     * <p>两个来源都算：下单时挂到订单上的（order_id），以及本次在购物车里新挑、还挂在
     * 购物车行上的（cart_id）。少算后者就会把刚挑好的笼位判成「预定失效」。
     */
    public Map<Long, CageOrderReservation> heldReservations(Long orderId, Collection<Long> cartIds) {
        Map<Long, CageOrderReservation> out = new LinkedHashMap<>();
        if (cartIds != null && !cartIds.isEmpty()) {
            for (CageOrderReservation r : reservationMapper.listActiveByCartIds(new ArrayList<>(cartIds))) {
                out.putIfAbsent(r.getAnimalCageId(), r);
            }
        }
        if (orderId != null) {
            for (CageOrderReservation r : reservationMapper.listActiveByOrderId(orderId)) {
                out.putIfAbsent(r.getAnimalCageId(), r);
            }
        }
        return out;
    }

    /**
     * 编辑保存对账：把「仍被本单持有、但新明细里已经不再引用」的预定释放掉。
     *
     * <p>必须释放，否则旧笼位会一直挂着 LOCKED，等订单审核通过时被 {@link #settleForOrderStatus}
     * 一并转成「饲养中」——那张单换了笼位，结果两个笼位都被占了。
     */
    @Transactional(rollbackFor = Exception.class)
    public int releaseHeldNotUsed(Collection<CageOrderReservation> held, Collection<Long> keepCageIds, String reason) {
        if (held == null || held.isEmpty()) return 0;
        int n = 0;
        for (CageOrderReservation r : held) {
            if (keepCageIds != null && keepCageIds.contains(r.getAnimalCageId())) continue;
            clearWrittenFields(r);
            n += reservationMapper.releaseById(r.getId(), reason);
        }
        return n;
    }

    /** 购物车行被删/被清空时释放对应预定，并把预填进笼位表单的值撤掉。 */
    @Transactional(rollbackFor = Exception.class)
    public void releaseByCartIds(Collection<Long> cartIds, String reason) {
        if (cartIds == null || cartIds.isEmpty()) return;
        List<Long> ids = new ArrayList<>(cartIds);
        for (CageOrderReservation r : reservationMapper.listActiveByCartIds(ids)) {
            clearWrittenFields(r);
        }
        reservationMapper.releaseByCartIds(ids, reason);
    }

    /** 启动清孤儿：购物车行没了、也没挂订单的 LOCKED 行（进程崩溃等残留），否则笼位会被永久占住。 */
    @Transactional(rollbackFor = Exception.class)
    public int releaseOrphans() {
        return reservationMapper.releaseOrphans("购物车行已不存在，自动释放");
    }

    /** 只撤销预定自己写进去的字段，不碰笼位上其它既有值。 */
    private void clearWrittenFields(CageOrderReservation r) {
        if (r.getWrittenJson() == null || r.getWrittenJson().isBlank()) return;
        try {
            Map<String, Object> written = objectMapper.readValue(
                    r.getWrittenJson(), new TypeReference<Map<String, Object>>() {});
            if (written.isEmpty()) return;
            infoValueService.clearByCanonicals(r.getAnimalCageId(), written.keySet(), "UPDATE", "ORDER_RELEASE");
        } catch (Exception e) {
            log.warn("[cage-reservation] 撤销预填失败 cage={}: {}", r.getAnimalCageId(), e.getMessage());
        }
    }

    // ==================== 渲染用 ====================

    /**
     * 笼位坐标快照：animalCageId → {校区/区域/楼层/房间/笼架/坐标}。
     * 下单时随订单行落库，之后笼位被搬动也不改历史单。
     * 一次批量反查（lookupByAnimalCageIds），不逐笼查。
     */
    public Map<Long, Map<String, Object>> cageLocationSnapshots(Collection<Long> animalCageIds) {
        Map<Long, Map<String, Object>> out = new LinkedHashMap<>();
        List<Long> ids = distinctIds(animalCageIds);
        if (ids.isEmpty()) return out;
        for (Map<String, Object> row : cellIndexMapper.lookupByAnimalCageIds(ids)) {
            Long cid = toLong(row.get("animalCageId"));
            if (cid == null) continue;
            Map<String, Object> loc = new LinkedHashMap<>();
            loc.put("animalCageId", String.valueOf(cid));
            loc.put("campusName", row.get("campusName"));
            loc.put("areaName", row.get("areaName"));
            loc.put("floorName", row.get("floorName"));
            loc.put("roomName", row.get("roomName"));
            loc.put("roomId", str(row.get("roomId")));
            loc.put("shelveId", str(row.get("shelveId")));
            loc.put("shelveName", row.get("shelveName"));
            loc.put("shelfIndexId", str(row.get("shelfIndexId")));
            loc.put("positionX", row.get("positionX"));
            loc.put("positionY", row.get("positionY"));
            out.put(cid, loc);
        }
        return out;
    }

    /** cageId → 预定人姓名（活跃预定）。网格上标「已被订单预定」。 */
    public Map<Long, String> activeReservations(Collection<Long> cageIds) {
        Map<Long, String> out = new LinkedHashMap<>();
        List<Long> ids = distinctIds(cageIds);
        if (ids.isEmpty()) return out;
        for (CageOrderReservation r : reservationMapper.listActiveByCageIds(ids)) {
            out.put(r.getAnimalCageId(), isBlank(r.getReserverName()) ? "他人" : r.getReserverName());
        }
        return out;
    }

    /** 全部活跃预定（笼架网格标记用）；笼位 ID 以字符串下发，避免前端 JSON Number 丢精度。 */
    public List<Map<String, Object>> listActiveViews() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOrderReservation r : reservationMapper.listAllActive()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("reservationId", String.valueOf(r.getId()));
            m.put("animalCageId", String.valueOf(r.getAnimalCageId()));
            m.put("reserverName", isBlank(r.getReserverName()) ? "他人" : r.getReserverName());
            m.put("quantity", r.getQuantity());
            m.put("sex", r.getSex());
            m.put("strainName", r.getStrainName());
            m.put("orderId", r.getOrderId() == null ? null : String.valueOf(r.getOrderId()));
            // cartId 非空 = 这次预定已经挂到购物车行了，属于「加购完成」；
            // 前端据此判断要不要接回「选择中」态 —— 已完成的不能回到选择态，否则加购完又冒出来。
            m.put("cartId", r.getCartId() == null ? null : String.valueOf(r.getCartId()));
            out.add(m);
        }
        return out;
    }

    // ==================== 内部 ====================

    /** 特殊状态 canonical → 中文名（与 CageInfoValueService 的状态标记字段同一套）。 */
    private static final Map<String, String> SPECIAL_STATUS_LABELS = Map.of(
            "needs_division", "需分笼",
            "needs_special_feeding", "需特殊饲养",
            "needs_transfer", "动物转移",
            "has_health_abnormality", "健康异常",
            "needs_cohabitation", "需合笼");

    /**
     * 「只能选空笼位」：带任一特殊状态/待处理标记的笼位不给预定 —— 那种笼位本身还有事没做完，
     * 再往里塞新动物只会更乱。以表单(cage_info_value)为真相源，与网格上的状态 chips 同源。
     */
    private String specialStatusReason(Map<String, Boolean> flags) {
        if (flags == null || flags.isEmpty()) return null;
        List<String> hit = new ArrayList<>();
        for (Map.Entry<String, String> e : SPECIAL_STATUS_LABELS.entrySet()) {
            if (Boolean.TRUE.equals(flags.get(e.getKey()))) hit.add(e.getValue());
        }
        return hit.isEmpty() ? null : "该笼位有「" + String.join("/", hit) + "」标记，不能预定";
    }

    /** 分笼/转移在审（中间态）的笼位：源与目标都锁着，不能拿去预定。 */
    private Set<Long> pendingOpCageIds() {
        Set<Long> out = new LinkedHashSet<>();
        try {
            for (CageOpRequest req : opRequestMapper.selectByStatus("pending", null)) {
                if (req.getSourceAnimalCageId() != null) out.add(req.getSourceAnimalCageId());
                String json = req.getTargetAnimalCageIds();
                if (json != null && !json.isBlank()) {
                    for (Object v : objectMapper.readValue(json, List.class)) {
                        Long id = toLong(v);
                        if (id != null) out.add(id);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[cage-reservation] 读取分笼/转移待审失败（按无待审处理）: {}", e.getMessage());
        }
        return out;
    }

    private boolean sameAup(CageCellDetail cage, AupRecord aup) {        if (cage.getAupId() != null && Objects.equals(cage.getAupId(), aup.getId())) return true;
        return notBlank(cage.getAupNumber()) && notBlank(aup.getRegisterNo())
                && cage.getAupNumber().trim().equals(aup.getRegisterNo().trim());
    }

    private String firstValue(Long animalCageId, String canonical) {
        Map<Long, String> m = infoValueService.textValueByCage(List.of(animalCageId), canonical);
        return m == null ? null : m.get(animalCageId);
    }

    /** 订购链上最近的某类型节点名（品系取 ANIMAL_STRAIN、来源取 SUPPLIER）。 */
    private String chainNodeName(Long refDataId, String refType) {
        if (refDataId == null) return null;
        try {
            for (RefData node : referenceDataMapper.findAncestors(refDataId)) {
                if (node != null && refType.equalsIgnoreCase(node.getRefType())) {
                    return displayName(node);
                }
            }
        } catch (Exception e) {
            log.warn("[cage-reservation] 解析订购链失败 refDataId={}: {}", refDataId, e.getMessage());
        }
        return null;
    }

    private String displayName(RefData node) {
        if (node == null || isBlank(node.getFieldData())) return node == null ? null : "ID:" + node.getId();
        try {
            Map<String, Object> fd = objectMapper.readValue(node.getFieldData(), new TypeReference<Map<String, Object>>() {});
            for (String key : new String[]{"title", "subtitle", "chineseName", "genotypeName", "supplierName", "englishName", "shortName"}) {
                Object v = fd.get(key);
                if (v != null && notBlank(String.valueOf(v))) return String.valueOf(v).trim();
            }
        } catch (Exception e) {
            // 落到 ID 兜底
        }
        return "ID:" + node.getId();
    }

    /**
     * 规格选项原文拆解。「性别: 雌性」→ 模板名=性别、选项=雌性，并从选项猜性别。
     * 猜性别只认明确的词，认不出就返回 null（宁可不填，也不猜错男/女）。
     */
    private record SpecParts(String templateName, String label, boolean isFemale, boolean isMale) {
        static SpecParts parse(String raw) {
            if (isBlank(raw)) return new SpecParts(null, null, false, false);
            String s = raw.trim();
            int idx = s.indexOf(": ");
            String tpl = idx > 0 ? s.substring(0, idx).trim() : null;
            String label = idx > 0 ? s.substring(idx + 2).trim() : s;
            String lower = label.toLowerCase();
            boolean female = label.contains("雌") || lower.contains("female");
            boolean male = !female && (label.contains("雄") || lower.contains("male"));
            return new SpecParts(tpl, label, female, male);
        }

        String sex() {
            if (isFemale) return "雌性";
            if (isMale) return "雄性";
            return null;
        }
    }

    private String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            log.warn("[cage-reservation] 序列化预填字段失败: {}", e.getMessage());
            return null;
        }
    }

    private static List<Long> distinctIds(Collection<Long> ids) {
        if (ids == null) return List.of();
        Set<Long> set = new LinkedHashSet<>();
        for (Long id : ids) if (id != null) set.add(id);
        return new ArrayList<>(set);
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(o).trim()); } catch (Exception e) { return null; }
    }

    private static String trim(String s) { return s == null ? null : s.trim(); }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }

    private static boolean notBlank(String s) { return !isBlank(s); }
}

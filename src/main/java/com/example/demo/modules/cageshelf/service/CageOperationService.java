package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.cageshelf.entity.ApprovalRecord;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelist;
import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.entity.CageTransferLog;
import com.example.demo.modules.cageshelf.mapper.ApprovalRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistItemMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoCodelistMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageOpRequestMapper;
import com.example.demo.modules.cageshelf.mapper.CageTransferLogMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.referencedata.entity.RefData;
import com.example.demo.modules.referencedata.mapper.ReferenceDataMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 笼位操作（分笼 / 转移笼位）— 三端通用入口。
 *
 * 准入判定复用「申请笼位」同一条链：目标必须是空笼盒(type2) 且无活跃认领，
 * 且与源笼位同课题组（AUP 反查），再过配额校验。差别只在：
 *  - 判定基准是「源笼位所属课题组」而不是「操作人所属课题组」（教职工不一定属于课题组）；
 *  - 学生视角是否需要进待审队列，由「目标所属人」（接收方 = 源笼位占用者）自己的
 *    cage_owner_approval_config 里的分笼/转移开关决定；教职工一律直接执行。
 *
 * 执行结果落 cage_transfer_log（占用事件留痕）+ approval_records（审批结果）。
 */
@Service
public class CageOperationService {

    private static final Logger log = LoggerFactory.getLogger(CageOperationService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final CageOpRequestMapper opMapper;
    private final CageCellDetailMapper detailMapper;
    private final CageClaimMapper claimMapper;
    private final CageInfoValueService infoValueService;
    private final CageTransferLogMapper transferLogMapper;
    private final ApprovalRecordMapper approvalMapper;
    private final CageQuotaService quotaService;
    private final CageCellIndexMapper cellIndexMapper;
    private final PersonnelService personnelService;
    private final UserDisplayNameService userDisplayNameService;
    private final CageOwnerApprovalConfigService ownerApprovalConfigService;
    private final CageRegionGrantService regionGrantService;
    private final CageModeVisibilityService modeVisibilityService;
    private final CageDivisionService divisionService;
    private final CageOccupancyService occupancyService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final AupRecordMapper aupRecordMapper;
    private final CageInfoFieldMapper cageInfoFieldMapper;
    private final CageInfoCodelistMapper cageInfoCodelistMapper;
    private final CageInfoCodelistItemMapper cageInfoCodelistItemMapper;
    private final UserMapper userMapper;
    private final ReferenceDataMapper referenceDataMapper;
    private final UserGroupNameResolver userGroupNameResolver;
    private final CageIntermediateStateService intermediateStateService;
    private final CageVisibilityPolicy visibilityPolicy;
    private final CageReviewVetService reviewVetService;
    private final TransferFormService transferFormService;
    private final PushService pushService;

    public CageOperationService(CageOpRequestMapper opMapper,
                                CageCellDetailMapper detailMapper,
                                CageClaimMapper claimMapper,
                                CageInfoValueService infoValueService,
                                CageTransferLogMapper transferLogMapper,
                                ApprovalRecordMapper approvalMapper,
                                CageQuotaService quotaService,
                                CageCellIndexMapper cellIndexMapper,
                                PersonnelService personnelService,
                                UserDisplayNameService userDisplayNameService,
                                CageOwnerApprovalConfigService ownerApprovalConfigService,
                                CageRegionGrantService regionGrantService,
                                CageModeVisibilityService modeVisibilityService,
                                CageDivisionService divisionService,
                                CageOccupancyService occupancyService,
                                AroPersonnelMapper aroPersonnelMapper,
                                AupRecordMapper aupRecordMapper,
                                CageInfoFieldMapper cageInfoFieldMapper,
                                CageInfoCodelistMapper cageInfoCodelistMapper,
                                CageInfoCodelistItemMapper cageInfoCodelistItemMapper,
                                UserMapper userMapper,
                                ReferenceDataMapper referenceDataMapper,
                                UserGroupNameResolver userGroupNameResolver,
                                CageIntermediateStateService intermediateStateService,
                                CageVisibilityPolicy visibilityPolicy,
                                CageReviewVetService reviewVetService,
                                TransferFormService transferFormService,
                                PushService pushService) {
        this.opMapper = opMapper;
        this.detailMapper = detailMapper;
        this.claimMapper = claimMapper;
        this.infoValueService = infoValueService;
        this.transferLogMapper = transferLogMapper;
        this.approvalMapper = approvalMapper;
        this.quotaService = quotaService;
        this.cellIndexMapper = cellIndexMapper;
        this.personnelService = personnelService;
        this.userDisplayNameService = userDisplayNameService;
        this.ownerApprovalConfigService = ownerApprovalConfigService;
        this.regionGrantService = regionGrantService;
        this.modeVisibilityService = modeVisibilityService;
        this.divisionService = divisionService;
        this.occupancyService = occupancyService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.aupRecordMapper = aupRecordMapper;
        this.cageInfoFieldMapper = cageInfoFieldMapper;
        this.cageInfoCodelistMapper = cageInfoCodelistMapper;
        this.cageInfoCodelistItemMapper = cageInfoCodelistItemMapper;
        this.userMapper = userMapper;
        this.referenceDataMapper = referenceDataMapper;
        this.userGroupNameResolver = userGroupNameResolver;
        this.intermediateStateService = intermediateStateService;
        this.visibilityPolicy = visibilityPolicy;
        this.reviewVetService = reviewVetService;
        this.transferFormService = transferFormService;
        this.pushService = pushService;
    }

    // ═══════════════════════════════════════════
    // 中间态保护（审核中 = 笼位被占住，任何选位流程都不能再选中）
    // ═══════════════════════════════════════════

    /**
     * 未决（待审）分笼/转移涉及的笼位 = 源笼位 + 全部目标笼位。
     *
     * **为什么必须存在**：待审请求只是「意向」，笼位此刻的状态还没变（源仍饲养中、目标仍是空笼盒），
     * 所以只看 cage_type_code / 活跃认领是拦不住的 —— 另一个人可以选到同一个笼位提交第二个请求。
     * 等两边都通过审批，先执行的一方改掉笼位状态，后执行的一方直接执行失败（请求卡在待审）。
     * 认领那几类中间态（pending_approval/locked/confirmed/pending_release_approval）靠 cage_claims 挡住，
     * 这条链独立于认领，所以要在选位池和提交/审批两处都补上。
     *
     * @param excludeRequestId 正在处理的那条请求自身（审批执行时不该把自己算成冲突）
     */
    public static Set<Long> pendingOccupiedCages(List<CageOpRequest> pending, Long excludeRequestId) {
        Set<Long> out = new HashSet<>();
        for (CageOpRequest r : pending) {
            if (r == null) continue;
            if (excludeRequestId != null && excludeRequestId.equals(r.getId())) continue;
            if (r.getSourceAnimalCageId() != null) out.add(r.getSourceAnimalCageId());
            out.addAll(parseTargetIds(r));
            // 多源批量单：老列只写了 pairs[0].source，其余源笼位也得占住，否则还能被别人再选成源/目标
            out.addAll(r.pairCageIds());
        }
        return out;
    }

    /** 目标笼位 JSON → id 列表（宽松解析：坏数据返回空，供选位保护这类旁路判断用）。 */
    static List<Long> parseTargetIds(CageOpRequest req) {
        if (req == null || req.getTargetAnimalCageIds() == null || req.getTargetAnimalCageIds().isBlank()) {
            return List.of();
        }
        try {
            List<Long> out = new ArrayList<>();
            for (Object o : JSON.parseArray(req.getTargetAnimalCageIds(), Object.class)) {
                Long l = toLong(o);
                if (l != null) out.add(l);
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 当前所有未决请求占住的笼位。 */
    private Set<Long> pendingOccupiedCages(Long excludeRequestId) {
        return pendingOccupiedCages(opMapper.selectByStatus(CageOpRequest.STATUS_PENDING, null), excludeRequestId);
    }

    /** 当前所有未决请求占住的笼位 —— 供认领池、分配/预定入口等做同一套选中保护。 */
    public Set<Long> pendingOccupiedCages() {
        return pendingOccupiedCages(null);
    }

    /** 目标里若混进「已被别的待审请求占住」的笼位，直接拒绝（提交与审批执行两处都过这里）。 */
    private void assertTargetsNotPendingOccupied(List<Long> targets, Long excludeRequestId) {
        if (targets.isEmpty()) return;
        Set<Long> busy = pendingOccupiedCages(excludeRequestId);
        for (Long id : targets) {
            if (busy.contains(id)) {
                throw new TwinBusinessException(409, "目标笼位 " + id + " 已有待审的分笼/转移请求，请先等它审完");
            }
        }
    }

    /** 源笼位不能已经挂着别的未决请求，否则两个请求会先后改同一个笼位的占用关系。 */
    private void assertSourceNotPendingOccupied(Long sourceAnimalCageId, Long excludeRequestId) {
        if (pendingOccupiedCages(excludeRequestId).contains(sourceAnimalCageId)) {
            throw new TwinBusinessException(409, "该笼位已有待审的分笼/转移请求，请先等它审完");
        }
    }

    // ═══════════════════════════════════════════
    // 目标候选池
    // ═══════════════════════════════════════════

    /**
     * 目标笼位候选池。**默认全库搜索**——转移/分笼的目标可能在别的房间、别的笼架，
     * 只要目标笼位属于源笼位的课题组即可（课题组维度的收口在 {@link #ineligibleReason}）。
     * shelfIndexId 传值则收窄到该笼架。
     */
    public List<Map<String, Object>> targets(User user, Long sourceAnimalCageId, Long shelfIndexId) {
        CageCellDetail source = requireDetail(sourceAnimalCageId);
        requireOperableSource(user, sourceAnimalCageId, "分笼/转移");
        String sourceAup = source.getAupNumber();
        Set<Long> busy = pendingOccupiedCages(null);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : claimMapper.selectOpTargets(shelfIndexId)) {
            Long targetId = toLong(row.get("animalCageId"));
            // 源笼位本身不出现在目标池里（自己不能是自己的目标）
            if (Objects.equals(targetId, sourceAnimalCageId)) continue;
            Map<String, Object> m = new LinkedHashMap<>(row);
            // 不可选的原因按「最贴近真实原因」排序下发：待审请求 → 已被订购预定 → AUP/划分不符。
            // 原因由服务端给，三端直接照着置灰，各端不再自己判一遍（判漏了就会点了才报错）。
            String reason = busy.contains(targetId)
                    ? "该笼位已有待审的分笼/转移请求"
                    : intermediateStateService.reservationReason(targetId);
            if (reason == null) reason = ineligibleReason(sourceAup, row, user);
            m.put("reason", reason);
            m.put("selectable", reason == null);
            CageCellIndexService.stringifySnowflakeIds(m, "animalCageId", "shelveId", "shelfIndexId");
            out.add(m);
        }
        return out;
    }

    /**
     * 能否对该笼位执行分笼/转移。返回 `{operable, code, reason}`。
     *
     * **两条认领路径不能混**：
     *   - 有活跃认领记录 → 属于原有「申请/预定/确认」流程的领地，只按认领人判权限，**不给新认领入口**
     *   - 无认领记录 + 实验员为空 → 这种饲养中笼位走不了原流程（它不是空笼盒），给新入口「一键认领」
     *   - 无认领记录 + 实验员是别人 → 无权限
     */
    public Map<String, Object> operableInfo(User user, Long animalCageId) {
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null) return notOperable("NOT_FOUND", "笼位不存在");
        if (d.getCageTypeCode() == null || d.getCageTypeCode() != 3) {
            return notOperable("NOT_OCCUPIED", "笼位不是饲养中，无法分笼/转移");
        }
        if (modeVisibilityService.isOpExtraOperator(user)) {
            // 额外操作身份（矩阵 cage.op.manage_identities）只给了「能不能做这类操作」的**资格**，
            // 没给**作用域**。以前这里直接 return operable()，结果是：矩阵里勾了饲养组长/饲养员的人
            // 对全院任意笼位都能分笼/转移/代认领 —— 包括对他脱敏、他根本看不到的别人课题组的笼位。
            // 现在要求笼位落在本人的区域或课题组内，判据与网格脱敏同源（区域命中整架放开、否则按课题组），
            // 保证「看不到就不能操作」。
            if (!cageInScope(user, animalCageId, d)) {
                return notOperable("NO_PERMISSION", "该笼位不在你负责的区域或课题组内");
            }
            Map<String, Object> out = operable();
            // 额外身份（饲养员/饲养组长/超管）还能代绑定：弹窗检索本课题组人员
            out.put("canClaimOnBehalf", true);
            out.put("groupNames", cageGroupNames(d));
            return out;
        }
        // 仅被组长授权「代认领」的人（组员级勾选 cage.op.claim_on_behalf）：
        // 给代认领入口，但**不给**分笼/转移——那是 cage.op.manage_identities 的领地，两件事分开。
        if (modeVisibilityService.canClaimOnBehalf(user)) {
            Map<String, Object> out = notOperable("ONLY_CLAIM_ON_BEHALF",
                    "你可以代认领该笼位；分笼/转移需要额外操作身份");
            out.put("canClaimOnBehalf", true);
            out.put("groupNames", cageGroupNames(d));
            return out;
        }
        // 非额外身份：笼位必须落在本人课题组内，否则连入口都不给（否则会点出「认领」再被 403 兜底）
        if (!cageInUserGroup(user, d)) {
            return notOperable("NO_PERMISSION", "该笼位不在你的课题组范围内");
        }

        CageClaim claim = claimMapper.selectActiveByAnimalCageId(animalCageId);
        if (claim != null) {
            return isClaimantSelf(user, claim)
                    ? operable()
                    : notOperable("NO_PERMISSION", "该笼位已被认领，无分笼/转移权限");
        }
        String exp = experimenterOf(animalCageId);
        if (exp == null) return notOperable("NOT_CLAIMED", "该笼位尚未认领，认领成本人后才能分笼/转移");
        return isExperimenterSelf(user, exp)
                ? operable()
                : notOperable("NO_PERMISSION", "该笼位由「" + exp + "」占用，无分笼/转移权限");
    }

    /**
     * 该笼位是否落在本人的作用域内：**区域分配命中**（可见范围补充）**或**在**本人的课题组**内。
     *
     * <p>与网格脱敏同一套判据（{@code CageCellIndexController.applyGroupMask}）：区域命中 → 整架放开；
     * 否则按课题组过滤。所以「看得到这个笼位」与「能操作这个笼位」口径一致，不会出现
     * 「对他脱敏、他看不到，却还能分笼/转移/代认领」。
     *
     * <p>public 是因为**读侧**也要用同一份判据：笼位详情与详情表单弹窗的脱敏
     * （{@code StudentCageShelfService.maskDetailForUser}）以前只按课题组判，
     * 结果「被分配到饲养组长名下的区域」照样整片 *** —— 饲养组长与手下的饲养员本来就不在
     * 笼位所属课题组里，只按课题组判等于把他们负责的区域也一起遮了。
     */
    public boolean cageInScope(User user, Long animalCageId, CageCellDetail d) {
        // 全局查看者（SUPER_ADMIN+ / 平台管理者）不受作用域限制：他们本来就可见全部，
        // 这次收窄针对的是「矩阵给了操作资格、但笼位不在他负责范围内」的饲养组长/饲养员。
        if (visibilityPolicy.isGlobalViewer(user)) return true;
        Map<String, Object> loc = cellIndexMapper.lookupByAnimalCageId(animalCageId);
        if (loc != null) {
            Map<String, List<String>> scope = regionGrantService.visibilityScopes(user.getId());
            String roomId = str(loc.get("roomId"));
            String floorId = str(loc.get("floorId"));
            String campusId = str(loc.get("campusId"));
            if ((roomId != null && scope.getOrDefault("ROOM", List.of()).contains(roomId))
                    || (floorId != null && scope.getOrDefault("FLOOR", List.of()).contains(floorId))
                    || (campusId != null && scope.getOrDefault("CAMPUS", List.of()).contains(campusId))) {
                return true;
            }
        }
        return cageInUserGroup(user, d);
    }

    private static Map<String, Object> notOperable(String code, String reason) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("operable", false);
        out.put("code", code);
        out.put("reason", reason);
        return out;
    }

    private static Map<String, Object> operable() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("operable", true);
        return out;
    }

    /** 该笼位表单里的实验员（占用者）姓名，无则 null。 */
    private String experimenterOf(Long animalCageId) {
        String v = infoValueService.textValueByCage(List.of(animalCageId), "experimenter_name").get(animalCageId);
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    /**
     * 认领人是否就是本人。
     *
     * <p>认领记录里的 {@code claimantId} 存的是账号 id,可能是教职工侧 {@code STAFF_} 前缀,
     * 也可能是学生侧 ARO 编号 —— 同一个人的两种形态,直接 {@code equals} 会判成两个人。
     * 所以先按裸 id 短路(最快路径),再各解析到 {@code personnel.id} 比一次。
     */
    private boolean isClaimantSelf(User user, CageClaim claim) {
        if (user == null || user.getId() == null || claim == null) return false;
        String claimantId = claim.getClaimantId();
        if (claimantId == null || claimantId.isBlank()) return false;
        if (user.getId().equals(claimantId)) return true;
        String mine = personnelService.resolveIdByAccount(user.getId());
        String theirs = personnelService.resolveIdByAccount(claimantId);
        return mine != null && mine.equals(theirs);
    }

    /**
     * 实验员字段（姓名）是否就是本人。
     *
     * <p>字段里存的是姓名不是账号 id,所以先把姓名解析到 {@code personnel.id} 再和本人比 ——
     * 双 id 同 {@link #isClaimantSelf}。统一人员表还没收录该姓名时退回姓名比对,
     * 保证这条判定不比原来更严。
     */
    private boolean isExperimenterSelf(User user, String experimenterName) {
        if (user == null || user.getId() == null || experimenterName == null || experimenterName.isBlank()) return false;
        String exp = experimenterName.trim();
        String mine = personnelService.resolveIdByAccount(user.getId());
        String theirs = personnelService.resolveIdByName(exp);
        if (mine != null && theirs != null) return mine.equals(theirs);
        return exp.equals(displayNameOf(user));
    }

    /**
     * 动态字段选项（按笼位现算）——任意字段通用。
     * 配置取 cage_info_field.config：`optionsSource=AUP_&lt;REF_TYPE&gt;` 表示候选来自该笼位所属 AUP
     * 白名单里 refType=REF_TYPE 的项；`dict_key` 绑定的笼位域码表项是另一来源。合并规则（计划 §3）：
     *   - restrictToAup=true 且 AUP 白名单项非空 → 候选只取白名单（不并入码表）
     *   - 否则 → 白名单项 ∪ 码表项
     * 选项 value/label 都取展示文本（combo 题型直接把候选当字符串用）。
     * 返回体带上 allowManualInput / allowAddOption / restrictToAup 供前端决定渲染。
     */
    public Map<String, Object> fieldOptions(User user, Long animalCageId, String canonical) {
        CageInfoField field = requireField(canonical);
        FieldCfg cfg = parseFieldConfig(field.getConfig());
        MergedOptions merged = mergeOptions(
                aupItems(aupOfCage(animalCageId), cfg.refType()),
                tableItems(field.getDictKey()),
                () -> globalItems(cfg.refType()),
                cfg);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("options", merged.options());
        out.put("source", merged.source());
        out.put("allowManualInput", cfg.allowManualInput());
        out.put("allowAddOption", cfg.allowAddOption());
        out.put("restrictToAup", cfg.restrictToAup());
        return out;
    }

    /** 合并结果：候选列表 + 来源标识。 */
    record MergedOptions(List<Map<String, Object>> options, String source) {}

    /** 全局兜底是懒加载的：只有前两个来源都空时才真去查参考数据。 */
    interface GlobalSupplier {
        LinkedHashMap<String, String> get();
    }

    /**
     * 候选合并（计划 §3）：
     *   - restrictToAup=true 且 AUP 白名单非空 → 只取白名单
     *   - 否则 → 白名单 ∪ 码表
     *   - 两者都空 → 全局兜底（参考数据里该 refType 的可购项）
     * 抽成静态纯函数是为了可测：不碰 IO，三个来源由调用方备好。
     */
    static MergedOptions mergeOptions(LinkedHashMap<String, String> aupItems,
                                      LinkedHashMap<String, String> tableItems,
                                      GlobalSupplier globalSupplier,
                                      FieldCfg cfg) {
        LinkedHashMap<String, String> dedup = new LinkedHashMap<>();
        String source;
        if (cfg.restrictToAup() && !aupItems.isEmpty()) {
            dedup.putAll(aupItems);
            source = "AUP_ALLOWLIST";
        } else {
            dedup.putAll(aupItems);
            for (Map.Entry<String, String> e : tableItems.entrySet()) dedup.putIfAbsent(e.getKey(), e.getValue());
            if (!aupItems.isEmpty() && !tableItems.isEmpty()) source = "MERGED";
            else if (!tableItems.isEmpty()) source = "CODELIST";
            else if (!aupItems.isEmpty()) source = "AUP_ALLOWLIST";
            else source = "NONE";
        }
        // 全局兜底：白名单与码表都空时退回参考数据，避免候选整体变空
        if (dedup.isEmpty()) {
            dedup.putAll(globalSupplier.get());
            if (!dedup.isEmpty()) source = "GLOBAL";
        }
        List<Map<String, Object>> options = new ArrayList<>();
        for (Map.Entry<String, String> e : dedup.entrySet()) {
            options.add(Map.of("value", e.getKey(), "label", e.getValue()));
        }
        return new MergedOptions(options, source);
    }

    /**
     * 新增预设落到哪：候选确实受 AUP 限制时写该 AUP 的白名单，否则写字段自己的码表（计划 §4）。
     */
    static boolean writesToAup(FieldCfg cfg, boolean aupItemsPresent) {
        return cfg.restrictToAup() && aupItemsPresent;
    }

    /**
     * 新增字段预设（填写时「＋」）。落点见计划 §4：restrictToAup=true 且该笼位 AUP 白名单项非空
     * （即候选确实受 AUP 限制）→ 追加到该 AUP 的 animal_allowlist；其余 → 追加到该字段 dict_key
     * 的笼位域码表项（码表不存在则按需创建）。权限复用 {@link #cageEditInfo} 的可编辑判定。
     * 返回刷新后的选项体，前端直接替换。
     */
    @Transactional
    public Map<String, Object> addFieldOption(User user, Long animalCageId, String canonical, String label) {
        if (label == null || label.isBlank()) throw new TwinBusinessException(400, "预设名称不能为空");
        String name = label.trim();
        if (name.length() > 64) throw new TwinBusinessException(400, "预设名称不能超过 64 个字符");
        Map<String, Object> edit = cageEditInfo(user, animalCageId);
        if (!Boolean.TRUE.equals(edit.get("editable"))) {
            throw new TwinBusinessException(403, String.valueOf(edit.getOrDefault("reason", "无编辑权限")));
        }
        CageInfoField field = requireField(canonical);
        FieldCfg cfg = parseFieldConfig(field.getConfig());
        // 核心防线：新增预设是逐字段的显式授权（allowAddOption 默认 false）。
        // 有些字段的码表由外部系统控制（ARO 同步的、值来自动物订购订单的），
        // 在表单里新增只会被下次同步冲掉甚至污染上游 —— 只靠前端藏按钮不算数，这里必须拦。
        if (!cfg.allowAddOption()) {
            throw new TwinBusinessException(403, "该字段未开放新增预设：" + canonical);
        }
        AupRecord aup = aupOfCage(animalCageId);
        if (writesToAup(cfg, !aupItems(aup, cfg.refType()).isEmpty())) {
            appendAupAllowlist(aup, cfg.refType(), name);
        } else {
            appendCodelistItem(field, name);
        }
        return fieldOptions(user, animalCageId, canonical);
    }

    /** 字段字典必存在，否则 404。 */
    private CageInfoField requireField(String canonical) {
        if (canonical == null || canonical.isBlank()) throw new TwinBusinessException(400, "canonical 必填");
        CageInfoField f = cageInfoFieldMapper.selectByCanonical(canonical.trim());
        if (f == null) throw new TwinBusinessException(404, "字段不存在: " + canonical);
        return f;
    }

    /** 字段配置开关（计划 §2）。optionsSource=AUP_&lt;REF_TYPE&gt; 时 refType=REF_TYPE，否则 null。 */
    record FieldCfg(String refType, boolean restrictToAup, boolean allowManualInput, boolean allowAddOption) {}

    static FieldCfg parseFieldConfig(String configJson) {
        String optionsSource = null;
        boolean restrictToAup = true, allowManualInput = false, allowAddOption = false;
        if (configJson != null && !configJson.isBlank()) {
            try {
                JSONObject c = JSON.parseObject(configJson);
                optionsSource = c.getString("optionsSource");
                Boolean r = c.getBoolean("restrictToAup");
                if (r != null) restrictToAup = r;
                Boolean m = c.getBoolean("allowManualInput");
                if (m != null) allowManualInput = m;
                Boolean a = c.getBoolean("allowAddOption");
                if (a != null) allowAddOption = a;
            } catch (Exception e) {
                log.warn("[cage-op] 解析字段 config 失败: {}", e.getMessage());
            }
        }
        String refType = (optionsSource != null && optionsSource.startsWith("AUP_")) ? optionsSource.substring(4) : null;
        return new FieldCfg(refType, restrictToAup, allowManualInput, allowAddOption);
    }

    /** 该笼位的 AUP（无 AUP 号或查不到则 null）。 */
    private AupRecord aupOfCage(Long animalCageId) {
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null || d.getAupNumber() == null || d.getAupNumber().isBlank()) return null;
        return aupRecordMapper.selectByRegisterNo(d.getAupNumber());
    }

    /** AUP 白名单里 refType 匹配的项（展示文本 → 展示文本，去重保序）。 */
    private LinkedHashMap<String, String> aupItems(AupRecord aup, String refType) {
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        if (refType == null || aup == null || aup.getAnimalAllowlist() == null || aup.getAnimalAllowlist().isBlank()) {
            return out;
        }
        try {
            for (Object o : JSON.parseArray(aup.getAnimalAllowlist())) {
                if (!(o instanceof JSONObject j)) continue;
                if (!refType.equals(j.getString("refType"))) continue;
                String label = j.getString("label");
                if (label != null && !label.isBlank()) out.put(label.trim(), label.trim());
            }
        } catch (Exception e) {
            log.warn("[cage-op] 解析 AUP 白名单失败 aup={}: {}", aup.getRegisterNo(), e.getMessage());
        }
        return out;
    }

    /** 字段 dict_key 绑定码表的项（展示文本 → 展示文本）。 */
    private LinkedHashMap<String, String> tableItems(String dictKey) {
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        if (dictKey == null || dictKey.isBlank()) return out;
        CageInfoCodelist cl = cageInfoCodelistMapper.selectByCode(dictKey.trim());
        if (cl == null) return out;
        for (CageInfoCodelistItem it : cageInfoCodelistItemMapper.selectByCodelistId(cl.getId())) {
            String label = it.getItemLabel();
            if (label != null && !label.isBlank()) out.put(label.trim(), label.trim());
        }
        return out;
    }

    /**
     * 参考数据里该 refType 的全部可购项 —— 全局兜底。
     * 白名单与码表都空时用它，保证 AUP 没有品系白名单的笼位仍有一份可选项，
     * 而不是候选直接变空（泛化前 animal_strain_name 就是这个行为，不能丢）。
     */
    private LinkedHashMap<String, String> globalItems(String refType) {
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        if (refType == null || refType.isBlank()) return out;
        try {
            for (RefData r : referenceDataMapper.listOptions(refType)) {
                String title = refTitle(r.getFieldData());
                if (title != null && !title.isBlank()) out.put(title.trim(), title.trim());
            }
        } catch (Exception e) {
            log.warn("[cage-op] 读取参考数据失败 refType={}: {}", refType, e.getMessage());
        }
        return out;
    }

    private static String refTitle(String fieldDataJson) {
        if (fieldDataJson == null || fieldDataJson.isBlank()) return null;
        try {
            return JSON.parseObject(fieldDataJson).getString("title");
        } catch (Exception e) {
            return null;
        }
    }

    /** 追加到 AUP 的 animal_allowlist（JSON 数组，保留既有项与其它 refType；status 不动）。 */
    private void appendAupAllowlist(AupRecord aup, String refType, String label) {
        List<Object> list = new ArrayList<>();
        if (aup.getAnimalAllowlist() != null && !aup.getAnimalAllowlist().isBlank()) {
            try {
                list.addAll(JSON.parseArray(aup.getAnimalAllowlist()));
            } catch (Exception e) {
                log.warn("[cage-op] 解析 AUP 白名单失败 aup={}: {}", aup.getRegisterNo(), e.getMessage());
            }
        }
        JSONObject item = new JSONObject();
        item.put("refType", refType);
        item.put("label", label);
        list.add(item);
        aupRecordMapper.updateRegistryMeta(aup.getId(), JSON.toJSONString(list), null);
        log.info("[cage-op] AUP 白名单新增预设 aup={} refType={} label={}", aup.getRegisterNo(), refType, label);
    }

    /** 追加到字段 dict_key 的笼位域码表项；码表不存在则按需创建。 */
    private void appendCodelistItem(CageInfoField field, String label) {
        String dictKey = field.getDictKey();
        if (dictKey == null || dictKey.isBlank()) {
            throw new TwinBusinessException(400, "该字段未绑定码表，无法新增预设");
        }
        dictKey = dictKey.trim();
        CageInfoCodelist cl = cageInfoCodelistMapper.selectByCode(dictKey);
        if (cl == null) {
            cl = new CageInfoCodelist();
            cl.setCode(dictKey);
            cl.setName(field.getLabel() != null && !field.getLabel().isBlank() ? field.getLabel() : dictKey);
            cl.setFolder(field.getFolder());
            cageInfoCodelistMapper.insert(cl);
        }
        if (cageInfoCodelistItemMapper.countByCodelistIdAndItemCode(cl.getId(), label) > 0) return;
        Integer maxSort = cageInfoCodelistItemMapper.selectMaxSortOrder(cl.getId());
        CageInfoCodelistItem item = new CageInfoCodelistItem();
        item.setCodelistId(cl.getId());
        item.setItemCode(label);
        item.setItemLabel(label);
        item.setSortOrder((maxSort == null ? 0 : maxSort) + 10);
        cageInfoCodelistItemMapper.insert(item);
        log.info("[cage-op] 码表新增预设 codelist={} label={}", dictKey, label);
    }

    /** 该笼位所属课题组名（供代绑定的人员检索弹窗按课题组过滤）：优先 AUP 的课题组，退回笼位 PI/部门。 */
    private List<String> cageGroupNames(CageCellDetail d) {
        if (d.getAupNumber() != null && !d.getAupNumber().isBlank()) {
            AupRecord aup = aupRecordMapper.selectByRegisterNo(d.getAupNumber());
            if (aup != null && aup.getProjectGroupName() != null && !aup.getProjectGroupName().isBlank()) {
                return PersonnelProjectGroupUtil.splitGroups(aup.getProjectGroupName());
            }
        }
        List<String> out = new ArrayList<>();
        out.addAll(PersonnelProjectGroupUtil.splitGroups(d.getProjectPiName()));
        out.addAll(PersonnelProjectGroupUtil.splitGroups(d.getDepartmentName()));
        return out.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
    }

    /**
     * 代绑定（教职工兜底）：额外操作身份给某个人认领该笼位，支持**覆盖已有认领**。
     * 只处理饲养中的笼位；目标人员必须在该笼位的课题组内。
     */
    @Transactional
    public CageClaim claimOnBehalf(User operator, Long animalCageId, String targetAccountId) {
        if (!modeVisibilityService.canClaimOnBehalf(operator)) {
            throw new TwinBusinessException(403, "无代认领权限（饲养员/饲养组长/管理员，或被组长授权的组员）");
        }
        if (targetAccountId == null || targetAccountId.isBlank()) {
            throw new TwinBusinessException(400, "请选择要认领的人员");
        }
        // 目标账号统一折算成 ARO 编号 —— 选人弹窗优先给 STAFF_ id，
        // 学生自己登录用的是 ARO 编号，不折算会出现「同一人两种 claimant_id」，
        // 学生之后在这条笼位上就认不出自己是认领人，分笼/转移入口直接不显示。
        targetAccountId = userGroupNameResolver.canonicalUserId(targetAccountId);
        CageCellDetail d = detailMapper.selectByAnimalCageIdForUpdate(animalCageId);
        if (d == null) throw new TwinBusinessException(404, "笼位不存在: " + animalCageId);
        if (d.getCageTypeCode() == null || d.getCageTypeCode() != 3) {
            throw new TwinBusinessException(400, "该笼位不是饲养中的笼位，无法认领");
        }
        // **操作者本人**的作用域：入口按钮上也判过，但按钮是前端在拦、可以直接打接口，
        // 所以写路径必须自己再判一次。判据与按钮同源（区域分配 / 课题组），
        // 否则脱敏看不到的笼位照样能被代认领。（下面 cageInUserGroup(target) 判的是目标人，两回事。）
        if (!cageInScope(operator, animalCageId, d)) {
            throw new TwinBusinessException(403, "该笼位不在你负责的区域或课题组内，无法代认领");
        }
        User target = userMapper.findById(targetAccountId);
        if (target == null) throw new TwinBusinessException(400, "目标人员不存在");
        if (!cageInUserGroup(target, d)) {
            throw new TwinBusinessException(403, "目标人员不在该笼位的课题组范围内");
        }
        // 该笼位正挂着未决的分笼/转移时，换占用者会把审批执行时的「占用者」换掉，先拦
        assertSourceNotPendingOccupied(animalCageId, null);

        String now = DT_FMT.format(LocalDateTime.now());
        // 覆盖：先把该笼位已有的活跃认领释放掉
        for (CageClaim c : claimMapper.selectByAnimalCageIdForUpdate(animalCageId)) {
            if (c.isActive()) {
                c.setClaimStatus("released");
                c.setReleasedAt(now);
                c.setNote("被代认领覆盖");
                claimMapper.update(c);
            }
        }

        // 代认领就是「把笼位分给某个所属人」：要不要到场确认，按接收人自己的配置决定（无配置 = 需要）。
        // 停在 locked 是安全的 —— 它属于活跃认领状态，笼位不会掉出「已占用」，只是等本人扫码确认。
        boolean confirmReq = ownerApprovalConfigService.confirmRequiredFor(target.getId());
        CageClaim claim = new CageClaim();
        claim.setAnimalCageId(animalCageId);
        claim.setClaimStatus(confirmReq ? "locked" : "confirmed");
        claim.setClaimantId(target.getId());
        claim.setClaimantName(displayNameOf(target));
        claim.setClaimantDept(d.getDepartmentName());
        claim.setAupId(d.getAupId());
        claim.setAssignerId(operator.getId());
        claim.setAssignerName(displayNameOf(operator));
        claim.setConfirmRequired(confirmReq);
        claim.setRetryCount(0);
        if (!confirmReq) claim.setConfirmedAt(now);
        claim.setNote("代认领");
        claimMapper.insert(claim);

        infoValueService.syncFromMapped(animalCageId, Map.of("experimenter_name", claim.getClaimantName()));
        writeTransferLog("start", null, animalCageId,
                new Occupant(claim.getClaimantId(), claim.getClaimantName(), claim.getAupId()), operator, "代认领");
        log.info("[cage-op] claimOnBehalf operator={} target={} animalCageId={}",
                operator.getId(), target.getId(), animalCageId);
        return claim;
    }

    /**
     * 能否编辑该笼位的表单值。与分笼/转移同源判定，但不要求「饲养中」——只要这个笼位归你管：
     * 管理员及以上 / 额外操作身份 / 该笼位活跃认领的认领人 / 实验员字段就是本人。
     * 覆盖「学生认领后（locked）在确认页填表」的场景（此时实验员字段还没写，靠认领记录认人）。
     */
    public Map<String, Object> cageEditInfo(User user, Long animalCageId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (user == null) {
            out.put("editable", false);
            out.put("reason", "未登录");
            return out;
        }
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null) {
            out.put("editable", false);
            out.put("reason", "笼位不存在");
            return out;
        }
        // 编辑权读矩阵能力 cage.edit.form（2026-09-15 起）：
        // 原先写死的「role>=ADMIN 或 isOpExtraOperator」已废——**ADMIN 不再自动拥有全量编辑**，
        // 与用户定的「编辑权 = 饲养组长 / 学生限本人」一致。SUPER_ADMIN+ 由服务内逃生口放行。
        //
        // 作用域（设计 10.1）：光有能力还不够，**笼位必须落在自己负责的范围内**
        //（LEADER 行；饲养员作为组员时经 MEMBER 行继承组长的区域，见 visibilityScopes）。
        // 超管不受区域约束。
        if (modeVisibilityService.canEditCageForm(user)
                && (modeVisibilityService.isSuperAdmin(user) || inMyRegions(user, animalCageId))) {
            out.put("editable", true);
            return out;
        }
        CageClaim claim = claimMapper.selectActiveByAnimalCageId(animalCageId);
        if (claim != null && isClaimantSelf(user, claim)) {
            out.put("editable", true);
            return out;
        }
        String exp = experimenterOf(animalCageId);
        if (exp != null && isExperimenterSelf(user, exp)) {
            out.put("editable", true);
            return out;
        }
        out.put("editable", false);
        // 失败原因必须说清卡在哪一条。原来一律写「由 X 占用」，于是角色等级不够的人
        // 也读到「被占用」，误以为是占用问题 —— 高权限账号尤其容易被这句话带偏。
        // 现在还要再分一层：**有能力但不在区域内** ≠ **压根没这个能力**，提示不能一样。
        RoleEnum role = user.getRole();
        boolean hasCap = modeVisibilityService.canEditCageForm(user);
        String roleNote = hasCap
                ? "；该笼位不在你负责的区域内（区域由超级管理员分配）"
                : "；当前角色「" + (role == null ? "未知" : role.getDescZh())
                        + "」不在「编辑笼位表单」权限名单里";
        out.put("reason", exp == null
                ? "该笼位尚未认领，认领成本人后才能编辑" + roleNote
                : "该笼位由「" + exp + "」占用" + roleNote);
        return out;
    }

    /**
     * 该笼位是否落在「我负责的范围内」——编辑权的作用域约束（设计 10.1）。
     *
     * <p>口径就是 {@code visibilityScopes}：LEADER 行（自己负责）+ SCOPE 遗留
     * + 组员经 MEMBER 行继承的组长区域。所以**饲养员入组后自动获得该区域的编辑权**，
     * 没入组则没有——这是「编辑权 = 饲养组长 / 组员继承」的自然结果，不是漏判。
     */
    private boolean inMyRegions(User user, Long animalCageId) {
        Map<String, List<String>> scope = regionGrantService.visibilityScopes(user.getId());
        if (scope.isEmpty()) return false;
        Map<String, Object> loc = cellIndexMapper.lookupByAnimalCageId(animalCageId);
        if (loc == null) return false;
        String roomId = str(loc.get("roomId"));
        String floorId = str(loc.get("floorId"));
        String campusId = str(loc.get("campusId"));
        if (roomId != null && scope.getOrDefault("ROOM", List.of()).contains(roomId)) return true;
        if (floorId != null && scope.getOrDefault("FLOOR", List.of()).contains(floorId)) return true;
        if (campusId != null && scope.getOrDefault("CAMPUS", List.of()).contains(campusId)) return true;
        return false;
    }

    /** 该笼位的活跃认领人是不是本人（双 id 安全）。「仅占用者本人可写」的入口统一复用这一个判定。 */
    public boolean isActiveClaimantSelf(User user, Long animalCageId) {
        return isClaimantSelf(user, claimMapper.selectActiveByAnimalCageId(animalCageId));
    }

    /**
     * 该笼位**所属人**的账号 id 集合（通知收件人用）。
     *
     * <p>与 {@link #isOccupantSelf} 同两条腿、同解析口径 —— 判成「是你的笼位」的人，通知也该发给他：
     * ① **活跃认领人**：认领记录里的 {@code claimantId} 本来就是账号 id，直接收；
     * ② 没有认领时取**表单实验员**，那里存的是姓名 → 统一人员表 → 账号。
     *
     * <p>同一个人可能同时存在 {@code STAFF_} 与 ARO 两种账号形态（学生的登录入口常是 ARO 那个），
     * 两种都带上：接收人解析会按 personnel 去重（{@code PushRecipientResolver.dedupByPersonnel}），
     * 只带一种反而会漏人。
     */
    public Set<String> occupantAccountIds(Long animalCageId) {
        if (animalCageId == null) return Set.of();
        Set<String> out = new LinkedHashSet<>();
        CageClaim claim = claimMapper.selectActiveByAnimalCageId(animalCageId);
        if (claim != null && claim.getClaimantId() != null && !claim.getClaimantId().isBlank()) {
            out.add(claim.getClaimantId().trim());
        }
        String exp = experimenterOf(animalCageId);
        if (exp != null) {
            String personnelId = personnelService.resolveIdByName(exp);
            if (personnelId != null) {
                out.addAll(personnelService.resolveStaffIds(List.of(personnelId)));
            }
            try {
                List<String> aroIds = aroPersonnelMapper.selectUserIdsByName(exp);
                if (aroIds != null) out.addAll(aroIds);
            } catch (Exception e) {
                log.warn("[cage-op] 实验员账号解析失败 name={} err={}", exp, e.getMessage());
            }
        }
        out.removeIf(id -> id == null || id.isBlank());
        return out;
    }

    /**
     * 该笼位是否归本人使用：活跃认领人是本人 **或** 表单实验员是本人（均双 id 安全）。
     *
     * <p>与 {@link #cageEditInfo} 的两条「本人」腿同源，但**不含**管理员/额外操作身份的旁路 ——
     * 那里回答「能不能编辑」，这里回答「是不是你的笼位」。学生标记状态要的是后者。
     */
    public boolean isOccupantSelf(User user, Long animalCageId) {
        if (user == null || animalCageId == null) return false;
        if (isClaimantSelf(user, claimMapper.selectActiveByAnimalCageId(animalCageId))) return true;
        return isExperimenterSelf(user, experimenterOf(animalCageId));
    }

    /**
     * 给网格每格打「是否归本人使用」标记（{@code mine}），供学生状态模式判断哪些格子能标。
     * 判定与 {@link #isOccupantSelf} 同口径：活跃认领人是本人 **或** 表单实验员是本人，双 id 安全。
     *
     * <p>ponytail: 姓名 / 认领人账号**去重后各解析一次**，不做逐格查询 ——
     * 一架 88 格通常只有个位数个不同的人。哪天一架里人特别多而这里变慢，
     * 再把「姓名→personnel.id」「账号→personnel.id」两张映射换成一次 IN 查询。
     */
    public void markMine(User user, List<Map<String, Object>> grid) {
        // 只对学生有意义：教职工按模式判定能不能编辑，不靠「这格是不是我的」。
        // 在这里收口，调用方就不用各自再判一次身份，也不会为教职工白跑查询。
        if (user == null || user.getId() == null || grid == null || grid.isEmpty()) return;
        if (!modeVisibilityService.isStudent(user)) return;
        String myPid = personnelService.resolveIdByAccount(user.getId());
        if (myPid == null) return;

        List<Long> cageIds = new ArrayList<>();
        for (Map<String, Object> cell : grid) {
            Long id = cellCageId(cell);
            if (id != null) cageIds.add(id);
        }
        // 实验员必须读**表单**：网格上那一列来自固定列，而认领流程只写表单，两者可能不同步。
        Map<Long, String> expByCage = cageIds.isEmpty()
                ? Map.of()
                : infoValueService.textValueByCage(cageIds, "experimenter_name");

        Map<String, Boolean> byName = new java.util.HashMap<>();
        Map<String, Boolean> byAccount = new java.util.HashMap<>();
        for (Map<String, Object> cell : grid) {
            Long id = cellCageId(cell);
            boolean mine = false;
            if (id != null) {
                String exp = expByCage.get(id);
                if (exp != null && !exp.isBlank()) {
                    mine = byName.computeIfAbsent(exp.trim(),
                            n -> myPid.equals(personnelService.resolveIdByName(n)));
                }
            }
            if (!mine) {
                Object claimant = cell.get("activeClaimantId");
                if (claimant != null && !String.valueOf(claimant).isBlank()) {
                    mine = byAccount.computeIfAbsent(String.valueOf(claimant), k -> {
                        String pid = personnelService.resolveIdByAccount(k);
                        return pid != null && pid.equals(myPid);
                    });
                }
            }
            cell.put("mine", mine);
        }
    }

    private static Long cellCageId(Map<String, Object> cell) {
        Object v = cell.get("animalCageId") != null ? cell.get("animalCageId") : cell.get("id");
        return toLong(v);
    }

    /**
     * 一键认领：把本人认领为该笼位的实验员（直接生效，不走审批/到位确认）。
     * 仅限**已经处于饲养中**的笼位——认领是「声明这个正在饲养的笼位是谁的」，不负责改状态。
     * ARO 同步过来的笼位没有实验员字段，学生得先认领才能建立「占用者本人」关系。
     * 限本课题组：笼位 AUP 反查出的课题组（或笼位 PI/部门）须与本人课题组一致。
     */
    @Transactional
    public CageClaim claimAsOwner(User user, Long animalCageId) {
        CageCellDetail d = detailMapper.selectByAnimalCageIdForUpdate(animalCageId);
        if (d == null) throw new TwinBusinessException(404, "笼位不存在: " + animalCageId);
        if (d.getCageTypeCode() == null || d.getCageTypeCode() != 3) {
            throw new TwinBusinessException(400, "该笼位不是饲养中的笼位，无法认领");
        }
        if (!cageInUserGroup(user, d)) {
            throw new TwinBusinessException(403, "该笼位不在你的课题组范围内，无法认领");
        }
        String myName = displayNameOf(user);
        // 两条认领路径不能混：有认领记录 → 归原「申请/预定/确认」流程；实验员已有值 → 不需要认领
        if (claimMapper.selectActiveByAnimalCageId(animalCageId) != null) {
            throw new TwinBusinessException(409, "该笼位已有认领记录，请走原认领流程");
        }
        String exp = experimenterOf(animalCageId);
        if (exp != null) {
            throw new TwinBusinessException(409, "该笼位实验员已填写（" + exp + "），无需认领");
        }
        // 该笼位正被分笼/转移在审时先别认领：那条审完会改写占用者，认领白认。
        String busyOp = intermediateStateService.pendingOpReason(animalCageId);
        if (busyOp != null) {
            throw new TwinBusinessException(409, busyOp + "，不能认领");
        }

        String now = DT_FMT.format(LocalDateTime.now());
        CageClaim claim = new CageClaim();
        claim.setAnimalCageId(animalCageId);
        claim.setClaimStatus("confirmed");
        claim.setClaimantId(user.getId());
        claim.setClaimantName(myName);
        claim.setClaimantDept(d.getDepartmentName());
        claim.setAupId(d.getAupId());
        claim.setAssignerId(user.getId());
        claim.setAssignerName(myName);
        claim.setConfirmRequired(false);
        claim.setRetryCount(0);
        claim.setConfirmedAt(now);
        claim.setNote("本人认领");
        claimMapper.insert(claim);

        // 只写占用关系：实验员字段填本人；笼位状态本来就是饲养中，不动
        infoValueService.syncFromMapped(animalCageId, Map.of("experimenter_name", myName));

        writeTransferLog("start", null, animalCageId, new Occupant(claim.getClaimantId(), claim.getClaimantName(), claim.getAupId()), user, "本人认领");
        log.info("[cage-op] claim owner={} animalCageId={}", user.getId(), animalCageId);
        return claim;
    }

    /** 笼位是否落在用户课题组内：优先按 AUP 反查课题组，取不到再退回笼位 PI/部门匹配。 */
    private boolean cageInUserGroup(User user, CageCellDetail d) {
        List<String> groups = userGroupNames(user.getId());
        if (groups.isEmpty()) return false;
        String aup = d.getAupNumber();
        if (aup != null && !aup.isBlank()) {
            AupRecord rec = aupRecordMapper.selectByRegisterNo(aup);
            if (rec != null && rec.getProjectGroupName() != null && !rec.getProjectGroupName().isBlank()) {
                for (String g : groups) {
                    if (PersonnelProjectGroupUtil.belongsToGroup(rec.getProjectGroupName(), g)) return true;
                }
                return false;
            }
        }
        return PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groups, d.getProjectPiName(), d.getDepartmentName());
    }

    private List<String> userGroupNames(String userId) {
        return userGroupNameResolver.resolve(userId);
    }

    /**
     * 操作人授权 + 源笼位状态校验。
     * 源笼位必须有**已确认的认领**（ARO 同步不带实验员字段，占用关系只能靠本地认领建立——
     * 认领会把本人写进笼位的「实验员」字段，这才成为「实验员本人」），
     * 且操作人属于配置允许的操作身份（占用者本人恒定放行 / 饲养员 / 饲养组长）。
     */
    /** 操作授权 + 源笼位状态校验；与入口按钮同一套判定（operableInfo），避免「按钮能点但提交被拒」。 */
    private void requireOperableSource(User user, Long animalCageId, String opLabel) {
        Map<String, Object> info = operableInfo(user, animalCageId);
        if (Boolean.TRUE.equals(info.get("operable"))) return;
        String code = String.valueOf(info.get("code"));
        int http = "NOT_FOUND".equals(code) ? 404 : ("NO_PERMISSION".equals(code) ? 403 : 400);
        throw new TwinBusinessException(http, String.valueOf(info.get("reason")));
    }

    /** 源笼位的占用者：优先取活跃认领，没有认领时按实验员姓名解析账号（ARO 同步的笼位常常只有实验员、没有认领）。 */
    private Occupant resolveOccupant(Long animalCageId, CageCellDetail d) {
        CageClaim claim = claimMapper.selectActiveByAnimalCageId(animalCageId);
        if (claim != null && claim.getClaimantId() != null && !claim.getClaimantId().isBlank()) {
            return new Occupant(claim.getClaimantId(), claim.getClaimantName(), claim.getAupId());
        }
        String exp = experimenterOf(animalCageId);
        if (exp == null) {
            throw new TwinBusinessException(400, "该笼位没有占用者（实验员为空），无法分笼/转移");
        }
        AroPersonnel p = aroPersonnelMapper.findByName(exp);
        if (p == null || p.getId() == null || p.getId().isBlank()) {
            throw new TwinBusinessException(400, "该笼位实验员「" + exp + "」匹配不到账号，请先让本人认领该笼位");
        }
        return new Occupant(p.getId(), exp, d.getAupId());
    }

    /** 占用者（统一人员账号 + 姓名 + AUP）。 */
    private record Occupant(String accountId, String name, Long aupId) {}

    /**
     * 返回不可选原因，null = 可选。
     * 准入 = **目标笼位与源笼位是同一个 AUP**（同一份实验方案才谈得上分笼/搬动物），
     * 且目标为空笼盒 + 无活跃认领（后者由 SQL 保证）。课题组一致是同 AUP 的推论，不再单独判。
     * 另加上「划分」规则：目标若已划分给本课题组某人，则非被划分人（学生视角）不可选。
     */
    private String ineligibleReason(String sourceAup, Map<String, Object> candidate, User operator) {
        if (sourceAup == null || sourceAup.isBlank()) {
            return "源笼位未关联 AUP，无法分笼/转移";
        }
        String aup = str(candidate.get("aupNumber"));
        if (aup == null || aup.isBlank() || !aup.equals(sourceAup)) {
            return "与源笼位不是同一个 AUP（" + sourceAup + "）";
        }
        String divReason = divisionBlockReason(operator, toLong(candidate.get("animalCageId")));
        if (divReason != null) return divReason;
        return null;
    }

    /**
     * 划分规则的拒绝原因：该笼位已划分给本课题组某人时，非被划分人不可操作。
     * 教职工/管理员视角无视此规则（只拦学生视角）。
     */
    private String divisionBlockReason(User operator, Long animalCageId) {
        if (operator == null || animalCageId == null) return null;
        if (!modeVisibilityService.isStudent(operator)) return null;
        return divisionService.isBlocked(animalCageId, operator.getId())
                ? "该笼位已划分给其他人员" : null;
    }

    /**
     * 配额校验：**只在净增占用时做**。
     * 转移、以及「源笼位归档」的分笼，占用笼位数不变（源出目标进），不该被配额拦；
     * 只有「保留源笼位」的分笼才让该 AUP 的占用数 +N。
     * 同一房间 + 同一 AUP 的多个目标合并成一次校验，避免逐个 +1 算漏。
     */
    private void assertQuotaForTargets(List<Long> targets) {
        Map<String, int[]> need = new LinkedHashMap<>();   // "roomId|aup" → [count]
        Map<String, String[]> key = new LinkedHashMap<>(); // "roomId|aup" → [roomId, aup]
        for (Long id : targets) {
            CageCellDetail d = detailMapper.selectByAnimalCageId(id);
            if (d == null) continue;
            Map<String, Object> loc = cellIndexMapper.lookupByAnimalCageId(id);
            Long roomId = loc == null ? null : toLong(loc.get("roomId"));
            String aup = d.getAupNumber();
            if (roomId == null || aup == null || aup.isBlank()) continue;
            String k = roomId + "|" + aup;
            need.computeIfAbsent(k, x -> new int[1])[0]++;
            key.put(k, new String[]{String.valueOf(roomId), aup});
        }
        for (Map.Entry<String, int[]> e : need.entrySet()) {
            String[] parts = key.get(e.getKey());
            quotaService.assertCanAllocate(Long.valueOf(parts[0]), parts[1], e.getValue()[0]);
        }
    }

    // ═══════════════════════════════════════════
    // 提交
    // ═══════════════════════════════════════════

    @Transactional
    public Map<String, Object> submitDivide(User user, Long sourceAnimalCageId,
                                            List<Long> targetAnimalCageIds, Boolean keepSource, String reason) {
        CageCellDetail source = requireDetail(sourceAnimalCageId);
        requireOperableSource(user, sourceAnimalCageId, "分笼");
        assertSourceNotPendingOccupied(sourceAnimalCageId, null);
        List<Long> targets = normalizeTargets(targetAnimalCageIds);
        if (targets.isEmpty()) throw new TwinBusinessException(400, "请选择分笼目标笼位");
        // 未传 keepSource 时按「保留源笼位」处理（不保留才归档）；保留才会净增占用，才卡配额
        boolean keep = keepSource == null || keepSource;
        assertTargetsEligible(source, targets, keep, null, user);

        CageOpRequest req = new CageOpRequest();
        req.setOpType(CageOpRequest.TYPE_DIVIDE);
        req.setSourceAnimalCageId(sourceAnimalCageId);
        req.setTargetAnimalCageIds(JSON.toJSONString(targets));
        req.setKeepSource(keep);
        req.setReason(reason);
        return submit(user, req, source);
    }

    @Transactional
    public Map<String, Object> submitTransfer(User user, Long fromAnimalCageId,
                                              List<Long> toAnimalCageIds, String reason,
                                              Object transferForm) {
        List<Long> targets = toAnimalCageIds == null ? List.of()
                : toAnimalCageIds.stream().filter(Objects::nonNull).toList();
        if (targets.isEmpty()) {
            throw new TwinBusinessException(400, "请选择转移目标笼位");
        }
        if (fromAnimalCageId == null || targets.contains(fromAnimalCageId)) {
            throw new TwinBusinessException(400, "源笼位与目标笼位不能相同");
        }
        CageCellDetail from = requireDetail(fromAnimalCageId);
        requireOperableSource(user, fromAnimalCageId, "转移");
        assertSourceNotPendingOccupied(fromAnimalCageId, null);
        assertTargetsEligible(from, targets, false, null, user);

        // 学生填的转移单值。可选：小程序与两个单目标快捷入口都不传，转了也是全自动值
        // 单源 + N 个目标 = N 个 pair（源相同）；老列 source/target 由 buildTransferRequest 照写。
        List<CageOpPair> pairs = targets.stream().map(t -> {
            CageOpPair p = new CageOpPair();
            p.setSource(fromAnimalCageId);
            p.setTarget(t);
            return p;
        }).toList();
        CageOpRequest req = buildTransferRequest(pairs, reason, transferFormJson(transferForm));
        return submit(user, req, from);
    }

    /**
     * 显式 pair 列表提交（批量转移 = 一次提交多对 = 一张单、一次三签）。
     * 前端批量弹窗一次发整份 pairs + 一份 transferForm（rows[i] 对齐 pairs[i]），
     * 这里只落**一笔**请求。pairs 顺序原样保留 —— 行号按下标对齐，不能排序/去重。
     */
    @Transactional
    public Map<String, Object> submitTransferPairs(User user, List<CageOpPair> pairs,
                                                   String reason, Object transferForm) {
        List<CageOpPair> list = pairs == null ? List.of()
                : pairs.stream().filter(p -> p != null && p.getSource() != null && p.getTarget() != null).toList();
        if (list.isEmpty()) {
            throw new TwinBusinessException(400, "请选择转移目标笼位");
        }
        if (list.stream().anyMatch(p -> p.getSource().equals(p.getTarget()))) {
            throw new TwinBusinessException(400, "源笼位与目标笼位不能相同");
        }
        Long fromAnimalCageId = list.get(0).getSource();
        // 每个不同的源各验一次可操作+未决；目标按源分组过准入（多源批次各源 AUP 不同，必须对着自己的源判）。
        Map<Long, List<Long>> targetsBySource = new LinkedHashMap<>();
        for (CageOpPair p : list) {
            targetsBySource.computeIfAbsent(p.getSource(), id -> new ArrayList<>()).add(p.getTarget());
        }
        Map<Long, CageCellDetail> sources = new LinkedHashMap<>();
        for (Long sourceId : targetsBySource.keySet()) {
            CageCellDetail from = requireDetail(sourceId);
            requireOperableSource(user, sourceId, "转移");
            assertSourceNotPendingOccupied(sourceId, null);
            sources.put(sourceId, from);
        }
        for (Map.Entry<Long, List<Long>> e : targetsBySource.entrySet()) {
            assertTargetsEligible(sources.get(e.getKey()), e.getValue(), false, null, user);
        }

        CageOpRequest req = buildTransferRequest(list, reason, transferFormJson(transferForm));
        return submit(user, req, sources.get(fromAnimalCageId));
    }

    /**
     * 转移单值统一存 JSON 字符串：body 里给对象或 JSON 字符串都收，非法 JSON 一律当没填（存 null，
     * 各项退回自动值）—— 单列存的是「学生实际填了什么」，留一坨解析不了的东西在库里没有意义。
     */
    private static String transferFormJson(Object v) {
        if (v == null) return null;
        if (v instanceof CharSequence cs) {
            String s = cs.toString().trim();
            return TransferFormService.parseForm(s) == null ? null : s;
        }
        try {
            String s = JSON.toJSONString(v);
            if (s == null || s.isBlank() || "null".equals(s)) return null;
            return TransferFormService.parseForm(s) == null ? null : s;
        } catch (Exception e) {
            log.warn("[cage-op] 转移单值序列化失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 组装 transfer 请求行：老列 source=首个 pair 的源、targets=全部 pair 的目标（保序，不去重不排序），
     * pairs 照存。抽成 static 纯函数便于单测 —— 提交两条路径（单源×多目标 / 显式 pairs）都走这里，
     * 老列写法只有一份。调用方保证 pairs 非空。
     */
    static CageOpRequest buildTransferRequest(List<CageOpPair> pairs, String reason, String transferFormJson) {
        CageOpRequest req = new CageOpRequest();
        req.setOpType(CageOpRequest.TYPE_TRANSFER);
        req.setSourceAnimalCageId(pairs.get(0).getSource());
        req.setTargetAnimalCageIds(JSON.toJSONString(pairs.stream().map(CageOpPair::getTarget).toList()));
        req.setKeepSource(false);
        req.setReason(reason);
        req.setTransferForm(transferFormJson);
        req.setPairs(JSON.toJSONString(pairs));
        return req;
    }

    /**
     * 审核门槛的纯判据，抽成 static 便于单测（构造真实例要 27 个依赖）。
     * 转移单（transfer）无论学生还是教职工提交都需审核（教职工不再豁免）；
     * 分笼（divide）仍只拦学生提交的。{@code ownerRequires} 已叠加全局强制开关。
     */
    static boolean needApproval(boolean student, boolean ownerRequires, String opType) {
        return ownerRequires
                && (student || CageOpRequest.TYPE_TRANSFER.equals(opType));
    }

    /** 落请求行；需审核则留 pending，否则立即执行并置 approved。 */
    private Map<String, Object> submit(User user, CageOpRequest req, CageCellDetail source) {
        boolean student = modeVisibilityService.isStudent(user);
        // 是否需要审核由「目标所属人」（接收方）自己的持久化配置决定：分笼/转移的结果占用者
        // 就是源笼位的占用者，所以接收方即他。没配过 = 需要审核。
        // 门槛：转移单无论学生还是教职工提交都要过三签（再叠加全局强制开关，见 needApproval）；
        // 分笼仍只拦学生提交的，教职工提交直接执行。
        Occupant owner = resolveOccupant(req.getSourceAnimalCageId(), source);
        boolean needApproval = needApproval(student,
                ownerApprovalConfigService.approvalRequiredFor(owner.accountId(), req.getOpType()),
                req.getOpType());
        req.setApplicantId(user.getId());
        req.setApplicantName(displayNameOf(user));
        req.setApplicantScope(student ? "student" : "staff");
        req.setStatus(CageOpRequest.STATUS_PENDING);
        if (CageOpRequest.TYPE_TRANSFER.equals(req.getOpType())) {
            // 写空数组而不是留 NULL：与「改动前就存在的存量单」区分开。
            // 存量单留 NULL → 按旧规则单签生效；新单走三签。
            req.setSignatures(CageOpSignatures.render(List.of()));
        }
        opMapper.insert(req);

        if (!needApproval) {
            execute(req, user);
            req.setStatus(CageOpRequest.STATUS_APPROVED);
            req.setReviewerId(user.getId());
            req.setReviewerName(displayNameOf(user));
            req.setReviewedAt(DT_FMT.format(LocalDateTime.now()));
            // 不审批直接执行的转移同样要归档：设计里「无需审批」≠「没有单据」，
            // 少了这一句这批转移在归档目录里整批消失。必须在 update 之前 —— 文件名跟着这次 update 落库。
            archiveTransferFormQuietly(req);
            opMapper.update(req);
        }

        // 需要审核的转移单，落库后提醒还没签的审核人（归属地/目的地覆盖者 + 全局兽医名单）。
        // 通知失败绝不能让「提交成功」翻车 —— 与物资申领同口径，失败只记日志。
        if (needApproval && CageOpRequest.TYPE_TRANSFER.equals(req.getOpType())) {
            pushTransferReviewReminder(req);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", String.valueOf(req.getId()));
        out.put("status", req.getStatus());
        out.put("executed", !needApproval);
        out.put("needApproval", needApproval);
        return out;
    }

    // ═══════════════════════════════════════════
    // 审核
    // ═══════════════════════════════════════════

    /** 待审列表：全局可见者（SUPER_ADMIN+）全量，否则按可见范围（含组长下放的审核权）过滤。 */
    public List<Map<String, Object>> pending(User reviewer, String opType) {
        // 判定先算一次再逐行比：canReview 每次要查身份/矩阵/成员勾选/可见范围，逐行调会把查询数乘上行数
        CageRegionGrantService.ReviewAuthority auth = regionGrantService.reviewAuthority(reviewer);
        boolean vet = reviewVetService.canSignAsVet(reviewer.getId());
        boolean globalViewer = visibilityPolicy.isGlobalViewer(reviewer);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOpRequest r : opMapper.selectByStatus(CageOpRequest.STATUS_PENDING, opType)) {
            List<Map<String, Object>> locs = locationsOf(r);
            boolean covers = coversAnyLocation(auth, locs);
            if (!covers && !vetCanSeePending(vet, r)) {
                continue;
            }
            Map<String, Object> row = toView(r, locs.isEmpty() ? null : locs.get(0));
            // 当前审核人还能签哪些角色（按归属地→目的地→兽医顺序）。toView 不知道调用者，
            // 所以在这里补上；前端据此按角色分组出按钮，用户点哪个就签哪个，不再靠服务端自动挑。
            row.put("myRoles", signableRoles(globalViewer, covers, vet, r));
            out.add(row);
        }
        return out;
    }

    /**
     * 全局审核兽医该不该看到这条待审单 —— 可见性的第二条腿，与区域审权（{@link #coversAnyLocation}）取并集。
     *
     * <p><b>为什么必须有</b>：兽医名单是**全局**的（一份名单，不分区域），但可见性只按区域收口。
     * 于是名单里的兽医只要不恰好覆盖源/目标房间，就永远看不到待签的转移单，
     * 三签里「兽医」那一关直接变成死关（{@code roleOfReviewer} 的 VET 分支够不着）。
     *
     * <p>只放开 **transfer**：分笼与兽医无关，不能顺手把分笼也漏给他。已经同意过兽医关的也不再出现。
     * 静态纯函数（不碰 IO）—— 判据只有一份，{@code TransferFormService.canView} 调的是同一份。
     */
    static boolean vetCanSeePending(boolean canSignAsVet, CageOpRequest req) {
        return canSignAsVet
                && req != null
                // 判据与三签同源：存量转移单（signatures 为 NULL）走旧单签链，与兽医无关。
                // 少了这一条，全局兽医会被拉进**存量待审单**的可见范围、能下载 PDF（含课题组/AUP/动物数据），
                // 而他在那张单上一个角色都没有、无从操作。
                && usesThreeSignatures(req)
                && !CageOpSignatures.hasApproved(req.signatures(), CageOpSignature.ROLE_VET);
    }

    /**
     * 待审中间态（三端网格与详情画「分笼审核中」「转移审核中」用）。
     *
     * 可见范围：
     *   - 教职工 / 额外操作身份：全部待审（这批正是他们要审的）
     *   - 学生：**本课题组范围内互相可见**，与前端能看到的笼位范围一致；
     *     自己提交的一律可见（即便源笼位已移出课题组，也不该把自己的请求看丢）
     *
     * 判组只看**源笼位**：目标准入本就要求与源同 AUP，同组是推论。
     */
    public List<Map<String, Object>> pendingMarkers(User user) {
        // 全局可见者不受视角收口：isStudent 只看 account_source，不看 role，
        // 双视角绑定被抬到全局可见的账号（account_source=STUDENT）会被误判成学生而丢失可见范围。
        boolean isAdmin = visibilityPolicy.isGlobalViewer(user);
        boolean student = !isAdmin && modeVisibilityService.isStudent(user);
        List<CageOpRequest> rows = opMapper.selectByStatus(CageOpRequest.STATUS_PENDING, null);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOpRequest r : rows) {
            if (student) {
                boolean own = user.getId() != null && user.getId().equals(r.getApplicantId());
                if (!own) {
                    CageCellDetail src = detailMapper.selectByAnimalCageId(r.getSourceAnimalCageId());
                    if (src == null || !cageInUserGroup(user, src)) continue;
                }
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", String.valueOf(r.getId()));
            m.put("opType", r.getOpType());
            m.put("sourceAnimalCageId", String.valueOf(r.getSourceAnimalCageId()));
            m.put("targetAnimalCageIds", parseTargets(r).stream().map(String::valueOf).toList());
            // 多源批量单必须带上 pairs：前端 buildCageOpMarks 是「有 pairs 就逐对打标记」，
            // 不下发的话除第一个源以外的源笼位在网格上不显示「转移审核中」，
            // 看着像空闲的（后端 pendingOccupiedCages 挡得住，但界面误导人）。
            List<Map<String, Object>> pairs = new ArrayList<>();
            for (CageOpPair p : r.pairs()) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("source", String.valueOf(p.getSource()));
                pm.put("target", String.valueOf(p.getTarget()));
                pairs.add(pm);
            }
            m.put("pairs", pairs);
            m.put("applicantId", r.getApplicantId());
            m.put("applicantName", r.getApplicantName());
            m.put("reason", r.getReason());
            m.put("createdAt", r.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    /** 我提交的操作请求。 */
    public List<Map<String, Object>> my(User user, String status) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOpRequest r : opMapper.selectByApplicant(user.getId(), status)) {
            out.add(toView(r, cellIndexMapper.lookupByAnimalCageId(r.getSourceAnimalCageId())));
        }
        return out;
    }

    /** 我审过的分笼/转移 —— 审核页「已审核」历史区（口径与物资审核的「我负责的物品」一致：只列本人经手的）。 */
    public List<Map<String, Object>> reviewed(User reviewer, int limit) {
        int n = limit <= 0 ? 100 : Math.min(limit, 500);
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOpRequest r : opMapper.selectByReviewer(reviewer.getId(), n)) {
            out.add(toView(r, cellIndexMapper.lookupByAnimalCageId(r.getSourceAnimalCageId())));
        }
        return out;
    }

    @Transactional
    public Map<String, Object> review(User reviewer, Long requestId, String decision, String reason) {
        return review(reviewer, requestId, decision, reason, null);
    }

    @Transactional
    public Map<String, Object> review(User reviewer, Long requestId, String decision, String reason, String role) {
        CageOpRequest req = opMapper.selectByIdForUpdate(requestId);
        if (req == null) throw new TwinBusinessException(404, "操作请求不存在");
        if (!CageOpRequest.STATUS_PENDING.equals(req.getStatus())) {
            throw new TwinBusinessException(400, "该请求已处理：" + req.getStatus());
        }
        // 新转移单走三签：一次调用只记一关，三关齐了才执行。
        //
        // **必须在位置门之前分岔**：名单兽医是全局的、不分区域，先过位置门会把「兽医」那一关
        // 判成「非该楼层/房间审核人」直接 403 —— 三签永远凑不齐、单子永久挂起（`vetCanSeePending`
        // 当初就是为了消灭这个死关才放的可见性，只修了可见性那条腿）。
        // 三签路径的鉴权由 reviewBySignature 按**角色**自己做，signableRoles 里已经含了
        // 超管 / 覆盖位置 / 名单兽医三条腿，不需要也不该再过一次位置门。
        if (usesThreeSignatures(req)) {
            return reviewBySignature(reviewer, req, decision, reason, role);
        }

        // 旧单签链（分笼、存量转移单）：审批人必须覆盖该单涉及的位置
        boolean isAdmin = visibilityPolicy.isGlobalViewer(reviewer);
        if (!isAdmin) {
            if (!coversAnyLocation(regionGrantService.reviewAuthority(reviewer), locationsOf(req))) {
                throw new TwinBusinessException(403, "非该楼层/房间审核人，无法审批");
            }
        }

        boolean approved = "approved".equals(decision);
        if (!approved && (reason == null || reason.isBlank())) {
            throw new TwinBusinessException(400, "驳回时必须填写理由");
        }
        if (approved) {
            execute(req, reviewer);
            req.setStatus(CageOpRequest.STATUS_APPROVED);
        } else {
            req.setStatus(CageOpRequest.STATUS_REJECTED);
            req.setRejectReason(reason);
        }
        req.setReviewerId(reviewer.getId());
        req.setReviewerName(displayNameOf(reviewer));
        req.setReviewedAt(DT_FMT.format(LocalDateTime.now()));
        // 终局：归档一份转移单。必须在 update 之前 —— 文件名要跟着这一次 update 一起落库
        archiveTransferFormQuietly(req);
        opMapper.update(req);

        writeApprovalRecord(reviewer, req, "cage_op_" + req.getOpType(),
                approved ? "approved" : "rejected", reason);

        // 存量转移单（signatures 为 NULL）走这条旧单签链；终局时通知申请人。分笼不通知。
        if (CageOpRequest.TYPE_TRANSFER.equals(req.getOpType())) {
            pushTransferReviewed(req);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", String.valueOf(req.getId()));
        out.put("status", req.getStatus());
        return out;
    }

    // ═══════════════════════════════════════════
    // 三签（新转移单）
    // ═══════════════════════════════════════════

    /** 该请求是否走三签。存量转移单（signatures 列为 NULL）按旧规则走完，不进三签。 */
    private static boolean usesThreeSignatures(CageOpRequest req) {
        return CageOpRequest.TYPE_TRANSFER.equals(req.getOpType()) && req.getSignatures() != null;
    }

    /** 本次操作人对这条请求**还能签**的全部角色，按界面展示顺序（归属地→目的地→兽医）。 */
    private List<String> signableRoles(User reviewer, CageOpRequest req) {
        return signableRoles(
                visibilityPolicy.isGlobalViewer(reviewer),
                coversAnyLocation(regionGrantService.reviewAuthority(reviewer), locationsOf(req)),
                reviewVetService.canSignAsVet(reviewer.getId()),
                req);
    }

    /** 本次操作人对这条请求有资格签的角色；null = 没资格或没有可签的了。 */
    private String roleOfReviewer(User reviewer, CageOpRequest req) {
        List<String> roles = signableRoles(reviewer, req);
        return roles.isEmpty() ? null : roles.get(0);
    }

    /**
     * {@link #signableRoles} 的纯判据，抽成 static 便于单测（构造真实例要 27 个依赖）。
     *
     * <p>返回「本次操作人现在能签的角色」，按 {@link CageOpSignatures#ROLES} 顺序，排除已同意的角色。
     * 暂缓（held）不算同意 —— 签了暂缓的角色仍在列表里（签的人可以改判）。分笼单没有三签，恒空。
     *
     * <p><b>三关可以同一个人签完</b>：同一人既覆盖位置又在兽医名单里时，三个角色同时出现在列表里；
     * 早先的 {@code roleOfReviewer} 只挑第一个，签完自动落到下一关 —— 但 UI 从不告诉用户「这次签的是哪一关」，
     * 一次 通过 连按三次会签出三个不同角色，极易签错。所以现在把整份列表下发，让前端按角色分组出按钮。
     */
    static List<String> signableRoles(boolean globalViewer, boolean coversLocation, boolean canSignAsVet,
                                      CageOpRequest req) {
        // 分笼没有三签；存量转移单（signatures 列为 NULL）走的是旧的单签链，一次通过就执行。
        // 这两种都不能下发角色 —— 否则界面会画出「归属地/目的地/兽医」三个按钮，
        // 而点其中任意一个（哪怕点的是归属地）都会走旧链把整笔转移直接执行掉。
        if (req == null || !usesThreeSignatures(req)) return List.of();
        List<CageOpSignature> sigs = req.signatures();
        if (globalViewer) {
            // 超管代签逃生口：三签是硬关卡，任何一关找不到人都会让单子永久挂起。
            // 优先补「还没同意」的角色，顺序与界面展示一致。
            return CageOpSignatures.missingRoles(sigs);
        }
        List<String> out = new ArrayList<>();
        if (coversLocation) {
            // 源位置与目标位置都覆盖时，先签归属地那关，再签目的地
            if (!CageOpSignatures.hasApproved(sigs, CageOpSignature.ROLE_ORIGIN)) {
                out.add(CageOpSignature.ROLE_ORIGIN);
            }
            if (!CageOpSignatures.hasApproved(sigs, CageOpSignature.ROLE_DEST)) {
                out.add(CageOpSignature.ROLE_DEST);
            }
            // 两关签完不返回：同一人若还是名单兽医，兽医那关还等着他
        }
        if (canSignAsVet
                && !CageOpSignatures.hasApproved(sigs, CageOpSignature.ROLE_VET)) {
            out.add(CageOpSignature.ROLE_VET);
        }
        return out;
    }

    /** {@link #roleOfReviewer} 的纯判据：签「还能签的角色」里第一个；null = 没有可签的了。 */
    static String roleOfReviewer(boolean globalViewer, boolean coversLocation, boolean canSignAsVet,
                                 CageOpRequest req) {
        List<String> roles = signableRoles(globalViewer, coversLocation, canSignAsVet, req);
        return roles.isEmpty() ? null : roles.get(0);
    }

    /** 三签：记一条签名，三关都同意才执行；不同意立即终局；暂缓保持待审、可改判。 */
    private Map<String, Object> reviewBySignature(User reviewer, CageOpRequest req,
                                                  String decision, String reason, String role) {
        List<CageOpSignature> existing = req.signatures();
        if (CageOpSignatures.statusOf(existing).equals(CageOpSignature.STATUS_REJECTED)) {
            throw new TwinBusinessException(400, "该请求已终局驳回，无法再签");
        }
        String normalized = decision == null ? "" : decision.trim();
        if (!CageOpSignature.DECISION_APPROVED.equals(normalized)
                && !CageOpSignature.DECISION_HELD.equals(normalized)
                && !CageOpSignature.DECISION_REJECTED.equals(normalized)) {
            throw new TwinBusinessException(400, "decision 只能是 approved / held / rejected");
        }
        if (!CageOpSignature.DECISION_APPROVED.equals(normalized)
                && (reason == null || reason.isBlank())) {
            throw new TwinBusinessException(400, "暂缓或不同意时必须填写原因");
        }
        // 调用方显式指定要签哪一关：必须确实在「本次操作人能签的角色」里，否则 403。
        // 不静默回落到别的角色 —— 自动挑别的角色去签正是这个 bug 的根源。
        String requestedRole = (role == null || role.isBlank()) ? null : role.trim();
        String chosenRole;
        if (requestedRole != null) {
            if (!signableRoles(reviewer, req).contains(requestedRole)) {
                throw new TwinBusinessException(403, "你无权以「" + requestedRole + "」身份签署该请求");
            }
            chosenRole = requestedRole;
        } else {
            chosenRole = roleOfReviewer(reviewer, req);
            if (chosenRole == null) {
                throw new TwinBusinessException(403, "你没有该请求尚未签署的任一审核身份");
            }
        }

        CageOpSignature s = new CageOpSignature();
        s.setRole(chosenRole);
        s.setReviewerId(reviewer.getId());
        s.setReviewerName(displayNameOf(reviewer));
        s.setAt(DT_FMT.format(LocalDateTime.now()));
        s.setDecision(normalized);
        s.setReason(CageOpSignature.DECISION_APPROVED.equals(normalized) ? null : reason);

        List<CageOpSignature> merged = CageOpSignatures.withSignature(existing, s);
        req.setSignatures(CageOpSignatures.render(merged));

        String status = CageOpSignatures.statusOf(merged);
        if (CageOpSignature.STATUS_APPROVED.equals(status)) {
            execute(req, reviewer);
            req.setStatus(CageOpRequest.STATUS_APPROVED);
        } else if (CageOpSignature.STATUS_REJECTED.equals(status)) {
            req.setStatus(CageOpRequest.STATUS_REJECTED);
            req.setRejectReason(reason);
        } else {
            // 暂缓或还有人没签：单据留在待审，只更新最后经手人
            req.setStatus(CageOpRequest.STATUS_PENDING);
        }
        req.setReviewerId(reviewer.getId());
        req.setReviewerName(displayNameOf(reviewer));
        req.setReviewedAt(s.getAt());
        // 终局（通过/驳回）才归档；暂缓仍是待审，archive 自己会跳过
        archiveTransferFormQuietly(req);
        opMapper.update(req);
        writeApprovalRecord(reviewer, req, "cage_op_" + req.getOpType(),
                normalized, reason);

        // 三签终局（通过/驳回）时通知申请人；暂缓仍待签，不通知。
        if (!CageOpSignature.STATUS_PENDING.equals(status)) {
            pushTransferReviewed(req);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", String.valueOf(req.getId()));
        out.put("status", req.getStatus());
        out.put("signedRole", chosenRole);
        out.put("missingRoles", CageOpSignatures.missingRoles(merged));
        return out;
    }

    /** 审批留痕。分笼/转移共用：targetType 由调用方给（cage_op_divide / cage_op_transfer）。 */
    private void writeApprovalRecord(User reviewer, CageOpRequest req, String targetType,
                                     String decision, String reason) {
        ApprovalRecord ar = new ApprovalRecord();
        ar.setTargetType(targetType);
        ar.setTargetId(req.getId());
        ar.setApproverId(reviewer.getId());
        ar.setApproverName(displayNameOf(reviewer));
        ar.setApproverRole(reviewer.getRole() != null ? reviewer.getRole().name() : "UNKNOWN");
        ar.setDecision(decision);
        ar.setRejectReason(CageOpSignature.DECISION_APPROVED.equals(decision) ? null : reason);
        approvalMapper.insert(ar);
    }

    /**
     * 终局归档转移单。**失败绝不能把审核拖下水**：模板缺失、LibreOffice 挂了、盘满，都只打一条 warn。
     * 归档只是留痕，审核结果照常落库；归档文件缺了，审核页走即时渲染那条路，用户看不到差别。
     *
     * <p>{@link TransferFormService#archive} 自己保证「只做转移单、只在终局、只做一次」，
     * 所以两条终局路径都无脑调它即可。
     */
    private void archiveTransferFormQuietly(CageOpRequest req) {
        try {
            transferFormService.archive(req);
        } catch (Exception e) {
            log.warn("[cage-op] 转移单归档失败 requestId={}: {}", req.getId(), e.getMessage(), e);
        }
    }

    // ═══════════════════════════════════════════
    // 转移审核通知（推送）
    // ═══════════════════════════════════════════

    /**
     * 转移待签提醒：通知「还没签」的审核人 —— 归属地未签就提醒覆盖源笼位的，目的地未签就提醒覆盖目标笼位的，
     * 兽医未签就提醒全局兽医名单。终局（通过/驳回）一律空，单子已经定了不需要再催。
     *
     * <p>抽成 static 纯函数便于单测（构造真实例要 28 个依赖）。暂缓（held）不算同意，照常提醒。
     */
    static Set<String> reminderRecipients(Set<String> originLeaders,
                                          Set<String> destLeaders,
                                          Set<String> vetAccounts,
                                          CageOpRequest req) {
        if (req == null) return Set.of();
        List<CageOpSignature> sigs = req.signatures();
        String status = CageOpSignatures.statusOf(sigs);
        if (CageOpSignature.STATUS_REJECTED.equals(status)
                || CageOpSignature.STATUS_APPROVED.equals(status)) {
            return Set.of();
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (!CageOpSignatures.hasApproved(sigs, CageOpSignature.ROLE_ORIGIN) && originLeaders != null) {
            out.addAll(originLeaders);
        }
        if (!CageOpSignatures.hasApproved(sigs, CageOpSignature.ROLE_DEST) && destLeaders != null) {
            out.addAll(destLeaders);
        }
        if (!CageOpSignatures.hasApproved(sigs, CageOpSignature.ROLE_VET) && vetAccounts != null) {
            out.addAll(vetAccounts);
        }
        out.removeIf(id -> id == null || id.isBlank());
        return out;
    }

    /** 提交时的待签提醒。失败只记日志 —— 通知绝不能把「提交成功」翻成报错（与物资申领同口径）。 */
    private void pushTransferReviewReminder(CageOpRequest req) {
        // 二级开关（笼架页设置中心）先判：关掉就根本不构造通知。与 push-config 上
        // CAGE_TRANSFER_REVIEW 源的总控是两个独立的值，级联 —— 两级都开才真的推。
        if (!ownerApprovalConfigService.transferReviewNotifyEnabled()) {
            log.info("[Push] CAGE_TRANSFER_REVIEW 二级开关已关，跳过 requestId={}", req.getId());
            return;
        }
        try {
            List<Map<String, Object>> srcLocs = sourceLocations(req);
            List<Map<String, Object>> tgtLocs = targetLocations(req);
            Set<String> recipients = reminderRecipients(
                    regionReviewerAccountIds(srcLocs),
                    regionReviewerAccountIds(tgtLocs),
                    new LinkedHashSet<>(reviewVetService.vetAccountIds()),
                    req);
            if (recipients.isEmpty()) return;
            pushService.send("CAGE_TRANSFER_REVIEW", Map.of(
                    "applicantName", nv(req.getApplicantName()),
                    "targetCount", String.valueOf(req.targetIds().size()),
                    "fromLocation", locationLabel(srcLocs),
                    "toLocation", locationLabel(tgtLocs),
                    "reason", nv(req.getReason())), recipients);
        } catch (Exception e) {
            log.warn("[Push] CAGE_TRANSFER_REVIEW failed: {}", e.getMessage());
        }
    }

    /** 终局回执：通知申请人审核结果。失败只记日志。 */
    private void pushTransferReviewed(CageOpRequest req) {
        try {
            String applicant = req.getApplicantId();
            if (applicant == null || applicant.isBlank()) return;
            String result = CageOpRequest.STATUS_APPROVED.equals(req.getStatus()) ? "已通过" : "已拒绝";
            pushService.send("CAGE_TRANSFER_REVIEWED", Map.of(
                    "applicantName", nv(req.getApplicantName()),
                    "targetCount", String.valueOf(req.targetIds().size()),
                    "fromLocation", locationLabel(sourceLocations(req)),
                    "toLocation", locationLabel(targetLocations(req)),
                    "reason", nv(req.getRejectReason()),
                    "auditResult", result), Set.of(applicant));
        } catch (Exception e) {
            log.warn("[Push] CAGE_TRANSFER_REVIEWED failed: {}", e.getMessage());
        }
    }

    /** 覆盖给定笼位位置的审核人账号 id（LEADER/REVIEWER）。收件人要账号 id，SQL 已折算。 */
    private Set<String> regionReviewerAccountIds(List<Map<String, Object>> locs) {
        Set<String> rooms = new LinkedHashSet<>();
        Set<String> floors = new LinkedHashSet<>();
        Set<String> campuses = new LinkedHashSet<>();
        if (locs != null) {
            for (Map<String, Object> loc : locs) {
                if (loc == null) continue;
                String room = str(loc.get("roomId"));
                String floor = str(loc.get("floorId"));
                String campus = str(loc.get("campusId"));
                if (room != null) rooms.add(room);
                if (floor != null) floors.add(floor);
                if (campus != null) campuses.add(campus);
            }
        }
        return regionGrantService.reviewerAccountIdsCovering(rooms, floors, campuses);
    }

    /**
     * 转移通知里「源笼位」的 id 列表：pairs 存在则取每个 pair 的源（去重保序——单源多目标的 shape 会重复源，
     * 仍只渲染一次），否则退回老列单源（存量单）。抽成 static 纯函数便于单测。
     */
    static List<Long> notificationSourceIds(CageOpRequest req) {
        if (req == null) return List.of();
        List<CageOpPair> pairs = req.pairs();
        if (!pairs.isEmpty()) {
            LinkedHashSet<Long> sources = new LinkedHashSet<>();
            for (CageOpPair p : pairs) {
                if (p != null && p.getSource() != null) sources.add(p.getSource());
            }
            return new ArrayList<>(sources);
        }
        Long src = req.getSourceAnimalCageId();
        return src == null ? List.of() : List.of(src);
    }

    /**
     * 转移通知里「目标笼位」的 id 列表：pairs 存在则按 pair 顺序取每个 target，否则退回老列数组
     * （{@code targetIds()}）。两条路径都从这里走，避免新单/存量单各自漂移。
     */
    static List<Long> notificationTargetIds(CageOpRequest req) {
        if (req == null) return List.of();
        List<CageOpPair> pairs = req.pairs();
        if (!pairs.isEmpty()) {
            List<Long> out = new ArrayList<>();
            for (CageOpPair p : pairs) {
                if (p != null && p.getTarget() != null) out.add(p.getTarget());
            }
            return out;
        }
        return req.targetIds();
    }

    /** 源笼位位置（一个或多个源；查不到索引跳过，调用方不必防）。 */
    private List<Map<String, Object>> sourceLocations(CageOpRequest req) {
        return lookupLocations(notificationSourceIds(req));
    }

    /** 目标笼位位置（一个或多个目标；查不到索引跳过）。 */
    private List<Map<String, Object>> targetLocations(CageOpRequest req) {
        return lookupLocations(notificationTargetIds(req));
    }

    /**
     * 按入参 id 顺序查位置：一次 IN 查询后回排到入参顺序，缺索引的笼位跳过。
     * 通知渲染依赖这个顺序（源/目标行按 pair 顺序列出），个别笼位缺索引也不丢整条。
     */
    private List<Map<String, Object>> lookupLocations(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        List<Map<String, Object>> rows = cellIndexMapper.lookupByAnimalCageIds(ids);
        if (rows == null || rows.isEmpty()) return List.of();
        Map<Long, Map<String, Object>> byId = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long id = toLong(row.get("animalCageId"));
            if (id != null) byId.put(id, row);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Long id : ids) {
            Map<String, Object> row = byId.get(id);
            if (row != null) out.add(row);
        }
        return out;
    }

    /** 一组位置里全部可渲染的位置标签，用「；」拼成一条；全空退回空串（模板上留白，别塞 "null" 进去）。 */
    static String locationLabel(List<Map<String, Object>> locs) {
        if (locs == null) return "";
        List<String> labels = new ArrayList<>();
        for (Map<String, Object> loc : locs) {
            String label = TransferFormService.locationLabel(loc);
            if (label != null && !label.isBlank()) labels.add(label);
        }
        return String.join("；", labels);
    }

    private static String nv(String s) {
        return s == null ? "" : s;
    }

    /** 申请人撤销自己的待审请求。 */
    @Transactional
    public Map<String, Object> cancel(User user, Long requestId, String reason) {
        CageOpRequest req = opMapper.selectByIdForUpdate(requestId);
        if (req == null) throw new TwinBusinessException(404, "操作请求不存在");
        if (!user.getId().equals(req.getApplicantId())) {
            throw new TwinBusinessException(403, "只能撤销自己提交的请求");
        }
        if (!CageOpRequest.STATUS_PENDING.equals(req.getStatus())) {
            throw new TwinBusinessException(400, "当前状态不可撤销");
        }
        req.setStatus(CageOpRequest.STATUS_CANCELLED);
        req.setRejectReason(reason);
        opMapper.update(req);
        return Map.of("requestId", String.valueOf(req.getId()), "status", req.getStatus());
    }

    // ═══════════════════════════════════════════
    // 执行
    // ═══════════════════════════════════════════

    private void execute(CageOpRequest req, User operator) {
        if (CageOpRequest.TYPE_DIVIDE.equals(req.getOpType())) {
            executeDivide(req, operator);
        } else if (CageOpRequest.TYPE_TRANSFER.equals(req.getOpType())) {
            executeTransfer(req, operator);
        } else {
            throw new TwinBusinessException(400, "未知操作类型: " + req.getOpType());
        }
    }

    private void executeDivide(CageOpRequest req, User operator) {
        Long motherId = req.getSourceAnimalCageId();
        CageCellDetail mother = detailMapper.selectByAnimalCageIdForUpdate(motherId);
        if (mother == null) throw new TwinBusinessException(404, "源笼位不存在");
        requireOperableSource(operator, motherId, "分笼");
        assertSourceNotPendingOccupied(motherId, req.getId());
        Occupant occ = resolveOccupant(motherId, mother);
        List<Long> targets = parseTargets(req);
        assertTargetsEligible(mother, targets, Boolean.TRUE.equals(req.getKeepSource()), req.getId(), operator);

        String now = DT_FMT.format(LocalDateTime.now());
        for (Long targetId : targets) {
            CageCellDetail target = lockEmptyTarget(targetId);
            CageClaim child = buildChildClaim(target, occ, operator,
                    "分笼自笼位 " + motherId + suffix(req.getReason()), now);
            claimMapper.insert(child);
            // 表单整表复制作为基础信息，具体数量/性别等由用户在新笼位表单上改
            infoValueService.copyFrom(motherId, targetId, operator.getId());
            // 实验员以认领人为准（源笼位实验员可能为空，不能靠复制带过去）
            infoValueService.syncFromMapped(targetId, Map.of("experimenter_name", child.getClaimantName()));
            target.setCageTypeCode(3);
            detailMapper.batchUpsert(List.of(target));
            writeTransferLog("divide", motherId, targetId, occ, operator, req.getReason());
        }

        if (!Boolean.TRUE.equals(req.getKeepSource())) {
            // 源笼位不再使用 → 走系统既有的「归档」机制：释放认领 + 清占用/动物/状态 + 回空笼盒 + 落归档记录
            occupancyService.archive(motherId, operator.getId(), "分笼归档" + suffix(req.getReason()));
        }
        log.info("[cage-op] divide source={} targets={} keepSource={} operator={}",
                motherId, targets, req.getKeepSource(), operator.getId());
    }

    /**
     * 转移的「源→目标」对。新单直接用 {@code pairs}；存量单（pairs 为 NULL）按老列反推：
     * 一个源 + 它的全部目标（去重排序，坏数据抛 400，与 {@link #parseTargets} 同口径），逐个成对。
     * 抽成 static 纯函数便于单测（构造真实例要 27 个依赖）。
     */
    static List<CageOpPair> transferPairs(CageOpRequest req) {
        if (req == null) return List.of();
        List<CageOpPair> pairs = req.pairs();
        if (!pairs.isEmpty()) return pairs;
        List<Long> raw = parseTargetIds(req);
        if (raw.isEmpty() && req.getTargetAnimalCageIds() != null && !req.getTargetAnimalCageIds().isBlank()) {
            throw new TwinBusinessException(400, "目标笼位数据损坏: " + req.getTargetAnimalCageIds());
        }
        Long src = req.getSourceAnimalCageId();
        List<Long> targets = raw.stream().distinct().sorted().toList();
        List<CageOpPair> out = new ArrayList<>(targets.size());
        for (Long t : targets) {
            CageOpPair p = new CageOpPair();
            p.setSource(src);
            p.setTarget(t);
            out.add(p);
        }
        return out;
    }

    /** 转移涉及的源笼位集合（去重保序）。多源批次返回多个源，重复源只出现一次 —— 归档按这个集合各做一次。 */
    static List<Long> transferSourceIds(CageOpRequest req) {
        LinkedHashSet<Long> sources = new LinkedHashSet<>();
        for (CageOpPair p : transferPairs(req)) {
            if (p != null && p.getSource() != null) sources.add(p.getSource());
        }
        return new ArrayList<>(sources);
    }

    private void executeTransfer(CageOpRequest req, User operator) {
        List<CageOpPair> pairs = transferPairs(req);
        if (pairs.isEmpty()) throw new TwinBusinessException(400, "缺少目标笼位");

        // 源去重保序：每个源只锁一次、验一次、取一次占用者、归档一次；重复源不重复处理
        Map<Long, CageCellDetail> sources = new LinkedHashMap<>();
        Map<Long, Occupant> occupants = new LinkedHashMap<>();
        Map<Long, List<Long>> targetsBySource = new LinkedHashMap<>();
        for (CageOpPair p : pairs) {
            if (p == null || p.getSource() == null) throw new TwinBusinessException(400, "转移数据缺少源笼位");
            if (p.getTarget() == null) throw new TwinBusinessException(400, "转移数据缺少目标笼位");
            Long s = p.getSource();
            sources.computeIfAbsent(s, id -> {
                CageCellDetail from = detailMapper.selectByAnimalCageIdForUpdate(id);
                if (from == null) throw new TwinBusinessException(404, "源笼位不存在");
                requireOperableSource(operator, id, "转移");
                assertSourceNotPendingOccupied(id, req.getId());
                occupants.put(id, resolveOccupant(id, from));
                return from;
            });
            targetsBySource.computeIfAbsent(s, id -> new ArrayList<>()).add(p.getTarget());
        }

        // 目标去重排序（与旧 parseTargets 同序，单源时逐字节一致），先逐源过准入
        Map<Long, List<Long>> targets = new LinkedHashMap<>();
        for (Map.Entry<Long, List<Long>> e : targetsBySource.entrySet()) {
            List<Long> list = e.getValue().stream().distinct().sorted().toList();
            targets.put(e.getKey(), list);
            assertTargetsEligible(sources.get(e.getKey()), list, false, req.getId(), operator);
        }

        String now = DT_FMT.format(LocalDateTime.now());
        for (Map.Entry<Long, List<Long>> e : targets.entrySet()) {
            Long fromId = e.getKey();
            Occupant occ = occupants.get(fromId);
            for (Long toId : e.getValue()) {
                // 目标笼位：空笼盒 → 饲养中，占用者/AUP 继承源笼位
                CageCellDetail to = lockEmptyTarget(toId);
                CageClaim toClaim = buildChildClaim(to, occ, operator,
                        "转移自笼位 " + fromId + suffix(req.getReason()), now);
                claimMapper.insert(toClaim);
                to.setCageTypeCode(3);
                detailMapper.batchUpsert(List.of(to));

                // 占用字段随动物走（目标与源同 AUP，课题组归属本就一致）
                infoValueService.copyTransferableFields(fromId, toId, "TRANSFER", operator.getId());
                // 实验员以占用者为准（源笼位实验员可能为空）
                infoValueService.syncFromMapped(toId, Map.of("experimenter_name", toClaim.getClaimantName()));

                writeTransferLog("transfer", fromId, toId, occ, operator, req.getReason());
            }
        }

        // 源笼位腾空 → 走系统既有的「归档」机制：释放认领 + 清占用/动物/状态 + 回空笼盒 + 落归档记录。
        // 每个不同的源归档一次，重复源不重复归档。
        for (Map.Entry<Long, List<Long>> e : targets.entrySet()) {
            occupancyService.archive(e.getKey(), operator.getId(),
                    "转移归档至笼位 " + String.join("、", e.getValue().stream().map(String::valueOf).toList())
                            + suffix(req.getReason()));
        }

        log.info("[cage-op] transfer pairs={} operator={}", pairs, operator.getId());
    }

    /** 锁目标笼位并校验为空笼盒(type2) + 无活跃认领。 */
    private CageCellDetail lockEmptyTarget(Long targetId) {
        CageCellDetail target = detailMapper.selectByAnimalCageIdForUpdate(targetId);
        if (target == null || target.getCageTypeCode() == null || target.getCageTypeCode() != 2) {
            throw new TwinBusinessException(400, "目标笼位不可用（需为空笼盒）: " + targetId);
        }
        for (CageClaim c : claimMapper.selectByAnimalCageIdForUpdate(targetId)) {
            if (c.isActive()) throw new TwinBusinessException(409, "目标笼位已有活跃认领: " + targetId);
        }
        return target;
    }

    private CageClaim buildChildClaim(CageCellDetail target, Occupant occ, User operator,
                                      String note, String now) {
        CageClaim child = new CageClaim();
        child.setAnimalCageId(target.getAnimalCageId());
        child.setClaimStatus("confirmed");
        child.setClaimantId(occ.accountId());
        child.setClaimantName(occ.name());
        child.setClaimantDept(target.getDepartmentName());
        child.setAupId(target.getAupId() != null ? target.getAupId() : occ.aupId());
        child.setAssignerId(operator.getId());
        child.setAssignerName(displayNameOf(operator));
        child.setConfirmRequired(false);
        child.setRetryCount(0);
        child.setConfirmedAt(now);
        child.setNote(note);
        return child;
    }

    /** 目标准入校验：必须与源笼位同 AUP 且没有被别的待审请求占住；checkQuota=true 时（净增占用的分笼）再过配额。 */
    private void assertTargetsEligible(CageCellDetail source, List<Long> targets, boolean checkQuota,
                                       Long excludeRequestId, User operator) {
        assertTargetsNotPendingOccupied(targets, excludeRequestId);
        String sourceAup = source.getAupNumber();
        for (Long id : targets) {
            CageCellDetail d = detailMapper.selectByAnimalCageId(id);
            if (d == null) throw new TwinBusinessException(404, "目标笼位不存在: " + id);
            // 目标必须与候选池 (CageClaimMapper.selectOpTargets) 同一口径：空笼盒、没人占、无活跃认领。
            // 候选池筛掉不等于服务端能省这一步——API 直调绕过候选池，就能把动物分进别人正在养的格子。
            if (!Integer.valueOf(2).equals(d.getCageTypeCode())) {
                throw new TwinBusinessException(409, "目标笼位 " + id + " 是「"
                        + CageCellDetailService.cageTypeLabel(d.getCageTypeCode()) + "」，只能分到空笼盒");
            }
            String occupant = experimenterOf(id);
            if (occupant != null) {
                throw new TwinBusinessException(409, "目标笼位 " + id + " 已被「" + occupant + "」占用");
            }
            String claimBusy = intermediateStateService.pendingClaimReason(id);
            if (claimBusy != null) throw new TwinBusinessException(409, "目标笼位 " + id + "：" + claimBusy);
            // 已被订购预定（含已下单待审）的空笼位，分笼/转移进去会和那张单的预定打架
            String busy = intermediateStateService.reservationReason(id);
            if (busy != null) throw new TwinBusinessException(409, "目标笼位 " + id + "：" + busy);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("aupNumber", d.getAupNumber());
            row.put("animalCageId", id);
            String reason = ineligibleReason(sourceAup, row, operator);
            if (reason != null) throw new TwinBusinessException(400, "目标笼位 " + id + "：" + reason);
        }
        if (checkQuota) assertQuotaForTargets(targets);
    }

    private void writeTransferLog(String eventType, Long from, Long to, Occupant occ,
                                  User operator, String reason) {
        CageTransferLog tl = new CageTransferLog();
        tl.setEventType(eventType);
        Personnel occupant = occ == null ? null : personnelService.resolveByAccount(occ.accountId());
        if (occupant != null) {
            tl.setOccupantId(occupant.getId());
            tl.setOccupantName(occupant.getName());
        } else if (occ != null) {
            tl.setOccupantName(occ.name());
        }
        Personnel op = personnelService.resolveByAccount(operator.getId());
        if (op != null) {
            tl.setOperatorId(op.getId());
            tl.setOperatorName(op.getName());
        } else {
            tl.setOperatorName(displayNameOf(operator));
        }
        tl.setFromAnimalCageId(from);
        tl.setToAnimalCageId(to);
        tl.setReason(reason);
        transferLogMapper.insert(tl);
    }

    // ═══════════════════════════════════════════
    // helpers
    // ═══════════════════════════════════════════

    private CageCellDetail requireDetail(Long animalCageId) {
        if (animalCageId == null) throw new TwinBusinessException(400, "animalCageId 必填");
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        if (d == null) throw new TwinBusinessException(404, "笼位不存在: " + animalCageId);
        return d;
    }

    private List<Long> normalizeTargets(List<Long> ids) {
        if (ids == null) return List.of();
        return ids.stream().filter(Objects::nonNull).distinct().sorted().toList();
    }

    /** 目标笼位 id 列表（去重排序）。解析失败一律 400 —— 评审/执行路径不能拿坏数据静默跑。 */
    private List<Long> parseTargets(CageOpRequest req) {
        List<Long> raw = parseTargetIds(req);
        if (raw.isEmpty() && req.getTargetAnimalCageIds() != null && !req.getTargetAnimalCageIds().isBlank()) {
            throw new TwinBusinessException(400, "目标笼位数据损坏: " + req.getTargetAnimalCageIds());
        }
        return raw.stream().distinct().sorted().toList();
    }

    /**
     * 本条请求涉及的**全部**位置：跨 pair 的源笼位 + 目标笼位。
     *
     * <p>审核作用域要对着它们逐个判覆盖：转移会跨房间，只判源位置会让目的地审核人根本看不到单子；
     * 批量转移还可能跨多个源，同样必须把每个 pair 的源与目标都算进来。
     * 源位置恒放最前（供 {@code toView} 取 {@code locs.get(0)} 当主位置显示），其余去重后补上。
     */
    private List<Map<String, Object>> locationsOf(CageOpRequest r) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Object> src = cellIndexMapper.lookupByAnimalCageId(r.getSourceAnimalCageId());
        if (src != null) out.add(src);
        List<Long> otherIds = r.involvedCageIds().stream()
                .filter(id -> !id.equals(r.getSourceAnimalCageId()))
                .toList();
        if (!otherIds.isEmpty()) {
            List<Map<String, Object>> rows = cellIndexMapper.lookupByAnimalCageIds(otherIds);
            if (rows != null) out.addAll(rows);
        }
        return out;
    }

    /** 这组位置里有没有一个被该审核权覆盖。全局可见者（超管）恒放行 —— 与旧行为一致。 */
    private static boolean coversAnyLocation(CageRegionGrantService.ReviewAuthority auth,
                                             List<Map<String, Object>> locations) {
        // 旧实现直接调 auth.covers(null, null, null)，而 covers 对 global 短路成 true，
        // 所以「源/目标笼位都查不到索引 → locations 为空」时超管的待审行仍可见。
        // 少了这一句，超管的这类待审单会被空列表静默吞掉，别当成冗余删掉。
        if (auth.global()) return true;
        for (Map<String, Object> loc : locations) {
            if (loc == null) continue;
            if (auth.covers(str(loc.get("roomId")), str(loc.get("floorId")), str(loc.get("campusId")))) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> toView(CageOpRequest r, Map<String, Object> loc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(r.getId()));
        m.put("opType", r.getOpType());
        m.put("sourceAnimalCageId", String.valueOf(r.getSourceAnimalCageId()));
        m.put("targetAnimalCageIds", parseTargets(r).stream().map(String::valueOf).toList());
        m.put("keepSource", r.getKeepSource());
        m.put("applicantId", r.getApplicantId());
        m.put("applicantName", r.getApplicantName());
        m.put("applicantScope", r.getApplicantScope());
        m.put("status", r.getStatus());
        m.put("signatures", r.signatures());
        m.put("missingRoles", CageOpSignatures.missingRoles(r.signatures()));
        // 是否走三签。客户端据此决定画「三个角色按钮」还是旧单签的「通过/驳回」——
        // 存量转移单（signatures 为 NULL）一次通过即执行，不能给它画角色按钮。
        m.put("threeSign", usesThreeSignatures(r));
        m.put("reason", r.getReason());
        m.put("reviewerName", r.getReviewerName());
        m.put("reviewedAt", r.getReviewedAt());
        m.put("rejectReason", r.getRejectReason());
        m.put("createdAt", r.getCreatedAt());
        if (loc != null) {
            m.put("campusName", loc.get("campusName"));
            m.put("floorName", loc.get("floorName"));
            m.put("roomName", loc.get("roomName"));
            m.put("shelveName", loc.get("shelveName"));
            m.put("positionX", loc.get("positionX"));
            m.put("positionY", loc.get("positionY"));
            // 前端「定位」要跳笼架页并高亮格子，得带 shelveId
            m.put("shelveId", loc.get("shelveId") == null ? null : String.valueOf(loc.get("shelveId")));
        }
        // 目标笼位坐标：审核卡片必须能看出「转到哪里」，只给 id 没法判断（分笼 1:多，逐个给）
        List<Long> targetIds = parseTargets(r);
        List<Map<String, Object>> targets = new ArrayList<>();
        if (!targetIds.isEmpty()) {
            Map<Long, Map<String, Object>> locById = new LinkedHashMap<>();
            for (Map<String, Object> row : cellIndexMapper.lookupByAnimalCageIds(targetIds)) {
                Long id = toLong(row.get("animalCageId"));
                if (id != null) locById.put(id, row);
            }
            for (Long id : targetIds) {
                Map<String, Object> t = new LinkedHashMap<>();
                t.put("animalCageId", String.valueOf(id));
                Map<String, Object> l = locById.get(id);
                if (l != null) {
                    t.put("shelveId", l.get("shelveId") == null ? null : String.valueOf(l.get("shelveId")));
                    t.put("campusName", l.get("campusName"));
                    t.put("roomName", l.get("roomName"));
                    t.put("shelveName", l.get("shelveName"));
                    t.put("positionX", l.get("positionX"));
                    t.put("positionY", l.get("positionY"));
                }
                targets.add(t);
            }
        }
        m.put("targets", targets);
        // 多源批量单：老列只写了 pairs[0].source，其余的源在界面上会「消失」——
        // 网格标记漏挂、小程序列表的位置只显示第一个源。把整份 pairs 下发，前端才画得全。
        List<Map<String, Object>> pairs = new ArrayList<>();
        for (CageOpPair p : r.pairs()) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("source", String.valueOf(p.getSource()));
            pm.put("target", String.valueOf(p.getTarget()));
            pairs.add(pm);
        }
        m.put("pairs", pairs);
        return m;
    }

    private String displayNameOf(User user) {
        if (user == null || user.getId() == null) return "";
        String n = userDisplayNameService.resolveDisplayName(user.getId());
        return (n != null && !n.isBlank()) ? n : user.getId();
    }

    private static String suffix(String reason) {
        return (reason == null || reason.isBlank()) ? "" : "：" + reason;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}

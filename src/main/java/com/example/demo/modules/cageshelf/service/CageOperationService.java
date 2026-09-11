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
    private final CageAuditAssignmentService auditAssignmentService;
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
                                CageAuditAssignmentService auditAssignmentService,
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
                                UserGroupNameResolver userGroupNameResolver) {
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
        this.auditAssignmentService = auditAssignmentService;
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
            // 源笼位本身不出现在目标池里（自己不能是自己的目标）
            if (Objects.equals(toLong(row.get("animalCageId")), sourceAnimalCageId)) continue;
            Map<String, Object> m = new LinkedHashMap<>(row);
            // 审核中的笼位优先报「已有待审请求」——比 AUP 不符更贴近真实原因
            m.put("reason", busy.contains(toLong(row.get("animalCageId")))
                    ? "该笼位已有待审的分笼/转移请求"
                    : ineligibleReason(sourceAup, row, user));
            m.put("selectable", m.get("reason") == null);
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
            Map<String, Object> out = operable();
            // 额外身份（饲养员/饲养组长/超管）还能代绑定：弹窗检索本课题组人员
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
            return user.getId().equals(claim.getClaimantId())
                    ? operable()
                    : notOperable("NO_PERMISSION", "该笼位已被认领，无分笼/转移权限");
        }
        String exp = experimenterOf(animalCageId);
        if (exp == null) return notOperable("NOT_CLAIMED", "该笼位尚未认领，认领成本人后才能分笼/转移");
        return exp.equals(displayNameOf(user))
                ? operable()
                : notOperable("NO_PERMISSION", "该笼位由「" + exp + "」占用，无分笼/转移权限");
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
        if (!modeVisibilityService.isOpExtraOperator(operator)) {
            throw new TwinBusinessException(403, "无代认领权限（仅饲养员、饲养组长或管理员）");
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
        boolean admin = user.getRole() != null && user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        if (admin || modeVisibilityService.isOpExtraOperator(user)) {
            out.put("editable", true);
            return out;
        }
        CageClaim claim = claimMapper.selectActiveByAnimalCageId(animalCageId);
        if (claim != null && user.getId().equals(claim.getClaimantId())) {
            out.put("editable", true);
            return out;
        }
        String exp = experimenterOf(animalCageId);
        if (exp != null && exp.equals(displayNameOf(user))) {
            out.put("editable", true);
            return out;
        }
        out.put("editable", false);
        // 失败原因必须说清卡在哪一条。原来一律写「由 X 占用」，于是角色等级不够的人
        // 也读到「被占用」，误以为是占用问题 —— 高权限账号尤其容易被这句话带偏。
        RoleEnum role = user.getRole();
        String roleNote = admin ? ""
                : "；当前角色「" + (role == null ? "未知" : role.getDescZh())
                        + "」低于管理员，也不在额外操作身份名单里";
        out.put("reason", exp == null
                ? "该笼位尚未认领，认领成本人后才能编辑" + roleNote
                : "该笼位由「" + exp + "」占用" + (admin ? "，无编辑权限" : roleNote));
        return out;
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
                                              Long toAnimalCageId, String reason) {
        if (fromAnimalCageId == null || toAnimalCageId == null) {
            throw new TwinBusinessException(400, "fromAnimalCageId / toAnimalCageId 必填");
        }
        if (fromAnimalCageId.equals(toAnimalCageId)) {
            throw new TwinBusinessException(400, "源笼位与目标笼位不能相同");
        }
        CageCellDetail from = requireDetail(fromAnimalCageId);
        requireOperableSource(user, fromAnimalCageId, "转移");
        assertSourceNotPendingOccupied(fromAnimalCageId, null);
        assertTargetsEligible(from, List.of(toAnimalCageId), false, null, user);

        CageOpRequest req = new CageOpRequest();
        req.setOpType(CageOpRequest.TYPE_TRANSFER);
        req.setSourceAnimalCageId(fromAnimalCageId);
        req.setTargetAnimalCageIds(JSON.toJSONString(List.of(toAnimalCageId)));
        req.setKeepSource(false);
        req.setReason(reason);
        return submit(user, req, from);
    }

    /** 落请求行；需审核则留 pending，否则立即执行并置 approved。 */
    private Map<String, Object> submit(User user, CageOpRequest req, CageCellDetail source) {
        boolean student = modeVisibilityService.isStudent(user);
        // 是否需要审核由「目标所属人」（接收方）自己的持久化配置决定：分笼/转移的结果占用者
        // 就是源笼位的占用者，所以接收方即他。没配过 = 需要审核。
        // 门槛不变：只拦学生提交的，教职工提交一律直接执行。
        Occupant owner = resolveOccupant(req.getSourceAnimalCageId(), source);
        boolean needApproval = student
                && ownerApprovalConfigService.approvalRequiredFor(owner.accountId(), req.getOpType());
        req.setApplicantId(user.getId());
        req.setApplicantName(displayNameOf(user));
        req.setApplicantScope(student ? "student" : "staff");
        req.setStatus(CageOpRequest.STATUS_PENDING);
        opMapper.insert(req);

        if (!needApproval) {
            execute(req, user);
            req.setStatus(CageOpRequest.STATUS_APPROVED);
            req.setReviewerId(user.getId());
            req.setReviewerName(displayNameOf(user));
            req.setReviewedAt(DT_FMT.format(LocalDateTime.now()));
            opMapper.update(req);
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

    /** 待审列表：ADMIN/PI 全量，否则按 cage_audit_assignment 的楼层/房间归属过滤。 */
    public List<Map<String, Object>> pending(User reviewer, String opType) {
        boolean isAdmin = reviewer != null && reviewer.getRole() != null
                && reviewer.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOpRequest r : opMapper.selectByStatus(CageOpRequest.STATUS_PENDING, opType)) {
            Map<String, Object> loc = cellIndexMapper.lookupByAnimalCageId(r.getSourceAnimalCageId());
            if (!isAdmin && !auditAssignmentService.canReview(reviewer,
                    loc == null ? null : str(loc.get("roomId")),
                    loc == null ? null : str(loc.get("floorId")),
                    loc == null ? null : str(loc.get("campusId")))) {
                continue;
            }
            out.add(toView(r, loc));
        }
        return out;
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
        // ADMIN 及以上不受视角收口：isStudent 只看 account_source，不看 role，
        // 双视角绑定被抬到高权限的账号（account_source=STUDENT）会被误判成学生而丢失可见范围。
        boolean isAdmin = user != null && user.getRole() != null
                && user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
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
        CageOpRequest req = opMapper.selectByIdForUpdate(requestId);
        if (req == null) throw new TwinBusinessException(404, "操作请求不存在");
        if (!CageOpRequest.STATUS_PENDING.equals(req.getStatus())) {
            throw new TwinBusinessException(400, "该请求已处理：" + req.getStatus());
        }
        boolean isAdmin = reviewer.getRole() != null && reviewer.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        if (!isAdmin) {
            Map<String, Object> loc = cellIndexMapper.lookupByAnimalCageId(req.getSourceAnimalCageId());
            if (!auditAssignmentService.canReview(reviewer,
                    loc == null ? null : str(loc.get("roomId")),
                    loc == null ? null : str(loc.get("floorId")),
                    loc == null ? null : str(loc.get("campusId")))) {
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
        opMapper.update(req);

        ApprovalRecord ar = new ApprovalRecord();
        ar.setTargetType("cage_op_" + req.getOpType());
        ar.setTargetId(req.getId());
        ar.setApproverId(reviewer.getId());
        ar.setApproverName(displayNameOf(reviewer));
        ar.setApproverRole(reviewer.getRole() != null ? reviewer.getRole().name() : "UNKNOWN");
        ar.setDecision(approved ? "approved" : "rejected");
        ar.setRejectReason(approved ? null : reason);
        approvalMapper.insert(ar);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", String.valueOf(req.getId()));
        out.put("status", req.getStatus());
        return out;
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

    private void executeTransfer(CageOpRequest req, User operator) {
        Long fromId = req.getSourceAnimalCageId();
        List<Long> targets = parseTargets(req);
        if (targets.isEmpty()) throw new TwinBusinessException(400, "缺少目标笼位");
        Long toId = targets.get(0);

        CageCellDetail from = detailMapper.selectByAnimalCageIdForUpdate(fromId);
        if (from == null) throw new TwinBusinessException(404, "源笼位不存在");
        requireOperableSource(operator, fromId, "转移");
        assertSourceNotPendingOccupied(fromId, req.getId());
        Occupant occ = resolveOccupant(fromId, from);
        assertTargetsEligible(from, targets, false, req.getId(), operator);
        CageCellDetail to = lockEmptyTarget(toId);

        String now = DT_FMT.format(LocalDateTime.now());

        // 目标笼位：空笼盒 → 饲养中，占用者/AUP 继承源笼位
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
        // 源笼位腾空 → 走系统既有的「归档」机制：释放认领 + 清占用/动物/状态 + 回空笼盒 + 落归档记录
        occupancyService.archive(fromId, operator.getId(), "转移归档至笼位 " + toId + suffix(req.getReason()));

        log.info("[cage-op] transfer from={} to={} operator={}", fromId, toId, operator.getId());
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

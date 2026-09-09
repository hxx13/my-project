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
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.entity.CageTransferLog;
import com.example.demo.modules.cageshelf.mapper.ApprovalRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageOpRequestMapper;
import com.example.demo.modules.cageshelf.mapper.CageTransferLogMapper;
import com.example.demo.modules.notification.service.NotificationSettingsService;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 笼位操作（分笼 / 转移笼位）— 三端通用入口。
 *
 * 准入判定复用「申请笼位」同一条链：目标必须是空笼盒(type2) 且无活跃认领，
 * 且与源笼位同课题组（AUP 反查），再过配额校验。差别只在：
 *  - 判定基准是「源笼位所属课题组」而不是「操作人所属课题组」（教职工不一定属于课题组）；
 *  - 学生视角按 cage.claim.student_op_approval_required 决定是否进待审队列，教职工一律直接执行。
 *
 * 执行结果落 cage_transfer_log（占用事件留痕）+ approval_records（审批结果）。
 */
@Service
public class CageOperationService {

    private static final Logger log = LoggerFactory.getLogger(CageOperationService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String CONFIG_MODULE = "cage_claim";
    private static final String CONFIG_STUDENT_APPROVAL = "cage.claim.student_op_approval_required";

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
    private final NotificationSettingsService settingsService;
    private final CageAuditAssignmentService auditAssignmentService;
    private final CageModeVisibilityService modeVisibilityService;
    private final CageOccupancyService occupancyService;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final AupRecordMapper aupRecordMapper;
    private final ReferenceDataMapper referenceDataMapper;
    private final UserMapper userMapper;
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
                                NotificationSettingsService settingsService,
                                CageAuditAssignmentService auditAssignmentService,
                                CageModeVisibilityService modeVisibilityService,
                                CageOccupancyService occupancyService,
                                AroPersonnelMapper aroPersonnelMapper,
                                AupRecordMapper aupRecordMapper,
                                ReferenceDataMapper referenceDataMapper,
                                UserMapper userMapper,
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
        this.settingsService = settingsService;
        this.auditAssignmentService = auditAssignmentService;
        this.modeVisibilityService = modeVisibilityService;
        this.occupancyService = occupancyService;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.aupRecordMapper = aupRecordMapper;
        this.referenceDataMapper = referenceDataMapper;
        this.userMapper = userMapper;
        this.userGroupNameResolver = userGroupNameResolver;
    }

    // ═══════════════════════════════════════════
    // 配置
    // ═══════════════════════════════════════════

    /** 学生视角的分笼/转移是否需审核（教职工一律直接执行）。 */
    public boolean studentApprovalRequired() {
        try {
            String v = settingsService.getEffectiveValue(CONFIG_MODULE, CONFIG_STUDENT_APPROVAL, "false");
            return "true".equalsIgnoreCase(v == null ? "" : v.trim());
        } catch (Exception e) {
            return false;
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
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : claimMapper.selectOpTargets(shelfIndexId)) {
            // 源笼位本身不出现在目标池里（自己不能是自己的目标）
            if (Objects.equals(toLong(row.get("animalCageId")), sourceAnimalCageId)) continue;
            Map<String, Object> m = new LinkedHashMap<>(row);
            m.put("reason", ineligibleReason(sourceAup, row));
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
     * 动态字段选项（按笼位现算）。目前只支持 `animal_strain_name`：
     * 取该笼位所属 AUP 的白名单里 `refType=ANIMAL_STRAIN` 的项（批准时由 B6.line 归一而来）；
     * AUP 没有品系白名单时退回「全部可购品系」参考数据，保证字段可用。
     * 选项 value/label 都用品系名（笼位表单存的就是这个字符串）。
     */
    public Map<String, Object> fieldOptions(User user, Long animalCageId, String canonical) {
        if (!"animal_strain_name".equals(canonical)) {
            throw new TwinBusinessException(400, "该字段不支持动态选项: " + canonical);
        }
        LinkedHashMap<String, String> dedup = new LinkedHashMap<>(); // label → label
        String source = "AUP_ALLOWLIST";
        CageCellDetail d = detailMapper.selectByAnimalCageId(animalCageId);
        AupRecord aup = (d != null && d.getAupNumber() != null && !d.getAupNumber().isBlank())
                ? aupRecordMapper.selectByRegisterNo(d.getAupNumber()) : null;
        if (aup != null && aup.getAnimalAllowlist() != null && !aup.getAnimalAllowlist().isBlank()) {
            try {
                for (Object o : JSON.parseArray(aup.getAnimalAllowlist())) {
                    if (!(o instanceof JSONObject j)) continue;
                    if (!"ANIMAL_STRAIN".equals(j.getString("refType"))) continue;
                    String label = j.getString("label");
                    if (label != null && !label.isBlank()) dedup.put(label.trim(), label.trim());
                }
            } catch (Exception e) {
                log.warn("[cage-op] 解析 AUP 白名单失败 aup={}: {}", aup.getRegisterNo(), e.getMessage());
            }
        }
        if (dedup.isEmpty()) {
            source = "GLOBAL";
            for (RefData r : referenceDataMapper.listOptions("ANIMAL_STRAIN")) {
                String title = refTitle(r.getFieldData());
                if (title != null && !title.isBlank()) dedup.put(title.trim(), title.trim());
            }
        }
        List<Map<String, Object>> options = new ArrayList<>();
        for (String v : dedup.keySet()) {
            options.add(Map.of("value", v, "label", v));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("options", options);
        out.put("source", source);
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

        CageClaim claim = new CageClaim();
        claim.setAnimalCageId(animalCageId);
        claim.setClaimStatus("confirmed");
        claim.setClaimantId(target.getId());
        claim.setClaimantName(displayNameOf(target));
        claim.setClaimantDept(d.getDepartmentName());
        claim.setAupId(d.getAupId());
        claim.setAssignerId(operator.getId());
        claim.setAssignerName(displayNameOf(operator));
        claim.setConfirmRequired(false);
        claim.setRetryCount(0);
        claim.setConfirmedAt(now);
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
        out.put("reason", exp == null
                ? "该笼位尚未认领，认领成本人后才能编辑"
                : "该笼位由「" + exp + "」占用，无编辑权限");
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
     */
    private String ineligibleReason(String sourceAup, Map<String, Object> candidate) {
        if (sourceAup == null || sourceAup.isBlank()) {
            return "源笼位未关联 AUP，无法分笼/转移";
        }
        String aup = str(candidate.get("aupNumber"));
        if (aup == null || aup.isBlank() || !aup.equals(sourceAup)) {
            return "与源笼位不是同一个 AUP（" + sourceAup + "）";
        }
        return null;
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
        List<Long> targets = normalizeTargets(targetAnimalCageIds);
        if (targets.isEmpty()) throw new TwinBusinessException(400, "请选择分笼目标笼位");
        // 未传 keepSource 时按「保留源笼位」处理（不保留才归档）；保留才会净增占用，才卡配额
        boolean keep = keepSource == null || keepSource;
        assertTargetsEligible(source, targets, keep);

        CageOpRequest req = new CageOpRequest();
        req.setOpType(CageOpRequest.TYPE_DIVIDE);
        req.setSourceAnimalCageId(sourceAnimalCageId);
        req.setTargetAnimalCageIds(JSON.toJSONString(targets));
        req.setKeepSource(keep);
        req.setReason(reason);
        return submit(user, req);
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
        assertTargetsEligible(from, List.of(toAnimalCageId), false);

        CageOpRequest req = new CageOpRequest();
        req.setOpType(CageOpRequest.TYPE_TRANSFER);
        req.setSourceAnimalCageId(fromAnimalCageId);
        req.setTargetAnimalCageIds(JSON.toJSONString(List.of(toAnimalCageId)));
        req.setKeepSource(false);
        req.setReason(reason);
        return submit(user, req);
    }

    /** 落请求行；需审核则留 pending，否则立即执行并置 approved。 */
    private Map<String, Object> submit(User user, CageOpRequest req) {
        boolean student = modeVisibilityService.isStudent(user);
        boolean needApproval = student && studentApprovalRequired();
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

    /** 我提交的操作请求。 */
    public List<Map<String, Object>> my(User user, String status) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageOpRequest r : opMapper.selectByApplicant(user.getId(), status)) {
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
        Occupant occ = resolveOccupant(motherId, mother);
        List<Long> targets = parseTargets(req);
        assertTargetsEligible(mother, targets, Boolean.TRUE.equals(req.getKeepSource()));

        String now = DT_FMT.format(LocalDateTime.now());
        for (Long targetId : targets) {
            CageCellDetail target = lockEmptyTarget(targetId);
            CageClaim child = buildChildClaim(target, occ, operator,
                    "分笼自笼位 " + motherId + suffix(req.getReason()), now);
            claimMapper.insert(child);
            // 表单整表复制作为基础信息，具体数量/性别等由用户在新笼位表单上改
            infoValueService.copyFrom(motherId, targetId);
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
        Occupant occ = resolveOccupant(fromId, from);
        assertTargetsEligible(from, targets, false);
        CageCellDetail to = lockEmptyTarget(toId);

        String now = DT_FMT.format(LocalDateTime.now());

        // 目标笼位：空笼盒 → 饲养中，占用者/AUP 继承源笼位
        CageClaim toClaim = buildChildClaim(to, occ, operator,
                "转移自笼位 " + fromId + suffix(req.getReason()), now);
        claimMapper.insert(toClaim);
        to.setCageTypeCode(3);
        detailMapper.batchUpsert(List.of(to));

        // 占用字段随动物走（目标与源同 AUP，课题组归属本就一致）
        infoValueService.copyTransferableFields(fromId, toId, "TRANSFER");
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

    /** 目标准入校验：必须与源笼位同 AUP；checkQuota=true 时（净增占用的分笼）再过配额。 */
    private void assertTargetsEligible(CageCellDetail source, List<Long> targets, boolean checkQuota) {
        String sourceAup = source.getAupNumber();
        for (Long id : targets) {
            CageCellDetail d = detailMapper.selectByAnimalCageId(id);
            if (d == null) throw new TwinBusinessException(404, "目标笼位不存在: " + id);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("aupNumber", d.getAupNumber());
            String reason = ineligibleReason(sourceAup, row);
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

    @SuppressWarnings("unchecked")
    private List<Long> parseTargets(CageOpRequest req) {
        String json = req.getTargetAnimalCageIds();
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Object> raw = JSON.parseArray(json, Object.class);
            List<Long> out = new ArrayList<>();
            for (Object o : raw) {
                Long l = toLong(o);
                if (l != null) out.add(l);
            }
            return out.stream().distinct().sorted().toList();
        } catch (Exception e) {
            throw new TwinBusinessException(400, "目标笼位数据损坏: " + json);
        }
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
        }
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

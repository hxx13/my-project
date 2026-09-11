package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aup.entity.AupRecord;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
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
import com.example.demo.modules.cageshelf.service.CageQuotaService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 笼位申请核心服务 — 状态机 + 并发控制 + 审批流。
 */
@Service
public class CageClaimService {

    private static final Logger log = LoggerFactory.getLogger(CageClaimService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final CageClaimMapper claimMapper;
    private final CageCellDetailMapper detailMapper;
    private final ApprovalRecordMapper approvalMapper;
    private final UserMapper userMapper;
    private final CageOwnerApprovalConfigService ownerApprovalConfigService;
    private final PersonIdentityService personIdentityService;
    private final UserDisplayNameService userDisplayNameService;
    private final CageQuotaService quotaService;
    private final CageInfoValueService infoValueService;
    private final CageFormAuditService auditService;
    private final AupRecordMapper aupRecordMapper;
    private final CageTransferLogMapper transferLogMapper;
    private final PersonnelService personnelService;
    private final CageCellDetailService detailService;
    private final CageAuditAssignmentService auditAssignmentService;
    private final CageCellIndexMapper cellIndexMapper;
    private final UserGroupNameResolver userGroupNameResolver;
    private final CageOpRequestMapper opRequestMapper;
    private final CageDivisionService divisionService;
    private final CageIntermediateStateService intermediateStateService;

    public CageClaimService(CageClaimMapper claimMapper,
                            CageCellDetailMapper detailMapper,
                            ApprovalRecordMapper approvalMapper,
                            UserMapper userMapper,
                            CageOwnerApprovalConfigService ownerApprovalConfigService,
                            PersonIdentityService personIdentityService,
                            UserDisplayNameService userDisplayNameService,
                            CageQuotaService quotaService,
                            CageInfoValueService infoValueService,
                            CageFormAuditService auditService,
                            AupRecordMapper aupRecordMapper,
                            CageTransferLogMapper transferLogMapper,
                            PersonnelService personnelService,
                            CageCellDetailService detailService,
                            CageAuditAssignmentService auditAssignmentService,
                            CageCellIndexMapper cellIndexMapper,
                            UserGroupNameResolver userGroupNameResolver,
                            CageOpRequestMapper opRequestMapper,
                            CageDivisionService divisionService,
                            CageIntermediateStateService intermediateStateService) {
        this.claimMapper = claimMapper;
        this.detailMapper = detailMapper;
        this.approvalMapper = approvalMapper;
        this.userMapper = userMapper;
        this.ownerApprovalConfigService = ownerApprovalConfigService;
        this.personIdentityService = personIdentityService;
        this.userDisplayNameService = userDisplayNameService;
        this.quotaService = quotaService;
        this.infoValueService = infoValueService;
        this.auditService = auditService;
        this.aupRecordMapper = aupRecordMapper;
        this.transferLogMapper = transferLogMapper;
        this.personnelService = personnelService;
        this.detailService = detailService;
        this.auditAssignmentService = auditAssignmentService;
        this.cellIndexMapper = cellIndexMapper;
        this.userGroupNameResolver = userGroupNameResolver;
        this.opRequestMapper = opRequestMapper;
        this.divisionService = divisionService;
        this.intermediateStateService = intermediateStateService;
    }

    private String displayNameOf(User user) {
        if (user == null || user.getId() == null) {
            return "";
        }
        String n = userDisplayNameService.resolveDisplayName(user.getId());
        return (n != null && !n.isBlank()) ? n : user.getId();
    }

    private String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    // ═══════════════════════════════════════════
    // 配置读取
    // ═══════════════════════════════════════════

    /** 到位确认是否需要，由「接收人自己」的所属人配置决定（无配置 = 需要）。 */
    private boolean getConfirmRequired(String claimantAccountId) {
        return ownerApprovalConfigService.confirmRequiredFor(claimantAccountId);
    }

    // ═══════════════════════════════════════════
    // 池查询
    // ═══════════════════════════════════════════

    /**
     * 正被未决分笼/转移占住的笼位（源 + 目标），字符串 id 便于与 map 行比对。
     * 认领池本来靠 cage_claims 挡住「待审批/待释放/到未位确认」，但那些是认领这条链的状态；
     * 分笼/转移的待审不动笼位状态，所以这里必须单独排掉，否则会选到同一个笼位造成两个待审互相打架。
     */
    private Set<String> pendingOpOccupiedKeys() {
        Set<String> out = new HashSet<>();
        for (Long id : CageOperationService.pendingOccupiedCages(
                opRequestMapper.selectByStatus(CageOpRequest.STATUS_PENDING, null), null)) {
            out.add(String.valueOf(id));
        }
        return out;
    }

    public List<Map<String, Object>> getPoolCells(Long shelfIndexId, User student) {
        List<Map<String, Object>> rows = claimMapper.selectPoolCells(shelfIndexId);
        // 申请池按当前用户的课题组过滤：高权限身份不放大可申请范围（否则越界）。
        List<String> groups = resolveUserGroupNames(student.getId());
        Set<String> busy = pendingOpOccupiedKeys();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (busy.contains(String.valueOf(row.get("animalCageId")))) continue;
            String pi = row.get("projectPiName") == null ? "" : String.valueOf(row.get("projectPiName"));
            String dept = row.get("departmentName") == null ? "" : String.valueOf(row.get("departmentName"));
            if (!PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groups, pi, dept)) continue;
            // 划分规则：已划分给别人的笼位不进本人的申请池
            if (divisionService.isBlocked(parseCageId(row.get("animalCageId")), student.getId())) continue;
            CageCellIndexService.stringifySnowflakeIds(row, "animalCageId", "shelveId");
            out.add(row);
        }
        return out;
    }

    // ═══════════════════════════════════════════
    // 学生认领
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim claim(User student, Long animalCageId, Long shelfIndexId) {
        // ① FOR UPDATE 锁笼位详情（防止并发竞态）
        CageCellDetail detail = detailMapper.selectByAnimalCageIdForUpdate(animalCageId);
        if (detail == null || detail.getCageTypeCode() == null || detail.getCageTypeCode() != 2) {
            throw new TwinBusinessException(400, "该笼位当前不可申请");
        }

        // ①½ 课题组归属 + AUP 反查校验
        assertClaimableByUser(student, detail);

        // ①¾ 该笼位若正被未决的分笼/转移占住，先等那条审完（否则两边审批会互相打架）
        if (pendingOpOccupiedKeys().contains(String.valueOf(animalCageId))) {
            throw new TwinBusinessException(409, "该笼位已有待审的分笼/转移请求，请等它审完再申请");
        }

        // ①⅞ 已被订购预定（含已下单待审）的笼位不能认领：那张单审核通过时会把占用人写进同一格，
        // 两个流程都认为自己占着它。中间态口径统一走 CageIntermediateStateService。
        String reserved = intermediateStateService.reservationReason(animalCageId);
        if (reserved != null) {
            throw new TwinBusinessException(409, reserved + "，请等它结束再申请");
        }

        // ② FOR UPDATE 锁已有活跃认领（只锁活跃态，不锁历史）
        List<CageClaim> existing = claimMapper.selectByAnimalCageIdForUpdate(animalCageId);
        for (CageClaim c : existing) {
            if (c.isActive()) {
                throw new TwinBusinessException(409, "该笼位已被其他同学预约");
            }
        }

        // ③ 驳回控制
        String studentId = student.getId();
        String lastRejectedAt = claimMapper.selectLastRejectedAt(animalCageId, studentId);
        if (lastRejectedAt != null) {
            int cooldownMin = 5;
            try {
                LocalDateTime last = LocalDateTime.parse(lastRejectedAt, DT_FMT);
                if (LocalDateTime.now().isBefore(last.plusMinutes(cooldownMin))) {
                    throw new TwinBusinessException(400, "该笼位申请刚被驳回，请 " + cooldownMin + " 分钟后再试");
                }
            } catch (Exception e) {
                log.warn("[cage-apply] 驳回时间解析失败 animalCageId={} rejectedAt={}", animalCageId, lastRejectedAt);
            }
        }
        int rejectCount = claimMapper.countRejectedByAnimalCage(animalCageId, studentId);
        if (rejectCount >= 3) {
            throw new TwinBusinessException(400, "该笼位你已被驳回 " + rejectCount + " 次，请联系管理员处理");
        }

        // ④ 决定初始状态（认领默认走审批流 pending_approval，仅 confirm_required 配置是否到位确认）
        String mode = "pi";
        boolean confirmReq = getConfirmRequired(studentId);
        String initStatus;
        if ("none".equals(mode)) {
            initStatus = confirmReq ? "locked" : "confirmed";
        } else {
            initStatus = "pending_approval";
        }

        // ⑤ 创建认领
        CageClaim claim = new CageClaim();
        claim.setAnimalCageId(animalCageId);
        claim.setClaimStatus(initStatus);
        claim.setClaimantId(studentId);
        claim.setClaimantName(displayNameOf(student));
        claim.setClaimantDept(detail.getDepartmentName());
        claim.setConfirmRequired(confirmReq);
        claim.setRetryCount(0);
        AupRecord aup = aupRecordMapper.selectByRegisterNo(detail.getAupNumber());
        claim.setAupId(aup != null ? aup.getId() : null);
        claimMapper.insert(claim);
        infoValueService.seedFromDetail(claim.getAnimalCageId());
        if ("confirmed".equals(initStatus)) {
            applyOccupancy(claim);
        }

        log.info("[cage-apply] student={} animalCageId={} status={} id={}", studentId, animalCageId, initStatus, claim.getId());
        return claim;
    }

    private List<String> resolveUserGroupNames(String userId) {
        return userGroupNameResolver.resolve(userId);
    }

    private void assertClaimableByUser(User student, CageCellDetail detail) {
        List<String> groups = resolveUserGroupNames(student.getId());
        if (groups.isEmpty()) {
            throw new TwinBusinessException(400, "你还没有加入课题组，暂时无法申请笼位，请联系管理员");
        }
        if (detail.getAupNumber() == null || detail.getAupNumber().isBlank()) {
            throw new TwinBusinessException(400, "该笼位尚未关联课题组或 AUP，暂时无法申请，请联系管理员");
        }
        if (!PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groups, detail.getProjectPiName(), detail.getDepartmentName())) {
            throw new TwinBusinessException(403, "该笼位不在你的课题组范围内，无法申请");
        }
        AupRecord aup = aupRecordMapper.selectByRegisterNo(detail.getAupNumber());
        if (aup == null) throw new TwinBusinessException(400, "该笼位尚未关联 AUP，暂时无法申请");
        if (aup.getProjectGroupName() != null && !aup.getProjectGroupName().isBlank()) {
            boolean ok = false;
            for (String g : groups) {
                if (PersonnelProjectGroupUtil.belongsToGroup(aup.getProjectGroupName(), g)) { ok = true; break; }
            }
            if (!ok) throw new TwinBusinessException(403, "该笼位所属 AUP 不在你的课题组，无法申请");
        }
        // 划分规则：该笼位已划分给本课题组某人时，非被划分人不可申请
        if (divisionService.isBlocked(detail.getAnimalCageId(), student.getId())) {
            throw new TwinBusinessException(403, "该笼位已划分给其他人员，无法申请");
        }
    }

    /** 笼位 ID 宽松解析（行内可能是 Long 或字符串化的雪花 id）。 */
    private static Long parseCageId(Object v) {
        if (v == null) return null;
        try {
            return Long.valueOf(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 管理者「预定」给目标学生时的课题组/AUP 校验（与学生自己申请的 assertClaimableByUser 同规则，错误信息第三人称）。
     * 高权限（ADMIN/SUPER_ADMIN）也不能把笼位分给不属于该笼位 AUP 课题组的人——否则是越界。
     */
    private void assertStudentInCageGroup(User student, CageCellDetail detail) {
        List<String> groups = resolveUserGroupNames(student.getId());
        if (groups.isEmpty()) {
            throw new TwinBusinessException(400, "目标学生尚未加入课题组，无法分配该笼位");
        }
        if (detail.getAupNumber() == null || detail.getAupNumber().isBlank()) {
            throw new TwinBusinessException(400, "该笼位尚未关联课题组或 AUP，无法分配");
        }
        if (!PersonnelProjectGroupUtil.cellBelongsToAnyUserGroup(groups, detail.getProjectPiName(), detail.getDepartmentName())) {
            throw new TwinBusinessException(403, "目标学生不在该笼位的课题组范围内，无法分配");
        }
        AupRecord aup = aupRecordMapper.selectByRegisterNo(detail.getAupNumber());
        if (aup != null && aup.getProjectGroupName() != null && !aup.getProjectGroupName().isBlank()) {
            boolean ok = false;
            for (String g : groups) {
                if (PersonnelProjectGroupUtil.belongsToGroup(aup.getProjectGroupName(), g)) { ok = true; break; }
            }
            if (!ok) throw new TwinBusinessException(403, "该笼位所属 AUP 不在目标学生的课题组，无法分配");
        }
    }

    private void applyOccupancy(CageClaim claim) {
        Long cageId = claim.getAnimalCageId();
        if (cageId == null) return;
        // 状态是表外固定字段：cage_cell_detail.cage_type_code 2→3
        CageCellDetail d = detailMapper.selectByAnimalCageId(cageId);
        if (d != null) {
            d.setCageTypeCode(3);
            detailMapper.batchUpsert(List.of(d));
        }
        // 占用者（实验员）是表内表单字段：写 cage_info_value.experimenter_name
        if (claim.getClaimantName() != null && !claim.getClaimantName().isBlank()) {
            infoValueService.syncFromMapped(cageId, Map.of("experimenter_name", claim.getClaimantName()));
        }
    }

    // ═══════════════════════════════════════════
    // 取消申请（pending_approval 或 locked）
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim cancel(User student, Long claimId) {
        CageClaim claim = claimMapper.selectById(claimId);
        if (claim == null) throw new TwinBusinessException(404, "认领记录不存在");
        if (!student.getId().equals(claim.getClaimantId())) {
            throw new TwinBusinessException(403, "只能取消自己的认领");
        }
        String s = claim.getClaimStatus();
        if (!"pending_approval".equals(s) && !"locked".equals(s)) {
            throw new TwinBusinessException(400, "当前状态不可取消（仅审批中或已锁定可取消）");
        }

        claim.setClaimStatus("cancelled");
        claim.setNote("学生主动取消");
        claimMapper.update(claim);

        log.info("[cage-apply] cancel student={} claimId={} animalCageId={}", student.getId(), claimId, claim.getAnimalCageId());
        return claim;
    }

    // ═══════════════════════════════════════════
    // 到场确认（幂等）
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim confirm(User student, Long claimId) {
        CageClaim claim = claimMapper.selectById(claimId);
        if (claim == null) throw new TwinBusinessException(404, "认领记录不存在");
        if (!student.getId().equals(claim.getClaimantId())) {
            throw new TwinBusinessException(403, "只能确认自己的认领");
        }
        if ("confirmed".equals(claim.getClaimStatus())) return claim; // 幂等
        if (!"locked".equals(claim.getClaimStatus())) {
            throw new TwinBusinessException(400, "当前状态不可确认（仅已锁定可确认）");
        }

        claim.setClaimStatus("confirmed");
        claim.setConfirmedAt(DT_FMT.format(LocalDateTime.now()));
        claimMapper.update(claim);
        applyOccupancy(claim);

        log.info("[cage-apply] confirm student={} claimId={} animalCageId={}", student.getId(), claimId, claim.getAnimalCageId());
        return claim;
    }

    // ═══════════════════════════════════════════
    // 释放申请
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim release(User student, Long claimId, String reason) {
        CageClaim claim = claimMapper.selectById(claimId);
        if (claim == null) throw new TwinBusinessException(404, "认领记录不存在");
        if (!student.getId().equals(claim.getClaimantId())) {
            throw new TwinBusinessException(403, "只能释放自己的笼位");
        }
        if (!"confirmed".equals(claim.getClaimStatus())) {
            throw new TwinBusinessException(400, "当前状态不可释放（仅已确认可释放）");
        }

        String releaseMode = "pi";

        String beforeStatus = claim.getClaimStatus();
        if ("none".equals(releaseMode)) {
            String now = DT_FMT.format(LocalDateTime.now());
            claim.setClaimStatus("released");
            claim.setReleasedAt(now);
            claim.setNote(reason);
            claimMapper.update(claim);
            auditService.logDataJson("RELEASE", "claim", claimId, String.valueOf(claimId), claim.getClaimantName(),
                    "claim", claimId, "claim:" + claimId,
                    Map.of("status", beforeStatus, "claimantId", claim.getClaimantId()),
                    Map.of("status", "released", "reason", reason != null ? reason : ""),
                    student.getId());
        } else {
            claim.setClaimStatus("pending_release_approval");
            claim.setNote(reason);
            claimMapper.update(claim);
            auditService.logDataJson("RELEASE", "claim", claimId, String.valueOf(claimId), claim.getClaimantName(),
                    "claim", claimId, "claim:" + claimId,
                    Map.of("status", beforeStatus),
                    Map.of("status", "pending_release_approval", "reason", reason != null ? reason : ""),
                    student.getId());
        }

        log.info("[cage-apply] release student={} claimId={} animalCageId={} mode={}", student.getId(), claimId, claim.getAnimalCageId(), releaseMode);
        return claim;
    }

    // ═══════════════════════════════════════════
    // 转移归属
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim transfer(User student, Long claimId, String toStudentUserId, String reason) {
        // 目标账号统一折算成 ARO 编号 —— 选人弹窗优先给 STAFF_ id，
        // 而学生自己登录用的是 ARO 编号，不折算会变成「同一人两种 claimant_id」
        toStudentUserId = userGroupNameResolver.canonicalUserId(toStudentUserId);
        CageClaim claim = claimMapper.selectById(claimId);
        if (claim == null) throw new TwinBusinessException(404, "认领记录不存在");
        if (!student.getId().equals(claim.getClaimantId())) {
            throw new TwinBusinessException(403, "只能转移自己的笼位");
        }
        if (!"confirmed".equals(claim.getClaimStatus())) {
            throw new TwinBusinessException(400, "当前状态不可转移（仅已确认可转移）");
        }

        User toUser = userMapper.findById(toStudentUserId);
        if (toUser == null) throw new TwinBusinessException(400, "目标用户不存在");

        String fromName = displayNameOf(student);
        String toName = displayNameOf(toUser);
        String fromId = claim.getClaimantId();

        claim.setClaimantId(toStudentUserId);
        claim.setClaimantName(displayNameOf(toUser));
        claim.setNote("转自 " + displayNameOf(student) + "：" + (reason != null ? reason : ""));
        claimMapper.update(claim);

        auditService.logDataJson("TRANSFER", "claim", claimId, String.valueOf(claimId), "笼位认领",
                "claim", claimId, "animalCage:" + claim.getAnimalCageId(),
                Map.of("claimantId", fromId, "claimantName", fromName),
                Map.of("claimantId", toStudentUserId, "claimantName", toName, "reason", reason),
                student.getId());

        log.info("[cage-apply] transfer from={} to={} claimId={} animalCageId={}",
                student.getId(), toStudentUserId, claimId, claim.getAnimalCageId());
        return claim;
    }

    // ═══════════════════════════════════════════
    // 分笼（D2）：母笼确认后派生子笼认领
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim divide(User student, Long claimId, List<Long> targetAnimalCageIds, String reason) {
        CageClaim mother = claimMapper.selectByIdForUpdate(claimId);
        if (mother == null) throw new TwinBusinessException(404, "认领记录不存在");
        if (!student.getId().equals(mother.getClaimantId())) {
            throw new TwinBusinessException(403, "只能对自己的笼位进行分笼");
        }
        if (!"confirmed".equals(mother.getClaimStatus())) {
            throw new TwinBusinessException(400, "当前状态不可分笼（仅已确认可分笼）");
        }
        if (targetAnimalCageIds == null || targetAnimalCageIds.isEmpty()) {
            throw new TwinBusinessException(400, "请选择分笼目标笼位");
        }
        // 去重 + 升序排序，保证多笼锁定顺序一致，避免并发 divide 死锁
        List<Long> targets = targetAnimalCageIds.stream().distinct().sorted().toList();

        List<Long> childIds = new ArrayList<>();
        for (Long targetId : targets) {
            // ① FOR UPDATE 锁目标笼位详情
            CageCellDetail detail = detailMapper.selectByAnimalCageIdForUpdate(targetId);
            if (detail == null || detail.getCageTypeCode() == null || detail.getCageTypeCode() != 2) {
                throw new TwinBusinessException(400, "笼位不可分笼");
            }
            // ② FOR UPDATE 锁目标笼位活跃认领
            List<CageClaim> existing = claimMapper.selectByAnimalCageIdForUpdate(targetId);
            for (CageClaim c : existing) {
                if (c.isActive()) {
                    throw new TwinBusinessException(409, "目标笼位已有活跃认领");
                }
            }

            // ③ 派生子笼认领（locked，等待到场确认）
            CageClaim child = new CageClaim();
            child.setAnimalCageId(targetId);
            child.setClaimStatus("locked");
            child.setClaimantId(mother.getClaimantId());
            child.setClaimantName(mother.getClaimantName());
            child.setClaimantDept(mother.getClaimantDept());
            child.setAupId(mother.getAupId());
            child.setAssignerId(mother.getAssignerId());
            child.setAssignerName(mother.getAssignerName());
            child.setConfirmRequired(mother.getConfirmRequired());
            child.setRetryCount(0);
            child.setNote("分笼自笼位 " + mother.getAnimalCageId() + (reason != null ? "：" + reason : ""));
            claimMapper.insert(child);
            childIds.add(child.getId());

            // ④ 表单值继承（INHERIT）并清空需重填字段
            infoValueService.copyFrom(mother.getAnimalCageId(), child.getAnimalCageId(), student.getId());
        }

        // ⑤ 母笼归档
        mother.setClaimStatus("released");
        mother.setReleasedAt(DT_FMT.format(LocalDateTime.now()));
        mother.setNote("分笼归档" + (reason != null ? "：" + reason : ""));
        claimMapper.update(mother);

        // 分笼日志：为每个子笼写一条 cage_transfer_log
        Personnel occ = personnelService.resolveByAccount(mother.getClaimantId());
        Personnel op = personnelService.resolveByAccount(student.getId());
        for (Long targetId : targets) {
            CageTransferLog tl = new CageTransferLog();
            tl.setEventType("divide");
            tl.setOccupantId(occ != null ? occ.getId() : null);
            tl.setOccupantName(mother.getClaimantName());
            tl.setFromAnimalCageId(mother.getAnimalCageId());
            tl.setToAnimalCageId(targetId);
            tl.setOperatorId(op != null ? op.getId() : null);
            tl.setOperatorName(displayNameOf(student));
            tl.setReason(reason);
            transferLogMapper.insert(tl);
        }

        log.info("[cage-apply] divide motherClaimId={} animalCageId={} children={}",
                mother.getId(), mother.getAnimalCageId(), childIds);
        return mother;
    }

    // ═══════════════════════════════════════════
    // 管理端审批
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim approve(User approver, Long claimId, String decision, String reason) {
        // FOR UPDATE 锁住审批记录，防并发双批
        CageClaim claim = claimMapper.selectByIdForUpdate(claimId);
        if (claim == null) throw new TwinBusinessException(404, "认领记录不存在");

        String current = claim.getClaimStatus();
        boolean isClaimApproval = "pending_approval".equals(current);
        boolean isReleaseApproval = "pending_release_approval".equals(current);
        if (!isClaimApproval && !isReleaseApproval) {
            throw new TwinBusinessException(400, "当前状态不可审批: " + current);
        }

        boolean isAdmin = approver.getRole() != null && approver.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        // 审核人归属校验：ADMIN/PI 放行（既有口径），否则须配置了该笼位所在楼层/房间
        boolean hasReviewScope = false;
        if (!isAdmin && !personIdentityService.isPi(approver.getId())) {
            Map<String, Object> loc = cellIndexMapper.lookupByAnimalCageId(claim.getAnimalCageId());
            hasReviewScope = auditAssignmentService.canReview(approver,
                    loc == null ? null : str(loc.get("roomId")),
                    loc == null ? null : str(loc.get("floorId")),
                    loc == null ? null : str(loc.get("campusId")));
            if (!hasReviewScope) {
                throw new TwinBusinessException(403, "非该楼层/房间审核人，无法审批");
            }
        }

        if ("rejected".equals(decision)) {
            if (reason == null || reason.isBlank()) {
                throw new TwinBusinessException(400, "驳回时必须填写理由");
            }
            if (isClaimApproval) {
                claim.setClaimStatus("rejected");
                claim.setRetryCount((claim.getRetryCount() != null ? claim.getRetryCount() : 0) + 1);
                claim.setRejectedAt(DT_FMT.format(LocalDateTime.now()));
                claim.setNote(reason);
            } else {
                // 释放驳回 → 回到 confirmed
                claim.setClaimStatus("confirmed");
                claim.setNote(reason);
            }
        } else { // approved
            if (isClaimApproval) {
                boolean confirmReq = Boolean.TRUE.equals(claim.getConfirmRequired());
                claim.setClaimStatus(confirmReq ? "locked" : "confirmed");
                if (!confirmReq) {
                    claim.setConfirmedAt(DT_FMT.format(LocalDateTime.now()));
                    applyOccupancy(claim);
                }
            } else {
                // 释放审批通过
                claim.setClaimStatus("released");
                claim.setReleasedAt(DT_FMT.format(LocalDateTime.now()));
            }
        }
        claimMapper.update(claim);

        // 写审批记录
        ApprovalRecord ar = new ApprovalRecord();
        ar.setTargetType(isClaimApproval ? "cage_claim" : "cage_release");
        ar.setTargetId(claimId);
        ar.setApproverId(approver.getId());
        ar.setApproverName(displayNameOf(approver));
        ar.setApproverRole(approver.getRole() != null ? approver.getRole().name() : "UNKNOWN");
        ar.setDecision(decision);
        ar.setRejectReason("rejected".equals(decision) ? reason : null);
        approvalMapper.insert(ar);

        log.info("[cage-apply] approve {} claimId={} decision={} approver={}",
                isClaimApproval ? "认领" : "释放", claimId, decision, approver.getId());
        return claim;
    }

    @Transactional
    public CageClaim confirmOnBehalf(User operator, Long claimId) {
        boolean isAdmin = operator.getRole() != null && operator.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        if (!isAdmin && !personIdentityService.isBreedingGroupLeader(operator.getId())) {
            throw new TwinBusinessException(403, "无代确认权限（仅管理员或饲养组长）");
        }
        CageClaim claim = claimMapper.selectByIdForUpdate(claimId);
        if (claim == null) throw new TwinBusinessException(404, "认领记录不存在");
        if ("confirmed".equals(claim.getClaimStatus())) return claim;
        if (!"locked".equals(claim.getClaimStatus())) throw new TwinBusinessException(400, "当前状态不可确认");
        claim.setClaimStatus("confirmed");
        claim.setConfirmedAt(DT_FMT.format(LocalDateTime.now()));
        claimMapper.update(claim);
        applyOccupancy(claim);
        ApprovalRecord ar = new ApprovalRecord();
        ar.setTargetType("cage_confirm");
        ar.setTargetId(claimId);
        ar.setApproverId(operator.getId());
        ar.setApproverName(displayNameOf(operator));
        ar.setApproverRole(operator.getRole() != null ? operator.getRole().name() : "UNKNOWN");
        ar.setDecision("confirmed");
        approvalMapper.insert(ar);
        return claim;
    }

    @Transactional
    public List<Map<String, Object>> batchApprove(User approver, List<Long> ids) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Long id : ids) {
            try {
                CageClaim c = approve(approver, id, "approved", null);
                out.add(Map.of("id", id, "ok", true, "status", c.getClaimStatus()));
            } catch (Exception e) {
                out.add(Map.of("id", id, "ok", false, "error", e.getMessage() == null ? "审批失败" : e.getMessage()));
            }
        }
        return out;
    }

    /** 手动修正历史 confirmed 认领：笼位 2→3 + 写占用者。返回修正条数。 */
    @Transactional
    public int reconcileConfirmedOccupancy() {
        List<CageClaim> claims = claimMapper.selectByStatus("confirmed");
        int fixed = 0;
        for (CageClaim claim : claims) {
            Long cageId = claim.getAnimalCageId();
            if (cageId == null) continue;
            CageCellDetail d = detailMapper.selectByAnimalCageId(cageId);
            if (d != null && d.getCageTypeCode() != null && d.getCageTypeCode() == 3) continue;
            if (d == null) {
                d = new CageCellDetail();
                d.setAnimalCageId(cageId);
            }
            d.setCageTypeCode(3);
            detailMapper.batchUpsert(List.of(d));
            if (claim.getClaimantName() != null && !claim.getClaimantName().isBlank()) {
                infoValueService.syncFromMapped(cageId, Map.of("experimenter_name", claim.getClaimantName()));
            }
            fixed++;
        }
        return fixed;
    }

    // ═══════════════════════════════════════════
    // 管理端手动分配
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim assign(User admin, Long animalCageId, Long shelfIndexId,
                             String studentUserId, Long aupId) {
        // 目标账号统一折算成 ARO 编号（同 transfer 的说明）
        studentUserId = userGroupNameResolver.canonicalUserId(studentUserId);
        // ① FOR UPDATE
        CageCellDetail detail = detailMapper.selectByAnimalCageIdForUpdate(animalCageId);
        if (detail == null || detail.getCageTypeCode() == null || detail.getCageTypeCode() != 2) {
            throw new TwinBusinessException(400, "该笼位不可分配");
        }

        // ② FOR UPDATE
        List<CageClaim> existing = claimMapper.selectByAnimalCageIdForUpdate(animalCageId);
        for (CageClaim c : existing) {
            if (c.isActive()) throw new TwinBusinessException(409, "该笼位已有活跃认领");
        }

        User student = userMapper.findById(studentUserId);
        if (student == null) throw new TwinBusinessException(400, "目标学生不存在");

        // 越界防护：管理者不能把笼位分给不属于该笼位 AUP 课题组的人
        assertStudentInCageGroup(student, detail);

        boolean confirmReq = getConfirmRequired(studentUserId);
        CageClaim claim = new CageClaim();
        claim.setAnimalCageId(animalCageId);
        // 所属人自己的配置说了算：不需要到场确认就直接生效，需要则停在待确认
        claim.setClaimStatus(confirmReq ? "locked" : "confirmed");
        claim.setClaimantId(studentUserId);
        claim.setClaimantName(displayNameOf(student));
        claim.setClaimantDept(detail.getDepartmentName());
        claim.setAupId(aupId);
        claim.setAssignerId(admin.getId());
        claim.setAssignerName(displayNameOf(admin));
        claim.setConfirmRequired(confirmReq);
        claim.setRetryCount(0);
        claim.setNote("管理员手动分配");
        if (!confirmReq) claim.setConfirmedAt(DT_FMT.format(LocalDateTime.now()));
        claimMapper.insert(claim);
        infoValueService.seedFromDetail(claim.getAnimalCageId());
        if (!confirmReq) applyOccupancy(claim);

        log.info("[cage-apply] assign admin={} animalCageId={} → student={}", admin.getId(), animalCageId, studentUserId);
        return claim;
    }

    @Transactional
    public List<Map<String, Object>> assignBatch(User admin, List<Long> animalCageIds, String studentUserId) {
        // 目标账号统一折算成 ARO 编号（同 transfer 的说明）
        studentUserId = userGroupNameResolver.canonicalUserId(studentUserId);
        User student = userMapper.findById(studentUserId);
        if (student == null) throw new TwinBusinessException(400, "目标学生不存在");
        List<Map<String, Object>> out = new ArrayList<>();
        boolean confirmReq = getConfirmRequired(studentUserId);
        for (Long cageId : animalCageIds) {
            try {
                CageCellDetail locked = detailMapper.selectByAnimalCageIdForUpdate(cageId);
                if (locked == null || locked.getCageTypeCode() == null || locked.getCageTypeCode() != 2) {
                    throw new TwinBusinessException(400, "该笼位不可认领");
                }
                // 越界防护：逐个笼位校验目标学生是否属于其 AUP 课题组
                assertStudentInCageGroup(student, locked);
                List<CageClaim> existing = claimMapper.selectByAnimalCageIdForUpdate(cageId);
                for (CageClaim c : existing) if (c.isActive()) throw new TwinBusinessException(409, "该笼位已被认领");
                CageClaim claim = new CageClaim();
                claim.setAnimalCageId(cageId);
                // 所属人自己的配置说了算：不需要到场确认就直接生效
                claim.setClaimStatus(confirmReq ? "locked" : "confirmed");
                claim.setClaimantId(studentUserId);
                claim.setClaimantName(displayNameOf(student));
                claim.setClaimantDept(locked.getDepartmentName());
                claim.setAupId(locked.getAupId());
                claim.setAssignerId(admin.getId());
                claim.setAssignerName(displayNameOf(admin));
                claim.setConfirmRequired(confirmReq);
                claim.setRetryCount(0);
                claim.setNote("管理员认领");
                if (!confirmReq) claim.setConfirmedAt(DT_FMT.format(LocalDateTime.now()));
                claimMapper.insert(claim);
                if (claim.getClaimantName() != null && !claim.getClaimantName().isBlank()) {
                    infoValueService.syncFromMapped(cageId, Map.of("experimenter_name", claim.getClaimantName()));
                }
                infoValueService.seedFromDetail(cageId);
                if (!confirmReq) applyOccupancy(claim);
                out.add(Map.of("animalCageId", cageId, "ok", true, "claimId", claim.getId()));
            } catch (Exception e) {
                out.add(Map.of("animalCageId", cageId, "ok", false, "error", e.getMessage() == null ? "认领失败" : e.getMessage()));
            }
        }
        return out;
    }

    // ═══════════════════════════════════════════
    // 查询
    // ═══════════════════════════════════════════

    public CageClaim getById(Long id) { return claimMapper.selectById(id); }

    public List<Map<String, Object>> getMyClaims(String studentId, String status) {
        List<Map<String, Object>> rows = claimMapper.selectMyEnriched(studentId, status);
        for (Map<String, Object> row : rows) {
            if (row.get("animalCageId") != null) row.put("animalCageId", String.valueOf(row.get("animalCageId")));
            if (row.get("shelveId") != null) row.put("shelveId", String.valueOf(row.get("shelveId")));
        }
        return rows;
    }

    public Map<String, Object> getPendingList(String status, String keyword, int page, int pageSize) {
        int offset = (page - 1) * pageSize;
        return Map.of(
            "list", claimMapper.selectPending(status, keyword, offset, pageSize),
            "total", claimMapper.countPending(status, keyword),
            "page", page,
            "pageSize", pageSize
        );
    }

    /** 待审数（按审核人过滤）：ADMIN/SUPER_ADMIN 全量；否则只数其负责楼层/房间内的待审。 */
    public int countPendingForReviewer(User reviewer) {
        List<Map<String, Object>> pending = claimMapper.selectPending(null, null, 0, 100000);
        if (pending.isEmpty()) return 0;
        boolean isAdmin = reviewer != null && reviewer.getRole() != null
                && reviewer.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        if (isAdmin) return pending.size();
        int count = 0;
        for (Map<String, Object> c : pending) {
            if (auditAssignmentService.canReview(reviewer,
                    str(c.get("roomId")), str(c.get("floorId")), str(c.get("campusId")))) {
                count++;
            }
        }
        return count;
    }

    public List<ApprovalRecord> getApprovalHistory(Long claimId) {
        return approvalMapper.selectByTarget("cage_claim", claimId);
    }

    // ═══════════════════════════════════════════
    // 超时扫描（由 Scheduler 调用）
    // ═══════════════════════════════════════════

    @Transactional
    public int scanTimedOutPendingApproval(int beforeHours) {
        List<CageClaim> list = claimMapper.selectTimedOutPendingApproval(beforeHours);
        if (list.isEmpty()) return 0;
        List<Long> ids = list.stream().map(CageClaim::getId).toList();
        claimMapper.batchUpdateStatus(ids, "rejected", "SYSTEM:审批超时自动驳回(" + beforeHours + "h)");
        for (Long id : ids) {
            ApprovalRecord ar = new ApprovalRecord();
            ar.setTargetType("cage_claim"); ar.setTargetId(id);
            ar.setApproverId("0"); ar.setApproverName("SYSTEM"); ar.setApproverRole("SYSTEM");
            ar.setDecision("rejected"); ar.setRejectReason("审批超时，自动驳回（" + beforeHours + "小时未处理）");
            approvalMapper.insert(ar);
        }
        log.info("[claim-timeout] pending_approval {} → rejected", ids.size());
        return ids.size();
    }

    @Transactional
    public int scanTimedOutLocked(int beforeHours) {
        List<CageClaim> list = claimMapper.selectTimedOutLocked(beforeHours);
        if (list.isEmpty()) return 0;
        List<Long> ids = list.stream().map(CageClaim::getId).toList();
        claimMapper.batchUpdateStatus(ids, "cancelled", "SYSTEM:确认超时自动取消(" + beforeHours + "h)");
        // 写 SYSTEM 审计记录
        for (Long id : ids) {
            ApprovalRecord ar = new ApprovalRecord();
            ar.setTargetType("cage_claim"); ar.setTargetId(id);
            ar.setApproverId("0"); ar.setApproverName("SYSTEM"); ar.setApproverRole("SYSTEM");
            ar.setDecision("cancelled"); ar.setRejectReason("确认超时，自动取消（" + beforeHours + "小时未确认）");
            approvalMapper.insert(ar);
        }
        log.info("[claim-timeout] locked {} → cancelled", ids.size());
        return ids.size();
    }
}

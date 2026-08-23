package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.ApprovalRecord;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.mapper.ApprovalRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.service.CageQuotaService;
import com.example.demo.modules.identity.service.PersonIdentityService;
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
    private final NotificationSettingsService notificationSettingsService;
    private final PersonIdentityService personIdentityService;
    private final UserDisplayNameService userDisplayNameService;
    private final CageQuotaService quotaService;
    private final CageClaimInfoService cageClaimInfoService;

    public CageClaimService(CageClaimMapper claimMapper,
                            CageCellDetailMapper detailMapper,
                            ApprovalRecordMapper approvalMapper,
                            UserMapper userMapper,
                            NotificationSettingsService notificationSettingsService,
                            PersonIdentityService personIdentityService,
                            UserDisplayNameService userDisplayNameService,
                            CageQuotaService quotaService,
                            CageClaimInfoService cageClaimInfoService) {
        this.claimMapper = claimMapper;
        this.detailMapper = detailMapper;
        this.approvalMapper = approvalMapper;
        this.userMapper = userMapper;
        this.notificationSettingsService = notificationSettingsService;
        this.personIdentityService = personIdentityService;
        this.userDisplayNameService = userDisplayNameService;
        this.quotaService = quotaService;
        this.cageClaimInfoService = cageClaimInfoService;
    }

    private String displayNameOf(User user) {
        if (user == null || user.getId() == null) {
            return "";
        }
        String n = userDisplayNameService.resolveDisplayName(user.getId());
        return (n != null && !n.isBlank()) ? n : user.getId();
    }

    // ═══════════════════════════════════════════
    // 配置读取
    // ═══════════════════════════════════════════

    private String getConfig(String key, String fallback) {
        try {
            String v = notificationSettingsService.getEffectiveValue("cage_claim", key, fallback);
            return v != null && !v.isBlank() ? v : fallback;
        } catch (Exception e) {
            return fallback;
        }
    }

    private String getApprovalMode()       { return getConfig("cage.claim.approval_mode", "pi"); }
    private boolean getConfirmRequired()   { return "true".equalsIgnoreCase(getConfig("cage.claim.confirm_required", "false")); }
    private int getRejectCooldownMinutes() { return safeParseInt(getConfig("cage.claim.reject_cooldown_minutes", "5"), 5); }
    private int getMaxRejectCount()        { return safeParseInt(getConfig("cage.claim.max_reject_count", "3"), 3); }
    private int safeParseInt(String val, int fallback) {
        try { return Integer.parseInt(val); } catch (NumberFormatException e) { return fallback; }
    }
    private String getReleaseApprovalMode(){ return getConfig("cage.release.approval_mode", "follow_claim"); }

    // ═══════════════════════════════════════════
    // 池查询
    // ═══════════════════════════════════════════

    public List<Map<String, Object>> getPoolCells(Long shelfIndexId) {
        return claimMapper.selectPoolCells(shelfIndexId);
    }

    // ═══════════════════════════════════════════
    // 学生认领
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim claim(User student, Long animalCageId, Long shelfIndexId) {
        // ① FOR UPDATE 锁笼位详情（防止并发竞态）
        CageCellDetail detail = detailMapper.selectByAnimalCageIdForUpdate(animalCageId);
        if (detail == null || detail.getCageTypeCode() == null || detail.getCageTypeCode() != 2) {
            throw new TwinBusinessException(400, "该笼位不可认领（仅已预约空笼盒可认领）");
        }

        // ①½ 配额校验：认领也受「该 AUP 可用笼位数」限制
        Long roomId = claimMapper.selectRoomIdByShelfIndexId(shelfIndexId);
        quotaService.assertCanAllocate(roomId, detail.getAupNumber(), 1);

        // ② FOR UPDATE 锁已有活跃认领（只锁活跃态，不锁历史）
        List<CageClaim> existing = claimMapper.selectByAnimalCageIdForUpdate(animalCageId);
        for (CageClaim c : existing) {
            if (c.isActive()) {
                throw new TwinBusinessException(409, "该笼位已被认领");
            }
        }

        // ③ 驳回控制
        String studentId = student.getId();
        String lastRejectedAt = claimMapper.selectLastRejectedAt(animalCageId, studentId);
        if (lastRejectedAt != null) {
            int cooldownMin = getRejectCooldownMinutes();
            try {
                LocalDateTime last = LocalDateTime.parse(lastRejectedAt, DT_FMT);
                if (LocalDateTime.now().isBefore(last.plusMinutes(cooldownMin))) {
                    throw new TwinBusinessException(400, "驳回冷却中，请 " + cooldownMin + " 分钟后再试");
                }
            } catch (Exception e) {
                log.warn("[cage-apply] 驳回时间解析失败 animalCageId={} rejectedAt={}", animalCageId, lastRejectedAt);
            }
        }
        int rejectCount = claimMapper.countRejectedByAnimalCage(animalCageId, studentId);
        if (rejectCount >= getMaxRejectCount()) {
            throw new TwinBusinessException(400, "该笼位已被驳回 " + rejectCount + " 次，请联系管理员手动分配");
        }

        // ④ 查配置决定初始状态
        String mode = getApprovalMode();
        boolean confirmReq = getConfirmRequired();
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
        claimMapper.insert(claim);
        cageClaimInfoService.seedFromDetail(claim);

        log.info("[cage-apply] student={} animalCageId={} status={} id={}", studentId, animalCageId, initStatus, claim.getId());
        return claim;
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

        String releaseMode = getReleaseApprovalMode();
        if ("follow_claim".equals(releaseMode)) releaseMode = getApprovalMode();

        if ("none".equals(releaseMode)) {
            String now = DT_FMT.format(LocalDateTime.now());
            claim.setClaimStatus("released");
            claim.setReleasedAt(now);
            claim.setNote(reason);
            claimMapper.update(claim);
        } else {
            claim.setClaimStatus("pending_release_approval");
            claim.setNote(reason);
            claimMapper.update(claim);
        }

        log.info("[cage-apply] release student={} claimId={} animalCageId={} mode={}", student.getId(), claimId, claim.getAnimalCageId(), releaseMode);
        return claim;
    }

    // ═══════════════════════════════════════════
    // 转移归属
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim transfer(User student, Long claimId, String toStudentUserId, String reason) {
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

        claim.setClaimantId(toStudentUserId);
        claim.setClaimantName(displayNameOf(toUser));
        claim.setNote("转自 " + displayNameOf(student) + "：" + (reason != null ? reason : ""));
        claimMapper.update(claim);

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
            cageClaimInfoService.deriveInherited(mother.getId(), child.getId());
        }

        // ⑤ 母笼归档
        mother.setClaimStatus("released");
        mother.setReleasedAt(DT_FMT.format(LocalDateTime.now()));
        mother.setNote("分笼归档" + (reason != null ? "：" + reason : ""));
        claimMapper.update(mother);

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
        if (!isAdmin && !personIdentityService.isPi(approver.getId())) {
            throw new TwinBusinessException(403, "无审批权限（仅管理员或组长）");
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
                if (!confirmReq) claim.setConfirmedAt(DT_FMT.format(LocalDateTime.now()));
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

    // ═══════════════════════════════════════════
    // 管理端手动分配
    // ═══════════════════════════════════════════

    @Transactional
    public CageClaim assign(User admin, Long animalCageId, Long shelfIndexId,
                             String studentUserId, Long aupId) {
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

        CageClaim claim = new CageClaim();
        claim.setAnimalCageId(animalCageId);
        claim.setClaimStatus("locked");
        claim.setClaimantId(studentUserId);
        claim.setClaimantName(displayNameOf(student));
        claim.setClaimantDept(detail.getDepartmentName());
        claim.setAupId(aupId);
        claim.setAssignerId(admin.getId());
        claim.setAssignerName(displayNameOf(admin));
        claim.setConfirmRequired(getConfirmRequired());
        claim.setRetryCount(0);
        claim.setNote("管理员手动分配");
        claimMapper.insert(claim);
        cageClaimInfoService.seedFromDetail(claim);

        log.info("[cage-apply] assign admin={} animalCageId={} → student={}", admin.getId(), animalCageId, studentUserId);
        return claim;
    }

    // ═══════════════════════════════════════════
    // 查询
    // ═══════════════════════════════════════════

    public CageClaim getById(Long id) { return claimMapper.selectById(id); }

    public List<CageClaim> getMyClaims(String studentId, String status) {
        return claimMapper.selectByClaimantId(studentId, status);
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

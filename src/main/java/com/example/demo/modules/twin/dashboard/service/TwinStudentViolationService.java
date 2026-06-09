package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.twin.dashboard.dto.DashboardViolationBoardItemDTO;
import com.example.demo.modules.twin.dashboard.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class TwinStudentViolationService {
    private static final Logger log = LoggerFactory.getLogger(TwinStudentViolationService.class);
    private static final String STATUS_ACTIVE = "ACTIVE";

    private final TwinStudentViolationMapper violationMapper;
    private final ObjectMapper objectMapper;
    private final UserDisplayNameService userDisplayNameService;

    /** 检测到表不存在后短路，避免每次扫码/列表都打库抛错（执行 DDL 后需重启应用或等后续扩展热恢复） */
    private final AtomicBoolean violationTableAbsent = new AtomicBoolean(false);

    public TwinStudentViolationService(TwinStudentViolationMapper violationMapper,
                                       ObjectMapper objectMapper,
                                       UserDisplayNameService userDisplayNameService) {
        this.violationMapper = violationMapper;
        this.objectMapper = objectMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    private static boolean isTwinStudentViolationTableMissing(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            String m = t.getMessage();
            if (m != null && m.contains("twin_student_violation") && m.contains("doesn't exist")) {
                return true;
            }
        }
        return false;
    }

    private void markTableAbsentOnce() {
        if (violationTableAbsent.compareAndSet(false, true)) {
            log.warn(
                    "[student-violation] 库表 twin_student_violation 不存在，已跳过违规相关读写。"
                            + " 请确认 app.schema.auto-ensure-embedded-core-ddl=true（默认）且数据源有建表权限，或手工执行 scripts/student_violation.ddl.sql。"
            );
        }
    }

    /** 启动阶段执行 embedded DDL 成功后调用，恢复此前因缺表而短路的读写 */
    public void markSchemaReady() {
        violationTableAbsent.set(false);
    }
    /** 将到期记录标记为 EXPIRED，避免误判为仍生效 */
    public void touchExpireStale() {
        if (violationTableAbsent.get()) {
            return;
        }
        try {
            int n = violationMapper.expireActivePastDue();
            if (n > 0) {
                log.info("[student-violation] 自动过期 {} 条违规记录", n);
            }
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return;
            }
            log.warn("[student-violation] 过期扫描失败: {}", e.getMessage());
        }
    }

    public TwinStudentViolation findActiveRow(String targetUserId) {
        if (!StringUtils.hasText(targetUserId)) {
            return null;
        }
        if (violationTableAbsent.get()) {
            return null;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return null;
        }
        try {
            return violationMapper.selectActiveByTargetUserId(targetUserId.trim());
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return null;
            }
            log.warn("[student-violation] 查询失败 userId={} err={}", targetUserId, e.getMessage());
            return null;
        }
    }

    public ScanStudentViolationNoticeDTO buildNotice(String targetUserId) {
        TwinStudentViolation row = findActiveRow(targetUserId);
        if (row == null) {
            return null;
        }
        ScanStudentViolationNoticeDTO dto = new ScanStudentViolationNoticeDTO();
        dto.setId(row.getId());
        dto.setViolationText(row.getViolationText());
        dto.setImageUrls(parseImageUrls(row.getImageUrls()));
        dto.setShowNoticeEveryScan(row.getShowNoticeEveryScan() != null && row.getShowNoticeEveryScan() == 1);
        boolean locked = computeEnterLocked(row);
        dto.setEnterLocked(locked);
        dto.setRemainingEnterAllowance(computeRemaining(row));
        dto.setInteractiveChallenge(row.getInteractiveChallenge());
        dto.setInteractiveChallengeVerified(row.getInteractiveChallengeVerifiedAt() != null);
        dto.setExpireAt(row.getExpireAt());
        dto.setPastExpireAwaitingInteractive(isPastExpireAwaitingInteractive(row));
        return dto;
    }

    public boolean isEnterBlocked(String targetUserId) {
        TwinStudentViolation row = findActiveRow(targetUserId);
        return row != null && computeEnterLocked(row);
    }

    /**
     * 扫码端完成交互拼图：写入验证时间；若 interactive_unlock_on_verify=1 则同步解除禁入（幂等）。
     */
    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation acknowledgeInteractiveChallenge(long violationId, String targetUserId) {
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建");
        }
        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("缺少 userId");
        }
        TwinStudentViolation row = getById(violationId);
        if (row == null || !STATUS_ACTIVE.equals(row.getStatus())) {
            throw new IllegalArgumentException("违规记录不存在或已失效");
        }
        if (!targetUserId.trim().equals(row.getTargetUserId())) {
            throw new IllegalArgumentException("无权确认该违规");
        }
        if (!StringUtils.hasText(row.getInteractiveChallenge())) {
            throw new IllegalArgumentException("该违规无需交互确认");
        }
        if (row.getInteractiveChallengeVerifiedAt() != null) {
            return finalizeAfterInteractiveAck(row);
        }
        try {
            int unlockFlag = isInteractiveUnlockOnVerify(row) ? 1 : 0;
            int n = violationMapper.acknowledgeInteractiveById(violationId, unlockFlag);
            if (n <= 0) {
                TwinStudentViolation latest = getById(violationId);
                if (latest != null && latest.getInteractiveChallengeVerifiedAt() != null) {
                    return finalizeAfterInteractiveAck(latest);
                }
                throw new IllegalStateException("交互确认失败，请重试");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                throw new IllegalStateException("库表 twin_student_violation 未创建");
            }
            throw new RuntimeException(e);
        }
        return finalizeAfterInteractiveAck(getById(violationId));
    }

    /**
     * 交互验证完成后：若已超过违规期限则立即 EXPIRED；期限内已完成则待 expire_at 由定时扫描结束。
     */
    private TwinStudentViolation finalizeAfterInteractiveAck(TwinStudentViolation row) {
        if (row == null || row.getId() == null) {
            return row;
        }
        if (!STATUS_ACTIVE.equals(row.getStatus())) {
            return row;
        }
        if (row.getExpireAt() != null && row.getExpireAt().isBefore(LocalDateTime.now())) {
            try {
                violationMapper.expireByIdIfPastDue(row.getId());
            } catch (Exception e) {
                if (isTwinStudentViolationTableMissing(e)) {
                    markTableAbsentOnce();
                } else {
                    log.warn("[student-violation] 交互确认后过期失败 id={} err={}", row.getId(), e.getMessage());
                }
            }
            TwinStudentViolation latest = getById(row.getId());
            return latest != null ? latest : row;
        }
        return row;
    }

    private static boolean isPastExpireAwaitingInteractive(TwinStudentViolation row) {
        if (row == null || row.getExpireAt() == null) {
            return false;
        }
        if (!row.getExpireAt().isBefore(LocalDateTime.now())) {
            return false;
        }
        return StringUtils.hasText(row.getInteractiveChallenge())
                && row.getInteractiveChallengeVerifiedAt() == null;
    }

    public void recordSuccessfulEnter(String targetUserId) {
        TwinStudentViolation row = findActiveRow(targetUserId);
        if (row == null || row.getId() == null) {
            return;
        }
        if (row.getMaxEnterSuccess() == null) {
            return;
        }
        try {
            violationMapper.incrementEnterSuccess(row.getId());
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return;
            }
            log.warn("[student-violation] increment enter 失败 id={} err={}", row.getId(), e.getMessage());
        }
    }

    /**
     * 主页大屏「违规惩戒公示」：ACTIVE + 未过期，每人最新一条；
     * summary 折叠换行并按字符数截断，coverImageUrl 取附图第一张（无则 null）。
     */
    public List<DashboardViolationBoardItemDTO> listDashboardBoard(int limit, int summaryMaxLen) {
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        int lim = Math.min(Math.max(limit, 1), 500);
        int maxLen = Math.min(Math.max(summaryMaxLen, 10), 200);
        List<TwinStudentViolation> rows;
        try {
            rows = violationMapper.selectActiveForDashboardBoard(lim);
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return Collections.emptyList();
            }
            log.warn("[student-violation] 大屏公示查询失败: {}", e.getMessage());
            return Collections.emptyList();
        }
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        List<DashboardViolationBoardItemDTO> out = new ArrayList<>(rows.size());
        for (TwinStudentViolation row : rows) {
            DashboardViolationBoardItemDTO dto = new DashboardViolationBoardItemDTO();
            dto.setId(row.getId());
            String name = userDisplayNameService.resolveDisplayName(row.getTargetUserId());
            dto.setDisplayName(StringUtils.hasText(name) ? name : row.getTargetUserId());
            dto.setSummary(buildSummary(row.getViolationText(), maxLen));
            List<String> imgs = parseImageUrls(row.getImageUrls());
            dto.setCoverImageUrl(imgs.isEmpty() ? null : imgs.get(0));
            dto.setCreatedAt(row.getCreatedAt());
            out.add(dto);
        }
        return out;
    }

    private static String buildSummary(String rawText, int maxLen) {
        if (!StringUtils.hasText(rawText)) {
            return "";
        }
        // 折叠换行/制表符为单空格，避免大屏单行高度被破坏
        String folded = rawText.replaceAll("[\\r\\n\\t]+", " ").replaceAll(" {2,}", " ").trim();
        if (folded.length() <= maxLen) {
            return folded;
        }
        return folded.substring(0, maxLen) + "…";
    }

    public List<TwinStudentViolation> listRecent(String targetUserId, int limit) {
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        int lim = Math.min(Math.max(limit, 1), 500);
        try {
            return violationMapper.selectRecent(
                    StringUtils.hasText(targetUserId) ? targetUserId.trim() : null,
                    lim
            );
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return Collections.emptyList();
            }
            throw e;
        }
    }

    /** 检查用户是否已有 ACTIVE 的自动滞留违规（用于去重，避免定时任务每次节拍重复创建） */
    public boolean hasActiveAutoViolation(String targetUserId) {
        if (!StringUtils.hasText(targetUserId)) {
            return false;
        }
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            return violationMapper.countActiveAutoStrandedByUserId(targetUserId.trim()) > 0;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            log.warn("[student-violation] hasActiveAutoViolation failed userId={} err={}", targetUserId, e.getMessage());
            return false;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId
    ) {
        return create(targetUserId, violationText, imageUrls, forbidEnter, maxEnterSuccess,
                showNoticeEveryScan, expireAfterDays, createdByUserId, "MANUAL", null);
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String source,
            String interactiveChallenge
    ) {
        return create(
                targetUserId,
                violationText,
                imageUrls,
                forbidEnter,
                maxEnterSuccess,
                showNoticeEveryScan,
                expireAfterDays,
                createdByUserId,
                source,
                interactiveChallenge,
                null);
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String source,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify
    ) {
        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("缺少 targetUserId");
        }
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
        }
        String tid = targetUserId.trim();
        touchExpireStale();
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
        }
        try {
            violationMapper.supersedeActiveByTargetUserId(tid);
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
            }
            throw e;
        }

        TwinStudentViolation row = new TwinStudentViolation();
        row.setTargetUserId(tid);
        row.setViolationText(violationText);
        row.setImageUrls(serializeImageUrls(imageUrls));
        row.setInteractiveChallenge(normalizeInteractiveChallenge(interactiveChallenge));
        row.setInteractiveUnlockOnVerify(resolveInteractiveUnlockOnVerify(row.getInteractiveChallenge(), interactiveUnlockOnVerify));
        row.setForbidEnter(normalizeForbidEnter(forbidEnter, row.getInteractiveChallenge()) ? 1 : 0);
        row.setMaxEnterSuccess(maxEnterSuccess);
        row.setEnterSuccessCount(0);
        row.setShowNoticeEveryScan(showNoticeEveryScan ? 1 : 0);
        if (expireAfterDays != null && expireAfterDays > 0) {
            row.setExpireAt(LocalDateTime.now().plusDays(expireAfterDays));
        } else {
            row.setExpireAt(null);
        }
        row.setStatus(STATUS_ACTIVE);
        row.setCreatedByUserId(createdByUserId);
        row.setSource(source != null && !source.isBlank() ? source.trim() : "MANUAL");
        try {
            violationMapper.insert(row);
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
            }
            throw e;
        }
        return row;
    }

    /**
     * 批量新建违规：每人独立一条 ACTIVE（已有 ACTIVE 会先 SUPERSEDED）。
     *
     * @return createdCount、failed（userId + message）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(
            List<String> targetUserIds,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId
    ) {
        return createBatch(
                targetUserIds,
                violationText,
                imageUrls,
                forbidEnter,
                maxEnterSuccess,
                showNoticeEveryScan,
                expireAfterDays,
                createdByUserId,
                null,
                null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(
            List<String> targetUserIds,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String interactiveChallenge
    ) {
        return createBatch(
                targetUserIds,
                violationText,
                imageUrls,
                forbidEnter,
                maxEnterSuccess,
                showNoticeEveryScan,
                expireAfterDays,
                createdByUserId,
                interactiveChallenge,
                null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(
            List<String> targetUserIds,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify
    ) {
        if (targetUserIds == null || targetUserIds.isEmpty()) {
            throw new IllegalArgumentException("缺少 targetUserIds");
        }
        Set<String> unique = new LinkedHashSet<>();
        for (String id : targetUserIds) {
            if (StringUtils.hasText(id)) {
                unique.add(id.trim());
            }
        }
        if (unique.isEmpty()) {
            throw new IllegalArgumentException("缺少有效的 targetUserId");
        }
        if (unique.size() > 200) {
            throw new IllegalArgumentException("单次批量最多 200 人");
        }
        List<Map<String, String>> failed = new ArrayList<>();
        int created = 0;
        for (String tid : unique) {
            try {
                create(
                        tid,
                        violationText,
                        imageUrls,
                        forbidEnter,
                        maxEnterSuccess,
                        showNoticeEveryScan,
                        expireAfterDays,
                        createdByUserId,
                        "MANUAL",
                        interactiveChallenge,
                        interactiveUnlockOnVerify
                );
                created++;
            } catch (Exception e) {
                Map<String, String> f = new HashMap<>();
                f.put("userId", tid);
                String msg = e.getMessage();
                f.put("message", msg != null && !msg.isBlank() ? msg : "创建失败");
                failed.add(f);
            }
        }
        Map<String, Object> out = new HashMap<>();
        out.put("createdCount", created);
        out.put("failed", failed);
        return out;
    }

    public boolean clear(long id, String clearedByUserId) {
        if (violationTableAbsent.get()) {
            return false;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            return violationMapper.updateClearById(id, clearedByUserId) > 0;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            throw e;
        }
    }

    /**
     * 标记「已处理」：记录仍保留，但不再是 ACTIVE，扫码弹窗不再展示该条。
     */
    public boolean markProcessed(long id, String operatorUserId) {
        if (violationTableAbsent.get()) {
            return false;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            return violationMapper.markProcessedById(id, operatorUserId != null ? operatorUserId : "ADMIN") > 0;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            throw e;
        }
    }

    public TwinStudentViolation getById(long id) {
        if (violationTableAbsent.get()) {
            return null;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return null;
        }
        try {
            return violationMapper.selectById(id);
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return null;
            }
            throw new RuntimeException(e);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation update(
            long id,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            String expireMode,
            Integer expireAfterDays,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify
    ) {
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
        }
        TwinStudentViolation existing = getById(id);
        if (existing == null) {
            throw new IllegalArgumentException("记录不存在: " + id);
        }
        if (maxEnterSuccess != null && maxEnterSuccess < 0) {
            throw new IllegalArgumentException("进入次数上限不能为负数");
        }
        TwinStudentViolation row = new TwinStudentViolation();
        row.setId(id);
        row.setViolationText(violationText != null ? violationText : "");
        row.setImageUrls(serializeImageUrls(imageUrls));
        String newChallenge = normalizeInteractiveChallenge(interactiveChallenge);
        String oldChallenge = normalizeInteractiveChallenge(existing.getInteractiveChallenge());
        boolean challengeChanged = !Objects.equals(newChallenge, oldChallenge);
        row.setInteractiveChallenge(newChallenge);
        row.setInteractiveUnlockOnVerify(resolveInteractiveUnlockOnVerify(newChallenge, interactiveUnlockOnVerify));
        if (challengeChanged) {
            row.setInteractiveChallengeVerifiedAt(null);
            row.setForbidEnter(normalizeForbidEnter(forbidEnter, newChallenge) ? 1 : 0);
        } else if (existing.getInteractiveChallengeVerifiedAt() != null) {
            row.setInteractiveChallengeVerifiedAt(existing.getInteractiveChallengeVerifiedAt());
            row.setForbidEnter(existing.getForbidEnter());
        } else {
            row.setForbidEnter(normalizeForbidEnter(forbidEnter, newChallenge) ? 1 : 0);
        }
        row.setMaxEnterSuccess(maxEnterSuccess);
        row.setShowNoticeEveryScan(showNoticeEveryScan ? 1 : 0);
        String mode = expireMode != null ? expireMode.trim().toUpperCase() : "KEEP";
        if ("CLEAR".equals(mode)) {
            row.setExpireAt(null);
        } else if ("RELATIVE".equals(mode) && expireAfterDays != null && expireAfterDays > 0) {
            row.setExpireAt(LocalDateTime.now().plusDays(expireAfterDays));
        } else {
            row.setExpireAt(existing.getExpireAt());
        }
        try {
            int n = violationMapper.updateEditableById(row);
            if (n <= 0) {
                throw new IllegalStateException("更新失败，记录可能已被删除");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
            }
            throw new RuntimeException(e);
        }
        return getById(id);
    }

    public boolean delete(long id) {
        if (violationTableAbsent.get()) {
            return false;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            return violationMapper.deleteById(id) > 0;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            throw new RuntimeException(e);
        }
    }

    private List<String> parseImageUrls(String json) {
        if (!StringUtils.hasText(json)) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private String serializeImageUrls(List<String> urls) {
        if (urls == null || urls.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(urls);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static boolean computeEnterLocked(TwinStudentViolation row) {
        if (row == null || !STATUS_ACTIVE.equals(row.getStatus())) {
            return false;
        }
        Integer max = row.getMaxEnterSuccess();
        int used = row.getEnterSuccessCount() == null ? 0 : row.getEnterSuccessCount();
        if (max != null && used >= max) {
            return true;
        }
        if (StringUtils.hasText(row.getInteractiveChallenge())
                && row.getInteractiveChallengeVerifiedAt() == null) {
            return true;
        }
        if (row.getForbidEnter() != null && row.getForbidEnter() == 1) {
            return true;
        }
        return false;
    }

    private static String normalizeInteractiveChallenge(String interactiveChallenge) {
        if (!StringUtils.hasText(interactiveChallenge)) {
            return null;
        }
        String trimmed = interactiveChallenge.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** 配置交互式确认时，与手动新建/编辑弹窗一致：强制禁止进入直至完成拼图 */
    private static boolean normalizeForbidEnter(boolean forbidEnter, String interactiveChallenge) {
        if (StringUtils.hasText(interactiveChallenge)) {
            return true;
        }
        return forbidEnter;
    }

    private static int resolveInteractiveUnlockOnVerify(String interactiveChallenge, Boolean unlockOnVerify) {
        if (!StringUtils.hasText(interactiveChallenge)) {
            return 0;
        }
        return Boolean.FALSE.equals(unlockOnVerify) ? 0 : 1;
    }

    private static boolean isInteractiveUnlockOnVerify(TwinStudentViolation row) {
        if (row == null || !StringUtils.hasText(row.getInteractiveChallenge())) {
            return false;
        }
        return row.getInteractiveUnlockOnVerify() == null || row.getInteractiveUnlockOnVerify() == 1;
    }

    private static Integer computeRemaining(TwinStudentViolation row) {
        Integer max = row.getMaxEnterSuccess();
        if (max == null) {
            return null;
        }
        int used = row.getEnterSuccessCount() == null ? 0 : row.getEnterSuccessCount();
        return Math.max(0, max - used);
    }
}

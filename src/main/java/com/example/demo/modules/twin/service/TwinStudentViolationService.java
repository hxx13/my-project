package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.entity.TwinStudentViolation;
import com.example.demo.modules.twin.mapper.TwinStudentViolationMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class TwinStudentViolationService {
    private static final Logger log = LoggerFactory.getLogger(TwinStudentViolationService.class);
    private static final String STATUS_ACTIVE = "ACTIVE";

    private final TwinStudentViolationMapper violationMapper;
    private final ObjectMapper objectMapper;

    /** 检测到表不存在后短路，避免每次扫码/列表都打库抛错（执行 DDL 后需重启应用或等后续扩展热恢复） */
    private final AtomicBoolean violationTableAbsent = new AtomicBoolean(false);

    public TwinStudentViolationService(TwinStudentViolationMapper violationMapper, ObjectMapper objectMapper) {
        this.violationMapper = violationMapper;
        this.objectMapper = objectMapper;
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
        return dto;
    }

    public boolean isEnterBlocked(String targetUserId) {
        TwinStudentViolation row = findActiveRow(targetUserId);
        return row != null && computeEnterLocked(row);
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
        row.setForbidEnter(forbidEnter ? 1 : 0);
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
            Integer expireAfterDays
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
        row.setForbidEnter(forbidEnter ? 1 : 0);
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
        if (row.getForbidEnter() != null && row.getForbidEnter() == 1) {
            return true;
        }
        Integer max = row.getMaxEnterSuccess();
        int used = row.getEnterSuccessCount() == null ? 0 : row.getEnterSuccessCount();
        if (max != null && used >= max) {
            return true;
        }
        return false;
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

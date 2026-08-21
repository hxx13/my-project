package com.example.demo.modules.twin.obligation.service;

import com.example.demo.modules.twin.dashboard.entity.TwinScanPopupAnnouncement;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.obligation.disposition.DispositionStrategyRegistry;
import com.example.demo.modules.twin.obligation.entity.TwinObligation;
import com.example.demo.modules.twin.obligation.entity.TwinObligationReceipt;
import com.example.demo.modules.twin.obligation.mapper.TwinObligationMapper;
import com.example.demo.modules.twin.obligation.mapper.TwinObligationReceiptMapper;
import com.example.demo.modules.twin.obligation.support.ObligationSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

/**
 * 期 2 Obligation 核心服务：违规接入 + 公告/未绑卡懒同步 + 存量回填 + 查询。
 * 失败不阻断主业务（吞异常并打日志）。
 */
@Service
public class ObligationService {

    private static final Logger log = LoggerFactory.getLogger(ObligationService.class);
    private static final int DEFAULT_LIST_LIMIT = 100;
    private static final int BACKFILL_BATCH = 500;

    private final TwinObligationMapper obligationMapper;
    private final TwinObligationReceiptMapper receiptMapper;
    private final DispositionStrategyRegistry dispositionRegistry;

    public ObligationService(TwinObligationMapper obligationMapper,
                             TwinObligationReceiptMapper receiptMapper,
                             @Autowired(required = false) DispositionStrategyRegistry dispositionRegistry) {
        this.obligationMapper = obligationMapper;
        this.receiptMapper = receiptMapper;
        this.dispositionRegistry = dispositionRegistry;
    }

    /** 违规创建后：写入/刷新待办为待处置。 */
    public void syncFromViolationCreated(TwinStudentViolation row) {
        if (row == null || row.getId() == null || !StringUtils.hasText(row.getTargetUserId())) {
            return;
        }
        try {
            String sourceId = ObligationSupport.sourceIdForViolation(row.getId());
            TwinObligation existing = obligationMapper.selectBySource(
                    ObligationSupport.SOURCE_STUDENT_VIOLATION, sourceId);
            if (existing == null) {
                TwinObligation ob = new TwinObligation();
                ob.setSubjectUserId(row.getTargetUserId().trim());
                ob.setSourceType(ObligationSupport.SOURCE_STUDENT_VIOLATION);
                ob.setSourceId(sourceId);
                applyViolationContent(ob, row);
                ob.setStatus(ObligationSupport.STATUS_PENDING_DISPOSITION);
                obligationMapper.insert(ob);
            } else if (!ObligationSupport.isTerminal(existing.getStatus())) {
                applyViolationContent(existing, row);
                obligationMapper.updateContentAndDue(existing);
                obligationMapper.updateStatus(existing.getId(), ObligationSupport.STATUS_PENDING_DISPOSITION);
            }
        } catch (Exception e) {
            log.warn("[obligation] syncFromViolationCreated failed id={}: {}", row.getId(), e.getMessage());
        }
    }

    /**
     * 扫码端懒同步：操作员看到某条生效公告时，为其挂一条 SHOW_ONLY 待办（人×公告）。
     */
    public void syncAnnouncementForSubject(TwinScanPopupAnnouncement row, String subjectUserId) {
        if (row == null || row.getId() == null || !StringUtils.hasText(subjectUserId)) {
            return;
        }
        try {
            // 公告 source_id 用人维度后缀，因同一公告对多人各自进度
            String compositeSourceId = ObligationSupport.sourceIdForAnnouncement(row.getId())
                    + ":" + subjectUserId.trim();
            TwinObligation existing = obligationMapper.selectBySource(
                    ObligationSupport.SOURCE_ANNOUNCEMENT, compositeSourceId);
            if (existing == null) {
                TwinObligation ob = new TwinObligation();
                ob.setSubjectUserId(subjectUserId.trim());
                ob.setSourceType(ObligationSupport.SOURCE_ANNOUNCEMENT);
                ob.setSourceId(compositeSourceId);
                ob.setTitle(StringUtils.hasText(row.getTitle()) ? row.getTitle().trim() : "扫码公告");
                ob.setContentHtml(row.getContentHtml());
                ob.setContentJson(row.getContentJson());
                ob.setDispositionType(ObligationSupport.DISPOSITION_SHOW_ONLY);
                ob.setStatus(ObligationSupport.STATUS_PENDING_DISPOSITION);
                ob.setDueAt(row.getExpireAt());
                obligationMapper.insert(ob);
            } else if (!ObligationSupport.isTerminal(existing.getStatus())) {
                existing.setTitle(StringUtils.hasText(row.getTitle()) ? row.getTitle().trim() : "扫码公告");
                existing.setContentHtml(row.getContentHtml());
                existing.setContentJson(row.getContentJson());
                existing.setDispositionType(ObligationSupport.DISPOSITION_SHOW_ONLY);
                existing.setDueAt(row.getExpireAt());
                obligationMapper.updateContentAndDue(existing);
            }
        } catch (Exception e) {
            log.warn("[obligation] syncAnnouncementForSubject failed annId={} user={}: {}",
                    row.getId(), subjectUserId, e.getMessage());
        }
    }

    /** 未绑卡提示懒同步：人为主体，全局配置为来源。 */
    public void syncUnboundForSubject(String subjectUserId, String contentHtml, boolean forbidEnter) {
        if (!StringUtils.hasText(subjectUserId)) {
            return;
        }
        try {
            String sourceId = ObligationSupport.UNBOUND_SOURCE_ID + ":" + subjectUserId.trim();
            TwinObligation existing = obligationMapper.selectBySource(
                    ObligationSupport.SOURCE_UNBOUND, sourceId);
            if (existing == null) {
                TwinObligation ob = new TwinObligation();
                ob.setSubjectUserId(subjectUserId.trim());
                ob.setSourceType(ObligationSupport.SOURCE_UNBOUND);
                ob.setSourceId(sourceId);
                ob.setTitle(forbidEnter ? "未绑卡禁入提示" : "未绑卡提示");
                ob.setContentHtml(contentHtml);
                ob.setDispositionType(ObligationSupport.DISPOSITION_ACK_READ);
                ob.setStatus(ObligationSupport.STATUS_PENDING_DISPOSITION);
                obligationMapper.insert(ob);
            } else if (!ObligationSupport.isTerminal(existing.getStatus())) {
                existing.setTitle(forbidEnter ? "未绑卡禁入提示" : "未绑卡提示");
                existing.setContentHtml(contentHtml);
                existing.setDispositionType(ObligationSupport.DISPOSITION_ACK_READ);
                obligationMapper.updateContentAndDue(existing);
            }
        } catch (Exception e) {
            log.warn("[obligation] syncUnboundForSubject failed user={}: {}", subjectUserId, e.getMessage());
        }
    }

    /**
     * 违规交互确认通过：经策略注册表走 {@link #completeWithStrategy}（期 3 统一入口）。
     * 调用方若已完成短语校验，答案仍会再过一遍策略校验器（幂等安全）。
     */
    public void completeViolationDisposition(long violationId, String subjectUserId, String channel, String answer) {
        if (violationId <= 0 || !StringUtils.hasText(subjectUserId)) {
            return;
        }
        try {
            TwinObligation ob = obligationMapper.selectBySource(
                    ObligationSupport.SOURCE_STUDENT_VIOLATION,
                    ObligationSupport.sourceIdForViolation(violationId));
            if (ob == null || ob.getId() == null) {
                return;
            }
            boolean ok = completeWithStrategy(ob.getId(), subjectUserId.trim(), channel, answer);
            if (!ok && ObligationSupport.DISPOSITION_ACK_PUZZLE.equals(ob.getDispositionType())) {
                // 兼容：违规主路径已验过短语，策略配置缺失时仍落回执
                writeReceiptAndComplete(ob, subjectUserId.trim(), channel, answer);
            }
        } catch (Exception e) {
            log.warn("[obligation] completeViolationDisposition failed violationId={}: {}",
                    violationId, e.getMessage());
        }
    }

    /**
     * 覆盖处置策略（开单时管理端选择 QUIZ 等非短语策略）。
     */
    public void applyDispositionOverride(long violationId, String dispositionType, String configJson) {
        if (violationId <= 0 || !StringUtils.hasText(dispositionType)) {
            return;
        }
        try {
            TwinObligation ob = obligationMapper.selectBySource(
                    ObligationSupport.SOURCE_STUDENT_VIOLATION,
                    ObligationSupport.sourceIdForViolation(violationId));
            if (ob == null || ob.getId() == null || ObligationSupport.isTerminal(ob.getStatus())) {
                return;
            }
            ob.setDispositionType(dispositionType.trim().toUpperCase());
            ob.setDispositionConfigJson(configJson);
            if (ObligationSupport.DISPOSITION_QUIZ.equals(ob.getDispositionType())) {
                ob.setTitle("违规答题确认");
            } else if (ObligationSupport.DISPOSITION_ACK_READ.equals(ob.getDispositionType())) {
                ob.setTitle("违规确认阅读");
            } else if (ObligationSupport.DISPOSITION_SIGNATURE.equals(ob.getDispositionType())) {
                ob.setTitle("违规签名确认");
            }
            obligationMapper.updateContentAndDue(ob);
        } catch (Exception e) {
            log.warn("[obligation] applyDispositionOverride failed id={}: {}", violationId, e.getMessage());
        }
    }

    /** 标记已投递（投递 ≠ 送达 ≠ 处置）。 */
    public boolean markDelivered(long obligationId, String subjectUserId) {
        if (obligationId <= 0 || !StringUtils.hasText(subjectUserId)) {
            return false;
        }
        try {
            TwinObligation ob = obligationMapper.selectById(obligationId);
            if (ob == null || !subjectUserId.trim().equals(ob.getSubjectUserId())) {
                return false;
            }
            if (ObligationSupport.isTerminal(ob.getStatus())) {
                return true;
            }
            if (ObligationSupport.STATUS_PENDING_DELIVERY.equals(ob.getStatus())
                    || ObligationSupport.STATUS_DELIVERED.equals(ob.getStatus())) {
                obligationMapper.updateStatus(ob.getId(), ObligationSupport.STATUS_PENDING_DISPOSITION);
            }
            // 已是 PENDING_DISPOSITION 则视为送达确认（幂等）
            return true;
        } catch (Exception e) {
            log.warn("[obligation] markDelivered failed id={}: {}", obligationId, e.getMessage());
            return false;
        }
    }

    /**
     * 内容变更后重新确认：清回执并将状态打回待处置。
     */
    public void requireReconfirm(long obligationId) {
        if (obligationId <= 0) {
            return;
        }
        try {
            TwinObligation ob = obligationMapper.selectById(obligationId);
            if (ob == null || ob.getId() == null) {
                return;
            }
            receiptMapper.deleteByObligationId(ob.getId());
            obligationMapper.updateStatus(ob.getId(), ObligationSupport.STATUS_PENDING_DISPOSITION);
        } catch (Exception e) {
            log.warn("[obligation] requireReconfirm failed id={}: {}", obligationId, e.getMessage());
        }
    }

    /** 过期兜底：due_at 已过且仍非终态 → EXPIRED。返回处理条数。 */
    public int expireOverdue(Integer limit) {
        try {
            int lim = limit == null || limit <= 0 ? BACKFILL_BATCH : Math.min(limit, 2000);
            return obligationMapper.expireOverdue(lim);
        } catch (Exception e) {
            log.warn("[obligation] expireOverdue failed: {}", e.getMessage());
            return 0;
        }
    }

    private void writeReceiptAndComplete(TwinObligation ob, String subjectUserId, String channel, String answer) {
        TwinObligationReceipt existing = receiptMapper.selectByObligationAndSubject(ob.getId(), subjectUserId);
        if (existing == null) {
            TwinObligationReceipt receipt = new TwinObligationReceipt();
            receipt.setObligationId(ob.getId());
            receipt.setSubjectUserId(subjectUserId);
            receipt.setChannel(StringUtils.hasText(channel) ? channel : ObligationSupport.CHANNEL_SCAN);
            receipt.setAttemptNo(1);
            receipt.setAnswerPayload("{\"answer\":" + jsonString(answer) + "}");
            receipt.setCompletedAt(LocalDateTime.now());
            receiptMapper.insertIgnore(receipt);
        }
        if (!ObligationSupport.STATUS_COMPLETED.equals(ob.getStatus())) {
            obligationMapper.updateStatus(ob.getId(), ObligationSupport.STATUS_COMPLETED);
        }
    }

    /**
     * 通用处置完成：经策略注册表校验后写回执（期 3 入口）。
     *
     * @return true 表示通过并落库；false 表示校验失败或未找到
     */
    public boolean completeWithStrategy(long obligationId, String subjectUserId, String channel, String answer) {
        if (obligationId <= 0 || !StringUtils.hasText(subjectUserId)) {
            return false;
        }
        try {
            TwinObligation ob = obligationMapper.selectById(obligationId);
            if (ob == null || ob.getId() == null) {
                return false;
            }
            if (!subjectUserId.trim().equals(ob.getSubjectUserId())) {
                return false;
            }
            if (ObligationSupport.STATUS_COMPLETED.equals(ob.getStatus())) {
                return true;
            }
            if (dispositionRegistry != null
                    && !dispositionRegistry.verify(ob.getDispositionType(), ob.getDispositionConfigJson(), answer)) {
                return false;
            }
            TwinObligationReceipt existing = receiptMapper.selectByObligationAndSubject(
                    ob.getId(), subjectUserId.trim());
            if (existing == null) {
                TwinObligationReceipt receipt = new TwinObligationReceipt();
                receipt.setObligationId(ob.getId());
                receipt.setSubjectUserId(subjectUserId.trim());
                receipt.setChannel(StringUtils.hasText(channel) ? channel : ObligationSupport.CHANNEL_SCAN);
                receipt.setAttemptNo(1);
                receipt.setAnswerPayload("{\"answer\":" + jsonString(answer) + "}");
                receipt.setCompletedAt(LocalDateTime.now());
                receiptMapper.insertIgnore(receipt);
            }
            if (!ObligationSupport.STATUS_COMPLETED.equals(ob.getStatus())) {
                obligationMapper.updateStatus(ob.getId(), ObligationSupport.STATUS_COMPLETED);
            }
            return true;
        } catch (Exception e) {
            log.warn("[obligation] completeWithStrategy failed id={}: {}", obligationId, e.getMessage());
            return false;
        }
    }

    public void markViolationExpired(long violationId) {
        markViolationTerminal(violationId, ObligationSupport.STATUS_EXPIRED);
    }

    public void markViolationRevoked(long violationId) {
        markViolationTerminal(violationId, ObligationSupport.STATUS_REVOKED);
    }

    public TwinObligation findByViolationId(long violationId) {
        try {
            return obligationMapper.selectBySource(
                    ObligationSupport.SOURCE_STUDENT_VIOLATION,
                    ObligationSupport.sourceIdForViolation(violationId));
        } catch (Exception e) {
            return null;
        }
    }

    public TwinObligation findById(long id) {
        try {
            return obligationMapper.selectById(id);
        } catch (Exception e) {
            return null;
        }
    }

    public TwinObligationReceipt findReceipt(long obligationId, String subjectUserId) {
        if (obligationId <= 0 || !StringUtils.hasText(subjectUserId)) {
            return null;
        }
        try {
            return receiptMapper.selectByObligationAndSubject(obligationId, subjectUserId.trim());
        } catch (Exception e) {
            return null;
        }
    }

    public List<TwinObligation> listBySubject(String subjectUserId, String status, Integer limit) {
        if (!StringUtils.hasText(subjectUserId)) {
            return Collections.emptyList();
        }
        try {
            int lim = limit == null || limit <= 0 ? DEFAULT_LIST_LIMIT : Math.min(limit, 500);
            return obligationMapper.selectBySubject(subjectUserId.trim(), blankToNull(status), lim);
        } catch (Exception e) {
            log.warn("[obligation] listBySubject failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<TwinObligation> listAdmin(String subjectUserId, String sourceType, String status, Integer limit) {
        try {
            int lim = limit == null || limit <= 0 ? DEFAULT_LIST_LIMIT : Math.min(limit, 500);
            return obligationMapper.selectAdmin(
                    blankToNull(subjectUserId), blankToNull(sourceType), blankToNull(status), lim);
        } catch (Exception e) {
            log.warn("[obligation] listAdmin failed: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 存量 ACTIVE 违规回填。返回本批插入行数；可多次调用直至返回 0。
     */
    public int backfillFromActiveViolations(Integer limit) {
        try {
            int lim = limit == null || limit <= 0 ? BACKFILL_BATCH : Math.min(limit, 2000);
            return obligationMapper.backfillFromActiveViolations(lim);
        } catch (Exception e) {
            log.warn("[obligation] backfillFromActiveViolations failed: {}", e.getMessage());
            return 0;
        }
    }

    private void applyViolationContent(TwinObligation ob, TwinStudentViolation row) {
        ob.setTitle(StringUtils.hasText(row.getInteractiveChallenge()) ? "违规交互确认" : "违规提醒");
        ob.setContentHtml(row.getViolationText());
        ob.setContentJson(row.getContentJson());
        ob.setDispositionType(StringUtils.hasText(row.getInteractiveChallenge())
                ? ObligationSupport.DISPOSITION_ACK_PUZZLE
                : ObligationSupport.DISPOSITION_SHOW_ONLY);
        if (StringUtils.hasText(row.getInteractiveChallenge())) {
            ob.setDispositionConfigJson("{\"phrase\":"
                    + jsonString(row.getInteractiveChallenge().trim()) + "}");
        } else {
            ob.setDispositionConfigJson(null);
        }
        ob.setDueAt(row.getExpireAt());
    }

    private void markViolationTerminal(long violationId, String status) {
        if (violationId <= 0) {
            return;
        }
        try {
            TwinObligation ob = obligationMapper.selectBySource(
                    ObligationSupport.SOURCE_STUDENT_VIOLATION,
                    ObligationSupport.sourceIdForViolation(violationId));
            if (ob == null || ob.getId() == null) {
                return;
            }
            if (ObligationSupport.isTerminal(ob.getStatus())
                    && ObligationSupport.STATUS_COMPLETED.equals(ob.getStatus())) {
                return;
            }
            obligationMapper.updateStatus(ob.getId(), status);
        } catch (Exception e) {
            log.warn("[obligation] markViolationTerminal failed id={} status={}: {}",
                    violationId, status, e.getMessage());
        }
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private static String jsonString(String raw) {
        if (raw == null) {
            return "null";
        }
        return "\"" + raw.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}

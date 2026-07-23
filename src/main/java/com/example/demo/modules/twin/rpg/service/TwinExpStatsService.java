package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.twin.rpg.entity.TwinExpRecord;
import com.example.demo.modules.twin.rpg.mapper.TwinExpRecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class TwinExpStatsService {

    private static final Logger log = LoggerFactory.getLogger(TwinExpStatsService.class);

    @Autowired
    private TwinExpRecordMapper twinExpRecordMapper;

    /**
     * @deprecated 请使用带 feedSource 的重载；实时扫码路径请走 {@link TwinExpStatsService#recordExp} 完整参数版。
     */
    @Deprecated
    public void recordExp(String userId, String userName, int expAmount,
                          String sourceType, int accessType,
                          String roomId, String roomName) {
        recordExp(userId, userName, expAmount, sourceType, accessType, roomId, roomName, null, null);
    }

    /** 写入经验流水（带溯源信息） */
    public void recordExp(String userId, String userName, int expAmount,
                          String sourceType, int accessType,
                          String roomId, String roomName,
                          String feedSource, Integer sessionDurationMinutes) {
        TwinExpRecord record = new TwinExpRecord();
        record.setUserId(userId);
        record.setUserName(userName);
        record.setExpAmount(expAmount);
        record.setSourceType(sourceType);
        record.setAccessType(accessType);
        record.setRoomId(roomId);
        record.setRoomName(roomName);
        record.setCreateTime(LocalDateTime.now());
        record.setAnomalyFlag(0);
        record.setReviewStatus(1); // 实时记录默认已批准
        record.setFeedSource(feedSource);
        record.setSessionDurationMinutes(sessionDurationMinutes);
        twinExpRecordMapper.insert(record);

        // 实时流水写入 twin_exp_record；personnel.total_exp 由慢轨对账/补漏汇总更新
        log.info("[XP流水] 写入成功 userId={} exp={} source={} accessType={} feedSource={}",
                userId, expAmount, sourceType, accessType, feedSource);
    }

    public Map<String, Object> getSummary() {
        Map<String, Object> summary = new HashMap<>();
        summary.put("totalExp", twinExpRecordMapper.countTotalExp());
        summary.put("todayExp", twinExpRecordMapper.countTodayExp());
        summary.put("activeUsers", twinExpRecordMapper.countActiveUsers());
        summary.put("todayActiveUsers", twinExpRecordMapper.countTodayActiveUsers());
        summary.put("topEarners", twinExpRecordMapper.getTopEarners(50));
        summary.put("anomalyCount", twinExpRecordMapper.countAnomaliesByType(
                LocalDate.now().minusDays(30).toString() + " 00:00:00",
                LocalDate.now().toString() + " 23:59:59"));
        summary.put("pendingReviewCount", twinExpRecordMapper.countPendingReview());
        return summary;
    }

    public Map<String, Object> getRecordsPage(int pageNum, int pageSize,
                                               String userId, String sourceType,
                                               String startDate, String endDate) {
        return getRecordsPageWithFilters(pageNum, pageSize, userId, sourceType,
                startDate, endDate, null, null, null);
    }

    /** 带异常/审核/来源筛选的分页查询 */
    public Map<String, Object> getRecordsPageWithFilters(int pageNum, int pageSize,
                                                          String userId, String sourceType,
                                                          String startDate, String endDate,
                                                          Integer anomalyFlag, Integer reviewStatus,
                                                          String feedSource) {
        int offset = (pageNum - 1) * pageSize;
        List<TwinExpRecord> list = twinExpRecordMapper.selectPageWithFilters(
                offset, pageSize, userId, sourceType, startDate, endDate,
                anomalyFlag, reviewStatus, feedSource);
        long total = twinExpRecordMapper.countPageWithFilters(
                userId, sourceType, startDate, endDate,
                anomalyFlag, reviewStatus, feedSource);

        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("total", total);
        result.put("pageNum", pageNum);
        result.put("pageSize", pageSize);
        return result;
    }

    // ── 审核操作 ──

    public void approveRecord(Long id, String reviewedBy, String note) {
        twinExpRecordMapper.updateReviewStatus(id, 1, reviewedBy, note);
        log.info("[XP审核] 批准 id={} by={}", id, reviewedBy);
    }

    public void rejectRecord(Long id, String reviewedBy, String note) {
        twinExpRecordMapper.updateReviewStatus(id, 2, reviewedBy, note);
        log.info("[XP审核] 驳回 id={} by={}", id, reviewedBy);
    }

    public void batchUpdateReview(List<Long> ids, int reviewStatus, String reviewedBy) {
        twinExpRecordMapper.batchUpdateReviewStatus(ids, reviewStatus, reviewedBy);
        log.info("[XP审核] 批量更新 count={} status={} by={}", ids.size(), reviewStatus, reviewedBy);
    }
}

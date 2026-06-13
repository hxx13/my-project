package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.twin.rpg.entity.TwinExpRecord;
import com.example.demo.modules.twin.rpg.mapper.TwinExpRecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class TwinExpStatsService {

    private static final Logger log = LoggerFactory.getLogger(TwinExpStatsService.class);

    @Autowired
    private TwinExpRecordMapper twinExpRecordMapper;

    public void recordExp(String userId, String userName, int expAmount,
                          String sourceType, int accessType,
                          String roomId, String roomName) {
        TwinExpRecord record = new TwinExpRecord();
        record.setUserId(userId);
        record.setUserName(userName);
        record.setExpAmount(expAmount);
        record.setSourceType(sourceType);
        record.setAccessType(accessType);
        record.setRoomId(roomId);
        record.setRoomName(roomName);
        record.setCreateTime(LocalDateTime.now());
        twinExpRecordMapper.insert(record);
        log.info("[XP流水] 写入成功 userId={} exp={} source={} accessType={}", userId, expAmount, sourceType, accessType);
    }

    public Map<String, Object> getSummary() {
        Map<String, Object> summary = new HashMap<>();
        summary.put("totalExp", twinExpRecordMapper.countTotalExp());
        summary.put("todayExp", twinExpRecordMapper.countTodayExp());
        summary.put("activeUsers", twinExpRecordMapper.countActiveUsers());
        summary.put("todayActiveUsers", twinExpRecordMapper.countTodayActiveUsers());
        summary.put("topEarners", twinExpRecordMapper.getTopEarners(50));
        return summary;
    }

    public Map<String, Object> getRecordsPage(int pageNum, int pageSize,
                                               String userId, String sourceType,
                                               String startDate, String endDate) {
        int offset = (pageNum - 1) * pageSize;
        List<TwinExpRecord> list = twinExpRecordMapper.selectPage(offset, pageSize, userId, sourceType, startDate, endDate);
        long total = twinExpRecordMapper.countPage(userId, sourceType, startDate, endDate);

        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("total", total);
        result.put("pageNum", pageNum);
        result.put("pageSize", pageSize);
        return result;
    }
}

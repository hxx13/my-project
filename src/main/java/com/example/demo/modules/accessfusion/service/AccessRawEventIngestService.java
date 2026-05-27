package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.accessfusion.mapper.AccessRawEventMapper;
import com.example.demo.modules.twin.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.support.DahuaSwingDepartmentSupport;
import com.example.demo.modules.twin.support.DahuaSwingEnterExitSupport;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class AccessRawEventIngestService {

    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AccessRawEventMapper rawEventMapper;
    private final DahuaSwingMapper dahuaSwingMapper;

    public AccessRawEventIngestService(AccessRawEventMapper rawEventMapper, DahuaSwingMapper dahuaSwingMapper) {
        this.rawEventMapper = rawEventMapper;
        this.dahuaSwingMapper = dahuaSwingMapper;
    }

    @Transactional(rollbackFor = Exception.class)
    public void ingestFromSwing(DahuaSwingRecord r, String source) {
        if (r == null || r.getRecordId() == null || r.getRecordId().isBlank()) {
            return;
        }
        AccessRawEvent row = toRaw(r, source);
        if (row.getSwingTime() == null) {
            return;
        }
        rawEventMapper.insertIgnore(row);
    }

    /** 从 twin_dahua_swing_record 幂等回填 access_raw_event（与统计拉取实时写入互补，修复历史缺口） */
    public int backfillFromSwingTable(String startTime, String endTime, int batchSize) {
        return backfillFromSwingTable(startTime, endTime, batchSize, "DAHUA_PULL");
    }

    public int backfillFromSwingTable(String startTime, String endTime, int batchSize, String source) {
        int offset = 0;
        int total = 0;
        while (true) {
            List<DahuaSwingRecord> page = dahuaSwingMapper.listRecordsForRawBackfill(startTime, endTime, batchSize, offset);
            if (page.isEmpty()) {
                break;
            }
            for (DahuaSwingRecord r : page) {
                ingestFromSwing(r, source != null && !source.isBlank() ? source : "DAHUA_PULL");
                total++;
            }
            if (page.size() < batchSize) {
                break;
            }
            offset += batchSize;
        }
        return total;
    }

    public static AccessRawEvent swingToRaw(DahuaSwingRecord r, String source) {
        return toRaw(r, source);
    }

    private static AccessRawEvent toRaw(DahuaSwingRecord r, String source) {
        AccessRawEvent row = new AccessRawEvent();
        row.setSource(source);
        row.setRecordId(r.getRecordId());
        row.setSwingTaskId(r.getTaskId());
        row.setSwingTime(parseTime(r.getSwingTime()));
        row.setCardNumber(r.getCardNumber());
        row.setChannelCode(r.getChannelCode());
        row.setChannelName(r.getChannelName());
        row.setPersonCode(r.getPersonCode());
        row.setPersonName(r.getPersonName());
        var dept = DahuaSwingDepartmentSupport.resolveForDisplay(r);
        row.setDepartmentId(dept.id());
        row.setDepartmentName(dept.name());
        row.setMappingUserId(r.getMappingUserId());
        row.setDahuaEnterOrExit(DahuaSwingEnterExitSupport.resolve(r));
        row.setOpenResult(r.getOpenResult());
        row.setRawJson(r.getRawJson());
        return row;
    }

    private static LocalDateTime parseTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(text.trim(), DT);
        } catch (Exception e) {
            return null;
        }
    }
}

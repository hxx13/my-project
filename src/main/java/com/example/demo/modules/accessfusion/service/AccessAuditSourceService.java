package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessAuditSourceConfig;
import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.accessfusion.mapper.AccessAuditSourceConfigMapper;
import com.example.demo.modules.accessfusion.mapper.AccessRawEventMapper;
import com.example.demo.modules.accessfusion.model.AccessAuditFilterParams;
import com.example.demo.modules.twin.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.support.DahuaSwingDepartmentSupport;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccessAuditSourceService {

    private final AccessAuditSourceConfigMapper configMapper;
    private final AccessRawEventMapper rawEventMapper;
    private final AccessRawEventIngestService rawIngestService;
    private final DahuaSwingMapper dahuaSwingMapper;
    private final DahuaSwingDepartmentSupport departmentSupport;

    public AccessAuditSourceService(
            AccessAuditSourceConfigMapper configMapper,
            AccessRawEventMapper rawEventMapper,
            AccessRawEventIngestService rawIngestService,
            DahuaSwingMapper dahuaSwingMapper,
            DahuaSwingDepartmentSupport departmentSupport) {
        this.configMapper = configMapper;
        this.rawEventMapper = rawEventMapper;
        this.rawIngestService = rawIngestService;
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.departmentSupport = departmentSupport;
    }

    public List<AccessAuditSourceConfig> listConfigs() {
        return configMapper.selectAll();
    }

    public AccessAuditSourceConfig getConfig(long id) {
        return configMapper.selectById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public long saveConfig(AccessAuditSourceConfig row) {
        if (!StringUtils.hasText(row.getName())) {
            throw new IllegalArgumentException("配置名称不能为空");
        }
        if (row.getEnabled() == null) {
            row.setEnabled(1);
        }
        if (row.getRequireMapping() == null) {
            row.setRequireMapping(0);
        }
        if (row.getOpenSuccessOnly() == null) {
            row.setOpenSuccessOnly(1);
        }
        if (row.getAutoSyncEnabled() == null) {
            row.setAutoSyncEnabled(0);
        }
        if (row.getId() == null) {
            configMapper.insert(row);
            return row.getId();
        }
        configMapper.update(row);
        return row.getId();
    }

    public void deleteConfig(long id) {
        configMapper.delete(id);
    }

    public Map<String, Object> previewSwing(AccessAuditFilterParams filter, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 500);
        int offset = (Math.max(page, 1) - 1) * safeSize;
        int total = dahuaSwingMapper.countRecordsByFilter(filter);
        List<DahuaSwingRecord> rows = dahuaSwingMapper.listRecordsByFilter(filter, safeSize, offset);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", AccessSwingRecordPresenter.toViewRows(rows, departmentSupport));
        out.put("total", total);
        out.put("page", page);
        out.put("pageSize", safeSize);
        return out;
    }

    public Map<String, Object> previewRaw(AccessAuditFilterParams filter, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 500);
        int offset = (Math.max(page, 1) - 1) * safeSize;
        int total = rawEventMapper.countForAudit(
                filter.taskId(),
                filter.channelCode(),
                filter.personCode(),
                filter.personName(),
                filter.openType(),
                filter.startTime(),
                filter.endTime(),
                filter.requireMapping(),
                filter.openSuccessOnly());
        List<AccessRawEvent> rows =
                rawEventMapper.listForAudit(
                        filter.taskId(),
                        filter.channelCode(),
                        filter.personCode(),
                        filter.personName(),
                        filter.openType(),
                        filter.startTime(),
                        filter.endTime(),
                        filter.requireMapping(),
                        filter.openSuccessOnly(),
                        safeSize,
                        offset);
        Map<String, Object> stats =
                rawEventMapper.statsForAudit(
                        filter.taskId(),
                        filter.channelCode(),
                        filter.personCode(),
                        filter.personName(),
                        filter.openType(),
                        filter.startTime(),
                        filter.endTime(),
                        filter.requireMapping(),
                        filter.openSuccessOnly());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", rows);
        out.put("total", total);
        out.put("page", page);
        out.put("pageSize", safeSize);
        out.put("stats", stats != null ? stats : Map.of());
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> syncToRawLibrary(long configId, String startTime, String endTime) {
        AccessAuditSourceConfig cfg = configMapper.selectById(configId);
        if (cfg == null) {
            throw new IllegalArgumentException("配置不存在");
        }
        AccessAuditFilterParams filter = AccessAuditFilterParams.fromConfig(cfg, startTime, endTime);
        int batch = 500;
        int offset = 0;
        int ingested = 0;
        int scanned = 0;
        while (true) {
            List<DahuaSwingRecord> page = dahuaSwingMapper.listRecordsByFilter(filter, batch, offset);
            if (page.isEmpty()) {
                break;
            }
            for (DahuaSwingRecord r : page) {
                scanned++;
                rawIngestService.ingestFromSwing(r, "AUDIT_SYNC");
                ingested++;
            }
            if (page.size() < batch) {
                break;
            }
            offset += batch;
        }
        int swingTotal = dahuaSwingMapper.countRecordsByFilter(filter);
        int rawTotal =
                rawEventMapper.countForAudit(
                        filter.taskId(),
                        filter.channelCode(),
                        filter.personCode(),
                        filter.personName(),
                        filter.openType(),
                        filter.startTime(),
                        filter.endTime(),
                        filter.requireMapping(),
                        filter.openSuccessOnly());
        configMapper.updateSyncStats(configId, ingested, swingTotal, rawTotal);
        Map<String, Object> out = new HashMap<>();
        out.put("scanned", scanned);
        out.put("ingested", ingested);
        out.put("swingTotalInWindow", swingTotal);
        out.put("rawTotalInWindow", rawTotal);
        return out;
    }

}

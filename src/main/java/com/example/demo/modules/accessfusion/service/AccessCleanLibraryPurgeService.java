package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanPackage;
import com.example.demo.modules.accessfusion.mapper.AccessCleanExecutionLogMapper;
import com.example.demo.modules.accessfusion.mapper.AccessCleanPackageItemMapper;
import com.example.demo.modules.accessfusion.mapper.AccessCleanPackageMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 清空清洗总库（可选按通道），便于更换清洗方案后重跑入库。 */
@Service
public class AccessCleanLibraryPurgeService {

    private final AccessCleanPackageItemMapper packageItemMapper;
    private final AccessCleanPackageMapper packageMapper;
    private final AccessCleanExecutionLogMapper executionLogMapper;

    public AccessCleanLibraryPurgeService(
            AccessCleanPackageItemMapper packageItemMapper,
            AccessCleanPackageMapper packageMapper,
            AccessCleanExecutionLogMapper executionLogMapper) {
        this.packageItemMapper = packageItemMapper;
        this.packageMapper = packageMapper;
        this.executionLogMapper = executionLogMapper;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> purge(String confirmToken, List<String> channelCodes, boolean deleteExecutionLogs) {
        if (!"CLEAR".equals(confirmToken != null ? confirmToken.trim() : "")) {
            throw new IllegalArgumentException("请传入确认码 confirmToken=CLEAR");
        }
        int before = packageItemMapper.countAll();
        int deleted;
        if (channelCodes != null && !channelCodes.isEmpty()) {
            deleted = packageItemMapper.deleteByChannelCodes(channelCodes);
            resetPackageCountsForChannels(channelCodes);
        } else {
            deleted = packageItemMapper.deleteAll();
            resetAllPackageCounts();
        }
        int logsDeleted = 0;
        if (deleteExecutionLogs) {
            logsDeleted = executionLogMapper.deleteAll();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemsBefore", before);
        out.put("itemsDeleted", deleted);
        out.put("executionLogsDeleted", logsDeleted);
        out.put("scope", channelCodes != null && !channelCodes.isEmpty() ? "channels" : "all");
        return out;
    }

    private void resetAllPackageCounts() {
        for (AccessCleanPackage pkg : packageMapper.listAllPrimaryPackages()) {
            zeroPackage(pkg);
        }
    }

    private void resetPackageCountsForChannels(List<String> channelCodes) {
        for (String code : channelCodes) {
            if (!StringUtils.hasText(code)) {
                continue;
            }
            AccessCleanPackage pkg = packageMapper.selectPrimaryByChannelCode(code.trim());
            if (pkg != null) {
                zeroPackage(pkg);
            }
        }
    }

    private void zeroPackage(AccessCleanPackage pkg) {
        pkg.setTotalScanned(0);
        pkg.setIncludedCount(0);
        pkg.setExcludedCount(0);
        pkg.setReviewCount(0);
        packageMapper.update(pkg);
    }
}

package com.example.demo.modules.nhp.service;

import com.example.demo.modules.nhp.entity.CrfQualityEvent;
import com.example.demo.modules.nhp.mapper.CrfQualityEventMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * NHP 数据质量中心（22 §6.5② / V37）。
 * 4 类检测器 stub + monthlyReport KPI 占位。
 */
@Service
public class NhpQualityService {

    private static final Logger log = LoggerFactory.getLogger(NhpQualityService.class);

    private final CrfQualityEventMapper qualityEventMapper;

    public NhpQualityService(CrfQualityEventMapper qualityEventMapper) {
        this.qualityEventMapper = qualityEventMapper;
    }

    /** 异常值：值超 crf_reference_range（stub）。 */
    public List<CrfQualityEvent> detectOutliers(Long subjectId) {
        log.debug("detectOutliers stub subjectId={}", subjectId);
        return List.of();
    }

    /** 时点偏差：collect_datetime vs 计划时点（stub）。 */
    public List<CrfQualityEvent> detectDeviations(Long subjectId) {
        log.debug("detectDeviations stub subjectId={}", subjectId);
        return List.of();
    }

    /** TAT 超时：test_order 超 tat_hours 未回传（stub）。 */
    public List<CrfQualityEvent> detectTatOverdue(Long subjectId) {
        log.debug("detectTatOverdue stub subjectId={}", subjectId);
        return List.of();
    }

    /** CoC 断裂：test_order 无 result / 交接链断（stub）。 */
    public List<CrfQualityEvent> detectCocBroken(Long subjectId) {
        log.debug("detectCocBroken stub subjectId={}", subjectId);
        return List.of();
    }

    /**
     * 质控月报：双人复核完成率 / 异常值复测闭环 / TAT 达标率 / 时点偏差率 / CoC 未闭环。
     * KPI 字段名对齐前端契约（nhpQuality.api.ts）。
     */
    public Map<String, Object> monthlyReport() {
        Map<String, Object> kpi = new LinkedHashMap<>();
        kpi.put("doubleEntryRate", null);
        kpi.put("outlierClosedRate", null);
        kpi.put("tatOnTimeRate", null);
        kpi.put("deviationRate", null);
        kpi.put("cocOpenCount", qualityEventMapper.countByTypeAndStatus("COC_BROKEN", "OPEN"));
        // 兼容旧键名
        kpi.put("dualReviewCompletionRate", null);
        kpi.put("outlierRetestClosureRate", null);
        kpi.put("tatComplianceRate", null);
        kpi.put("timepointDeviationRate", null);
        kpi.put("openQualityEvents", qualityEventMapper.countByStatus("OPEN"));
        return kpi;
    }

    public List<CrfQualityEvent> listEvents() {
        List<CrfQualityEvent> all = qualityEventMapper.listAll();
        return all == null ? List.of() : all;
    }

    public CrfQualityEvent recordEvent(CrfQualityEvent event) {
        if (event.getStatus() == null) {
            event.setStatus("OPEN");
        }
        qualityEventMapper.insert(event);
        return event;
    }
}

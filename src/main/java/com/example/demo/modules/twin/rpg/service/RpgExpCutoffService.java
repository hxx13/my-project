package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.twin.rpg.config.RpgExpCutoffProperties;
import com.example.demo.modules.twin.rpg.mapper.RpgMapper;
import com.example.demo.modules.twin.rpg.mapper.TwinExpRecordMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class RpgExpCutoffService {

    private static final Logger log = LoggerFactory.getLogger(RpgExpCutoffService.class);

    private final RpgExpCutoffProperties properties;
    private final RpgMapper rpgMapper;
    private final TwinExpRecordMapper twinExpRecordMapper;
    private final TwinExpReconcileService twinExpReconcileService;

    @Autowired
    public RpgExpCutoffService(RpgExpCutoffProperties properties,
                               RpgMapper rpgMapper,
                               TwinExpRecordMapper twinExpRecordMapper,
                               @Lazy TwinExpReconcileService twinExpReconcileService) {
        this.properties = properties;
        this.rpgMapper = rpgMapper;
        this.twinExpRecordMapper = twinExpRecordMapper;
        this.twinExpReconcileService = twinExpReconcileService;
    }

    public String cutoffStartForQuery() {
        return properties.cutoffStartInclusive();
    }

    public boolean isEnabled() {
        return properties.isEnabled();
    }

    public LocalDate cutoffDate() {
        return properties.getDate();
    }

    public boolean isOnOrAfterCutoff(LocalDate date) {
        if (!properties.isEnabled() || properties.getDate() == null) {
            return true;
        }
        return !date.isBefore(properties.getDate());
    }

    /**
     * 物理删除截止日前的进出流水与经验流水；若有删除则重置 personnel 并可选全量重算。
     */
    public Map<String, Object> applyPhysicalCutoff() {
        Map<String, Object> result = new LinkedHashMap<>();
        if (!properties.isEnabled()) {
            result.put("skipped", true);
            result.put("reason", "cutoff disabled");
            return result;
        }

        String cutoff = properties.cutoffStartInclusive();
        result.put("cutoff", cutoff);

        int accessDeleted = rpgMapper.deleteAccessLogsBefore(cutoff);
        int expDeleted = twinExpRecordMapper.deleteBeforeCutoff(cutoff);
        result.put("accessLogsDeleted", accessDeleted);
        result.put("expRecordsDeleted", expDeleted);

        log.info("[XP截断] 已删除 aro_access_log={} twin_exp_record={} 条（< {}）",
                accessDeleted, expDeleted, cutoff);

        if (accessDeleted > 0 || expDeleted > 0) {
            int personnelReset = rpgMapper.resetAllPersonnelTotalExp();
            result.put("personnelResetRows", personnelReset);

            if (properties.isAutoRecalc()) {
                log.info("[XP截断] 触发全量经验重算…");
                Map<String, Object> recalc = twinExpReconcileService.reconcileAllHistorical();
                result.put("recalc", recalc);
            } else {
                result.put("recalc", "skipped (twin.rpg.exp.cutoff.auto-recalc=false)");
            }
        } else {
            result.put("recalc", "skipped (no rows deleted)");
        }

        return result;
    }
}

package com.example.demo.modules.twin.entity;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class DahuaSwingStatsPullTask {
    private Long id;
    private String name;
    private Integer enabled;
    /** PREVIOUS_DAY | PREVIOUS_WEEK | HISTORICAL_RANGE | SINCE_LAST */
    private String periodMode;
    private Integer periodDays;
    private String queryJson;
    private Long cleanRuleProfileId;
    private String lastPulledStart;
    private String lastPulledEnd;
    private String lastStatus;
    private String lastError;
    private String lastRunAt;
    private Integer lastSavedCount;
    /** 非表字段：queryJson.backfillTotalSaved（回溯累计本段入库合计） */
    private Integer backfillTotalSaved;
    /** 非表字段：记录库 twin_dahua_swing_record 中该任务 STATS 条数 */
    private Integer libraryRecordCount;
    private String createdAt;
    private String updatedAt;
}

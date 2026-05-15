package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.Data;

/**
 * 批量替换或导入时的单行写入。
 */
@Data
public class TelemetryWatchlistTagWriteDto {
    private String winccVariableName;
    private String structureType;
    private String dataType;
    private String displayLabel;
    /** 楼层，如 2F */
    private String floorCode;
    /** 房间（可写 2F-201A 等；动物房卡片按数字+套间后缀自动归并） */
    private String roomCanonical;
    /** 指标类型 code，对应 telemetry_metric_kind */
    private String metricKindCode;
    /**
     * 管理端「保存本表」可提交；CSV/旧客户端省略时保持 null，由服务端保留原缓存。
     */
    private String cachedAlarmMinValue;
    private String cachedAlarmMaxValue;
    /** 每点报警下限覆盖；管理端整表保存可带；省略时服务端保留原值 */
    private String alarmOverrideMin;
    /** 每点报警上限覆盖 */
    private String alarmOverrideMax;
    private Boolean enabled;
    private Integer sortOrder;
}

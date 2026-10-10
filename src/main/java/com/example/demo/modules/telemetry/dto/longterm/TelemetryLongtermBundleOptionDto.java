package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 候选变量的**分区**选项 —— 对应 WinCC 变量目录里「按导入文件名分的区」
 * （{@code telemetry_watchlist_bundle}）。
 *
 * <p>为什么要它：变量目录有五千多个点位，加入变量时一次全铺既慢又难找；
 * 按**目录本来的分区**先选一层，再列该分区的变量，与变量导入页的「分区」口径一致。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermBundleOptionDto {

    /** 分区 code（如 wincc-2f-vav） */
    private String code;

    /** 分区显示名 */
    private String displayName;

    /** 该分区下的变量数（已含目录里的启用状态，不额外过滤） */
    private int count;
}

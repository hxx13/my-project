package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 矩阵里的一个**列头 = 一个平分槽位**。
 *
 * <p>口径（用户 2026-10-10 明确）：列不用「实际采到的那个时刻」，而用「把一天按采样间隔平分出来的
 * 第几个槽」。实际采样会有几秒到几分钟的延迟（要等采集），用实际时刻当列名会让不同天/不同变量错位；
 * 归到槽位后就对齐了。**但每列必须标出该槽位的名义时间点**，否则用户不知道这列是几点。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermSlotDto {

    /** 当天第几个槽（从 0 起） */
    private int slot;

    /** 该槽的名义时间点（{@code HH:mm}；间隔不能整除一天时带秒） */
    private String time;
}

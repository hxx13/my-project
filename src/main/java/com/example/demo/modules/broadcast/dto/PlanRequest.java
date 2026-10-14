package com.example.demo.modules.broadcast.dto;

import java.util.List;

/**
 * 定时方案的入参（新建与修改共用）。
 *
 * @param timeMode   0 按周循环 / 1 按日期区间
 * @param weekDays   按周：选中星期，"1"=周一 … "7"=周日，如 "135"
 * @param startTime  每日开始时刻 HH:mm:ss（**平台时间**）
 * @param endTime    每日结束时刻 HH:mm:ss（**平台时间**）
 * @param volume     可选：开播前设音量 0-100
 * @param zoneMacs   目标分区 MAC
 * @param songPaths  曲目路径（平台上的绝对路径）
 * @param songListId 曲目所属曲库列表编号
 * @param loopPlay   循环播放：true 窗口内列表循环 / false 播完即停
 */
public record PlanRequest(
        String planName,
        Boolean enabled,
        Integer timeMode,
        String weekDays,
        String startDate,
        String endDate,
        String startTime,
        String endTime,
        Integer volume,
        List<String> zoneMacs,
        List<String> songPaths,
        String songListId,
        Boolean loopPlay
) {
}

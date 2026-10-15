package com.example.demo.modules.broadcast.dto;

import java.util.List;

/**
 * 恢复指定分区的播放。
 *
 * @param macs     目标分区 MAC
 * @param songPath 要播放的曲目路径；可空 —— 空时退回「平台留着的曲名 → 所属运行中方案的第一首」。
 *                 置空闲后平台会清掉该路曲名，所以从界面点「播放这一路」时最好把当前选中的曲子带上来。
 */
public record ZoneResumeRequest(List<String> macs, String songPath) {
}

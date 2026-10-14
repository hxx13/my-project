package com.example.demo.modules.broadcast.dto;

import java.util.List;

/**
 * 立即播放。
 *
 * @param macs     目标分区 MAC，可多个
 * @param songPath 平台上的曲目绝对路径（曲目的身份）
 * @param volume   可选：播放前先设音量
 */
public record PlayRequest(List<String> macs, String songPath, Integer volume) {
}

package com.example.demo.modules.broadcast.dto;

/**
 * 设置播放模式。
 *
 * @param mode 1 单曲播放 / 2 单曲循环 / 3 顺序播放 / 4 循环播放 / 5 随机播放（平台全局）
 */
public record PlayModeRequest(Integer mode) {
}

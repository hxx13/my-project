package com.example.demo.modules.broadcast.dto;

import java.util.List;

/** 批量设置音量。 */
public record VolumeRequest(List<String> macs, Integer volume) {
}

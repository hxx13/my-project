package com.example.demo.modules.broadcast.dto;

import java.util.List;

/** 停止播放。 */
public record StopRequest(List<String> macs) {
}

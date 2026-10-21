package com.example.demo.modules.training.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 学习视频观看进度：每人每视频一行。 */
@Data
public class LearningVideoProgress {
    private Long id;
    private String personId;
    private Long videoId;
    /** 上次播放位置，用于续播 */
    private Integer positionSeconds;
    /** 累计有效观看秒数（大跨度拖动不计入） */
    private Integer watchedSeconds;
    private Integer durationSeconds;
    private Integer completed;
    private LocalDateTime lastWatchedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

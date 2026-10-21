package com.example.demo.modules.training.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 学习视频：文件本体走 /api/upload，这里只登记元数据与播放规则。 */
@Data
public class LearningVideo {
    private Long id;
    private String title;
    /** 播放地址（/api/upload/files/...），与图片同一条存储链 */
    private String fileUrl;
    private Long fileRecordId;
    /** 0 = 未知，学生首次播放后回填 */
    private Integer durationSeconds;
    private Long sizeBytes;
    /** 1 = 允许拖动进度条 */
    private Integer allowSeek;
    /** 1 = 记住上次播放位置 */
    private Integer rememberPosition;
    /** 1 = 未看完时下次必须从头播放 */
    private Integer requireFullWatch;
    /** 完成判定：累计观看达到时长的百分比 */
    private Integer completeThreshold;
    private Integer active;
    private Integer sortOrder;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

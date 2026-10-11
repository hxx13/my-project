package com.example.demo.modules.ai.feedback.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一条 AI 抽屉反馈 —— 用户对抽屉提的意见（可带截图），超管回复。
 *
 * <p>提交人 / 回复人都存 id，同时把姓名**快照**进 {@link #userName}：列表要显示人名，
 * 而人员资料会变，联表取名字会让历史反馈的显示随着改名而变化（同 {@code ai_timer.owner_name_snapshot} 的留痕原则）。
 */
@Data
public class AiDrawerFeedback {

    /** 待处理（默认）。 */
    public static final String STATUS_PENDING = "PENDING";
    /** 已回复。 */
    public static final String STATUS_REPLIED = "REPLIED";

    private Long id;
    /** 提交人 id。 */
    private String userId;
    /** 提交人姓名快照。 */
    private String userName;
    /** 反馈文字。 */
    private String content;
    /** 图片地址数组（JSON 数组字符串）。 */
    private String imageUrls;
    private String status;
    /**
     * 回复串（JSON 数组字符串，元素形如 {@code {content, imageUrls:[], repliedBy, repliedAt}}，按时间升序）。
     * 多个超管逐条累积，不再互相覆盖。
     */
    private String repliesJson;
    /** 最后一条回复的内容（兼容读，等价于 {@link #repliesJson} 的最后一条；没有则为空）。 */
    private String replyContent;
    /** 最后一条回复的附图地址数组（JSON 数组字符串，兼容读）。 */
    private String replyImageUrls;
    /** 最后一条回复的人 id（兼容读）。 */
    private String repliedBy;
    /** 最后一条回复的时间（兼容读）。 */
    private LocalDateTime repliedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

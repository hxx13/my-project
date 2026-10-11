package com.example.demo.modules.ai.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一个人的一条偏好。
 *
 * <p>**与学习池共用条目结构、但不是一张表**（设计 §8.6）：学习池是全站学出来的、走影子期；
 * 这里是本人的习惯、不走影子期（只影响本人、一句话就能撤销，反馈回路极短）。混在一起
 * 会让治理强度被最弱的那一方拉低。
 *
 * <p>写入者不是分析器，是**模型在对话里自主增删**（三个免确认工具，见 {@code PreferenceToolPack}）。
 * 模型可以主动改、主动删，且**一律不向用户提问确认** —— 作为交换，每次写完必须**当场明说**
 * 「记住了：…」，用户要撤销直接说一句「别记这个」即可。
 */
@Data
public class AiUserPreference {

    private Long id;
    /** 本人 user.id —— 偏好只对本人生效，也只看得到本人的。 */
    private String userId;
    /** 偏好内容，一行一条。 */
    private String content;
    /** {@code CHAT}=模型在对话里写的 / {@code ADMIN}=管理端写的。 */
    private String source;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

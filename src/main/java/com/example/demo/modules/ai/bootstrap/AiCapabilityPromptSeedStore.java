package com.example.demo.modules.ai.bootstrap;

/**
 * 能力提示词清单（表 {@code ai_capability_prompt}）的播种仓储。
 *
 * <p>抽出这层只为让 {@link AiCapabilityPromptSeed} 可单测（见 {@code AiCapabilityPromptSeedTest} 的假仓储）。
 * 只有「数一下」与「逐条插入」两个动作 —— 播种**只插不改**：表一旦播过，
 * 管理员怎么增删改排序都不许被覆盖回来。
 */
public interface AiCapabilityPromptSeedStore {

    /** 表里有几行（不管启用与否）。用来判「表是否已经有内容」。 */
    int countAll();

    /**
     * 插一行（enabled = 1）。{@code sortOrder} 是全局排序号；{@code note} 是操作备注（给用户看的说明）；
     * {@code audience} 是「谁看得见」的取值（视角 {@code STAFF}/{@code STUDENT}、角色档
     * {@code ADMIN}/{@code SUPER_ADMIN}，判定见 {@code AiDrawerContentService#visibleTo}），
     * {@code null} / 空串 = 全员。
     *
     * <p>用 String 而不是 {@code AiView}：{@code AiView} 只到「视角」，装不下角色档。
     */
    void insert(String groupName, String title, String promptText, String note, int sortOrder, String audience);
}

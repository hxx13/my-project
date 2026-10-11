package com.example.demo.modules.ai.bootstrap;

import java.util.Collection;
import java.util.List;

/**
 * AI 抽屉**两个写接口**的落库口：能力清单表 {@code ai_capability_prompt} + 审计表
 * {@code sys_system_config_audit}。
 *
 * <p>抽出这层只为让 {@link com.example.demo.modules.ai.service.AiDrawerWriteService} 可单测（假仓储，不连库）。
 *
 * <p><b>文案的读写不在这里</b> —— 复用现成的 {@link AiCopyConfigStore}：逐键 upsert 已经是它唯一的写入口，
 * 再开一条会变成两个写手互相覆盖。
 */
public interface AiDrawerWriteStore {

    /** 全部条目（含停用），按 {@code sort_order, id} 升序 —— 同号按 id 兜底，排序稳定可断言。 */
    List<CapabilityItem> selectAllOrdered();

    /** 新增一行，返回新行 id。 */
    long insert(CapabilityItem item);

    /** 按 id 改一行，返回影响行数（0 = 该 id 已不存在）。 */
    int update(CapabilityItem item);

    /** 删除这批 id（整份保存里「提交里没有的 id」）。返回实际删掉的行数。 */
    int deleteByIds(Collection<Long> ids);

    /** 写一条系统配置审计（旧值 / 新值 / 操作人）。改文案时逐键写。 */
    void insertAudit(String module, String configKey, String oldValue, String newValue, String operatorId);

    /**
     * 一条能力提示词。
     *
     * @param id       null = 新增；非 null = 改这一条
     * @param note     操作备注：这条提示词点了会做什么（给用户看的说明），可空
     * @param enabled  null 视为启用
     * @param audience 空串 = 全员；STAFF / STUDENT 是视角，ADMIN / SUPER_ADMIN 是角色档
     */
    record CapabilityItem(Long id, String groupName, String title, String promptText, String note,
                          Integer sortOrder, Boolean enabled, String audience) {
    }
}

package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiLearnEntry;
import com.example.demo.modules.ai.mapper.AiLearnEntryMapper;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 把学习池里学到的说法拼成一个**附加层**，追加到提示词最后。
 *
 * <p>这是「自学习」闭环里**唯一真正写回提示词的一步** —— 前面几期（判据 → 频次捞候选 →
 * 写池子）都只是在攒数据，不接这一步的话，线上行为一个字都不会变。
 *
 * <h2>两条硬规矩</h2>
 * <ol>
 *   <li><b>只能追加在最后</b>。提示词缓存命中比未命中便宜约 50 倍（设计 §1.1），
 *       而缓存前缀是逐字比对的：把个性化内容插到中间，会把全体用户的缓存一起打断。
 *       实测算过命中率约 94%，动它就是动这笔钱。</li>
 *   <li><b>只写进提示词，不碰代码常量</b>（设计 §1）—— 学错了删几条即可恢复，
 *       不会出现「谁把提示词改坏了」的悬案。</li>
 * </ol>
 *
 * <h2>按角色档隔离：不用加字段，拿「这一轮实际下发的工具」筛就够了</h2>
 * 设计要求「普通教职工学到的不能喂给管理员」（§6）。这里没有另存 scope，
 * 而是**只挂出这一轮真的下发了的工具对应的词条** —— 下发到谁手里本来就是按角色/场景筛过的，
 * 所以隔离是白拿的，而且比另存一个 scope 更准（同一个人在不同页面看到的工具本来就不同）。
 */
@Service
public class AiLearnInjectionService {

    /**
     * 一次最多挂几条。
     *
     * <p>为什么要有上限：附加层落在缓存前缀的尾部，**按未命中价计费**，而且越靠后越稀释注意力、
     * 降低遵守率（设计 §8.5）。额度留给 `trust` / `hits` 高的那些 —— Mapper 里已经按这个降序取。
     */
    static final int MAX_ENTRIES = 40;

    private final AiLearnEntryMapper mapper;

    public AiLearnInjectionService(AiLearnEntryMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 拼出附加层的正文（不含标题，标题由 {@link AiPromptService} 统一加）。
     * 没有可挂的词条就返回空串，调用方据此整层跳过。
     */
    public String blockFor(Collection<AiToolPack> packs) {
        Set<String> offered = offeredToolNames(packs);
        if (offered.isEmpty()) {
            return "";
        }
        List<AiLearnEntry> rows = mapper.listInjectable(MAX_ENTRIES);
        if (rows == null || rows.isEmpty()) {
            return "";
        }
        StringBuilder bullets = new StringBuilder();
        for (AiLearnEntry e : rows) {
            if (e == null || !StringUtils.hasText(e.getPhrase()) || !StringUtils.hasText(e.getTarget())) {
                continue;
            }
            // 这条工具这轮没下发 → 连它的说法也不该出现（见类注释里的隔离说明）
            if (!offered.contains(e.getTarget().strip())) {
                continue;
            }
            if (bullets.length() > 0) {
                bullets.append('\n');
            }
            bullets.append("- 「").append(e.getPhrase().strip()).append("」→ ").append(e.getTarget().strip());
        }
        if (bullets.length() == 0) {
            return "";
        }
        /*
         * 「只作参考」这句不能省：这一层是**统计**出来的，不是人定的口径。
         * 不写清楚，模型可能把「某个用户这么说过一次」当成硬规则，反而绕开前面的三态判断。
         * 所以明确要求它仍然自行判断、不要因为有这条就直接调工具。
         */
        return """
                下面是本系统从历史对话里统计出来的高频说法，以及它们**通常**对应的工具。
                **只作参考**：拿不准时仍按前面的规则自己判断，不要因为这里写了就直接调用。
                统计口径是「用户这么说的时候，最终用到的是哪个工具」，所以它可能有偏差，也可能已经过期。

                """ + bullets;
    }

    /** 这一轮实际下发的工具名 —— 由 {@code AiPackRouter} 按角色与场景筛过。 */
    private static Set<String> offeredToolNames(Collection<AiToolPack> packs) {
        Set<String> names = new HashSet<>();
        if (packs == null) {
            return names;
        }
        for (AiToolPack pack : packs) {
            if (pack == null) {
                continue;
            }
            List<AiTool> tools = pack.tools();
            if (tools == null) {
                continue;
            }
            for (AiTool t : tools) {
                if (t != null && StringUtils.hasText(t.name())) {
                    names.add(t.name().strip());
                }
            }
        }
        return names;
    }
}

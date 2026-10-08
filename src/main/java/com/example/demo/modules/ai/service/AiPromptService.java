package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * 约束（发给模型的前置条件）的读取与拼装。见设计文档 §10。
 *
 * 四层里本类负责 L0 / L1 / L3：
 * <ul>
 *   <li>L0 平台级 —— 配置 key {@code ai.prompt.global}</li>
 *   <li>L1 工具包级 —— 配置 key {@code ai.prompt.pack.<packKey>}</li>
 *   <li>L2 工具描述 —— 不在这里，随 {@link com.example.demo.modules.ai.tool.AiTool} 走（与 schema 绑死，不能分离）</li>
 *   <li>L3 运行时 —— 调用方传入的 runtimeContext</li>
 * </ul>
 *
 * **默认值一律留在代码，数据库只是管理员覆盖。** 不把提示词正文种进配置值：
 * 那样代码默认值与库里的值会各自漂移，之后「以谁为准」本身就成了 bug 源
 * （llm 模块就踩过，见 LlmConfigSeed#cleanupMisleadingPromptValues）。
 * 写法照 LlmConfigService#getAssistantSystemPrompt —— 库里有非空值就用，否则回落代码内置。
 */
@Service
public class AiPromptService {

    public static final String MODULE = "ai";
    public static final String GLOBAL_PROMPT_KEY = "ai.prompt.global";

    /** L0 内置默认：平台级约束。后台可覆盖。 */
    public static final String DEFAULT_GLOBAL_PROMPT = """
            你是实验动物房管理系统的操作助手。用户用自然语言说需求，你负责判断该调用哪个工具、以及是否需要先问清楚。

            ## 三态（先判断自己处在哪一态）
            1. 参数齐、对象唯一、你有权限 → 直接调用工具。
            2. 候选不唯一，或关键参数缺失且无法从上下文推出 → 先用 clarify 给出选项。不要猜。
            3. 可用工具里没有能完成这件事的 → 直接说做不到，并说明你能做什么。
               说之前**先在工具列表里过一遍**：按同义词和近似动作找（「待办/待审/审核」→ list*、approve*、reject*；
               「某人现在什么情况」→ search*、list*）。列表里明明有、你却说「没有这个功能」，比答错更伤信任。

            「不知道」是合法答案，而且永远优于编一个答案。

            ## 总括问题（「我有什么待审的」「有哪些要处理的」「还有什么要我办的」）
            - 这类问题**天然跨域**：物资申领 / 延迟免冻、笼位认领 / 分笼 / 转移、培训报名、免冻发卡
              各是一摊。手里有几摊就**一摊一摊查完再汇总** —— 查完一个域就下结论，
              等于把「我只查了物资」说成「你只有这些」，那是最招人烦的答法。
            - 汇总时每条都说清属于哪个域；一个都没查到就说「这几类我都没查到待办」，
              不要只报一个域、也不要说成「没有待办」。
            - 手上只有其中一两个域的工具时**如实说明**：「我这轮只能看 X、Y 两类，其余得到对应页面上看」。

            ## 现状只能现查
            「现在」的事实只能由工具回答：某人当前是否豁免、有没有绑卡、在不在馆、还剩多少库存。
            - 对话上文里的查询结果是**历史记录**，不能拿来回答「现在」——它可能已经过期、被收回，或被别人改过。
            - 用户问现状、或让你做一件依赖现状的事（例如「再给他授一次」），先调工具查，再回答。
            - 拿上文推断出来的现状当结论说出口，等同于编答案。

            ## 必须停下来确认
            - 任何写操作（新增、修改、删除、状态变更）。
            - 你打算做的事不在可用工具列表里。

            ## 不要问
            - 上文已经说过、或能从上下文唯一推出的。
            - 调一个查询工具就能自己查到答案的。

            ## 输出
            - 用中文，简洁，先说结论。
            - **多条同类记录（3 条及以上）或多字段对照，用 markdown 表格** —— 标准管道表格，
              表头行下面必须有 `|---|` 分隔行，每行列数对齐；列宽尽量短（`待审` 别写成 `当前审核状态`）。
              只有一两项时用一句话说清，**别为两行数据撑一张表**。
              **不要用制表符/空格对齐来凑表格** —— 前端不认，会变成挤成一行的纯文本。
            - 用户问「你能做什么 / 有哪些工具」时：**用中文按"能办什么事"回答**（例如「查环境点位的当前温湿度」
              「把某个课题组的成员列出来」），**不要念英文工具名、参数名**，也不要把工具表原样铺开。
              并且说清这是**当前这一轮**能做的 —— 工具是按你所在的场景下发的，不是全站功能清单，
              别让用户以为这就是全部。
            - 不要输出 JSON、代码块，也不要复述工具调用的原始格式。""";

    private final NotificationSettingsService notificationSettingsService;

    public AiPromptService(NotificationSettingsService notificationSettingsService) {
        this.notificationSettingsService = notificationSettingsService;
    }

    public static String packPromptKey(String packKey) {
        return "ai.prompt.pack." + packKey;
    }

    public String globalPrompt() {
        return get(GLOBAL_PROMPT_KEY, DEFAULT_GLOBAL_PROMPT);
    }

    public String packPrompt(AiToolPack pack) {
        return get(packPromptKey(pack.packKey()), pack.defaultPrompt());
    }

    /**
     * 拼装发给模型的 system prompt。顺序固定为 L0 → L1（按包名序）→ L3，
     * **稳定的内容在前** —— 否则每轮都变的部分会让 prompt 缓存前缀失效（§10.2）。
     */
    public String assemble(Collection<AiToolPack> packs, String runtimeContext) {
        StringBuilder sb = new StringBuilder();
        for (Layer layer : layers(packs, runtimeContext)) {
            if (!StringUtils.hasText(layer.content())) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append("\n\n");
            }
            sb.append("## ").append(layer.title()).append('\n').append(layer.content().strip());
        }
        return sb.toString();
    }

    /**
     * 拼装预览：带每层的来源标注（配置 / 内置默认）。
     *
     * L0/L1 在数据库、L2 在代码，**单看任何一处都看不全最终发给模型的是什么** —— 所以必须有这个。
     */
    public PromptPreview preview(Collection<AiToolPack> packs, String runtimeContext) {
        List<Layer> all = layers(packs, runtimeContext);
        List<PreviewLayer> out = new ArrayList<>();
        for (Layer l : all) {
            if (!StringUtils.hasText(l.content())) {
                continue;
            }
            out.add(new PreviewLayer(l.title(), l.source(), l.content().strip()));
        }
        return new PromptPreview(out, assemble(packs, runtimeContext));
    }

    private List<Layer> layers(Collection<AiToolPack> packs, String runtimeContext) {
        List<Layer> layers = new ArrayList<>();
        layers.add(new Layer("全局约束", sourceOf(GLOBAL_PROMPT_KEY), globalPrompt()));

        List<AiToolPack> sorted = new ArrayList<>(packs);
        sorted.sort((a, b) -> a.packKey().compareTo(b.packKey()));
        for (AiToolPack pack : sorted) {
            layers.add(new Layer(
                    pack.displayName() + " · 专属口径",
                    sourceOf(packPromptKey(pack.packKey())),
                    packPrompt(pack)));
        }

        if (StringUtils.hasText(runtimeContext)) {
            layers.add(new Layer("当前情况", "运行时拼装", runtimeContext));
        }
        return layers;
    }

    private String sourceOf(String key) {
        return StringUtils.hasText(readValue(key)) ? "后台配置" : "代码内置默认";
    }

    private String get(String key, String fallback) {
        String db = readValue(key);
        return StringUtils.hasText(db) ? db.strip() : fallback.strip();
    }

    private String readValue(String key) {
        List<SystemConfigItem> items = notificationSettingsService.listConfigs(MODULE);
        return items.stream()
                .filter(it -> key.equals(it.getConfigKey()))
                .map(SystemConfigItem::getConfigValue)
                .filter(StringUtils::hasText)
                .findFirst()
                .orElse("");
    }

    private record Layer(String title, String source, String content) {
    }

    /** 预览用的一层。 */
    public record PreviewLayer(String title, String source, String content) {
    }

    /** 拼装预览结果。 */
    public record PromptPreview(List<PreviewLayer> layers, String finalPrompt) {
    }
}

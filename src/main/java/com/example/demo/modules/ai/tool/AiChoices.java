package com.example.demo.modules.ai.tool;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 工具向用户**提问**的统一写法（单选 / 多选）。
 *
 * <p>为什么要有这个类：提问是**结构化数据**，不是正文里的一句话。工具返回里带这几组键，
 * 编排层就会把它们翻成载体的可点控件（见 {@code AiOrchestrator#collectChoices}）：
 * <ul>
 *   <li>单选：{@code choices:[{label,value}]} + {@code choicesTitle}；</li>
 *   <li>多选：{@code questions:[{title,options,multiSelect:true}]} —— 面板渲染成可勾选项 + 「确认」，
 *       勾完把**值**逗号连接回给模型（气泡上显示的是标签）。</li>
 * </ul>
 *
 * <p>**单选与多选是同一套通道**，工具按需要挑一个用即可 —— 想加多选不用改编排层、不用改载体，
 * 只要按这里的形状返回（2026-10-09 抽出，第一个使用方是物资申领审计导出的小计层级）。
 *
 * <p>用法：把返回值 {@code putAll} 进工具结果，并在 {@code note} 里写清「把问题交给用户点，
 * 别在正文里复述选项」。
 *
 * <h3>什么时候才该问（与业界 tool-use 的 elicitation 口径一致）</h3>
 * <ol>
 *   <li><b>能自己定的就别问</b>：有合理默认、或条件已经从上下文/会话里确定 → 直接用，并在正文里
 *       说清「按什么做的」，给用户一个纠正的机会。问一轮的代价是用户的一次往返。</li>
 *   <li><b>至少两个真选项才叫「选」</b>：只剩一个候选就别弹（用户点开只有一项 = 空转）。
 *       编排层 {@code AiOrchestrator#toGroup} 已强制这一点，工具侧也别再问。</li>
 *   <li><b>不问已经定过的</b>：会话里已经确定的条件（见各工具返回的 {@code sessionFilters}）不要再问一遍，
 *       除非用户明确说要换。</li>
 *   <li><b>别把「名字相近的推荐」做成选项</b>：那不是他要的东西，摆一排反而像在说「这些里没有你要的」。
 *       没找到就如实说没找到，请他报原话。</li>
 *   <li><b>一次只问一件真正阻塞的事</b>：能并行确定的别拆成两轮问；选项控制在能一眼扫完的数量。</li>
 * </ol>
 */
public final class AiChoices {

    private AiChoices() {
    }

    /** 一个选项：{@code label} 给人看（气泡与芯片上显示它），{@code value} 发给模型。 */
    public static Map<String, Object> option(String label, String value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", label);
        m.put("value", value);
        return m;
    }

    /** 单选：{@code choices} + {@code choicesTitle}。 */
    public static Map<String, Object> single(String title, List<Map<String, Object>> options) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("choices", options);
        out.put("choicesTitle", title);
        return out;
    }

    /**
     * 多选：一道可以勾好几项的问题（勾完点「确认」）。
     *
     * <p>载体不支持多选时按单选渲染 —— 退化成「只能挑一个」，不会因此报错。
     */
    public static Map<String, Object> multi(String title, List<Map<String, Object>> options) {
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("title", title);
        q.put("multiSelect", Boolean.TRUE);
        q.put("options", options);
        List<Map<String, Object>> questions = new ArrayList<>();
        questions.add(q);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("questions", questions);
        return out;
    }

    /** 一组「值 → 中文标签」快速造选项（顺序保持）。 */
    public static List<Map<String, Object>> optionsOf(Map<String, String> valueToLabel) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, String> e : valueToLabel.entrySet()) {
            out.add(option(e.getValue(), e.getKey()));
        }
        return out;
    }

    /**
     * 「这组候选**必须问**」的标记键。
     *
     * <p><b>为什么要有它</b>：{@code choices} / {@code questions} 承载的是**两件性质相反的事**
     * （见设计文档 §9.2）：
     * <ul>
     *   <li>「我查到几个候选，帮你收窄一下」——用户**只是想问问情况**时不该弹出来；</li>
     *   <li>「不问就办不成」（不给下载按钮 / 不跳转 / 不落库）——必须弹。</li>
     * </ul>
     * 两者**形状完全一样**，代码分不出来，于是编排层过去一律弹 —— 实测用户就是被这个烦到的
     * （问一句「有哪些断货物资」，答完还追一道「挑一件」）。
     *
     * <p><b>所以改成默认不弹</b>：只有显式标了这个键的才弹。
     * 忘了标 = 少给一个可选项（用户还能打字说），比「无谓地甩一张表」代价小得多 —— 两种错不对称。
     */
    public static final String ASK_REQUIRED = "askRequired";

    /** 单选，且**必须问**。用在「不问就拿不到主产物」的地方。 */
    public static Map<String, Object> requiredSingle(String title, List<Map<String, Object>> options) {
        Map<String, Object> out = single(title, options);
        out.put(ASK_REQUIRED, Boolean.TRUE);
        return out;
    }

    /** 多选，且**必须问**。 */
    public static Map<String, Object> requiredMulti(String title, List<Map<String, Object>> options) {
        Map<String, Object> out = multi(title, options);
        out.put(ASK_REQUIRED, Boolean.TRUE);
        return out;
    }
}

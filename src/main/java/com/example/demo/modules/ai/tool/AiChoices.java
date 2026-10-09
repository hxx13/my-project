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
}

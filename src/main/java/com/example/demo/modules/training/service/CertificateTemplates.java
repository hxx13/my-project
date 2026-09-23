package com.example.demo.modules.training.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 培训证书模板（**正文唯一来源**）。
 *
 * 正文逐字取自用户提供的两份扫描件（原文件是图片、无文字层），**内容固定不变**；
 * 只有 姓名 / 培训日期 / 培训者签字 三个变量随人变。
 * H5 学生端与小程序都不再各存一份，统一从 `/api/student/training/certificates` 的 templates 取，
 * PDF 出件也走这里 —— 免得同一份文本在多处漂。
 */
public final class CertificateTemplates {

    /** 设施准入现场培训记录 */
    public static final String T_FACILITY = "FACILITY_ACCESS";
    /** 二氧化碳安乐死培训记录 */
    public static final String T_EUTHANASIA = "EUTHANASIA";
    /** 注射/给药培训记录（正文待用户提供，先占位） */
    public static final String T_INJECTION = "INJECTION";

    private static final List<Map<String, Object>> ALL = List.of(
            template(T_FACILITY,
                    "上海交通大学医学院实验动物设施准入现场培训记录",
                    "Animal Facility Site Training Record",
                    "2.0", "2023年7月1日",
                    "我已经接受上海交通大学医学院实验动物科学部提供的实验动物设施进入程序培训，主要培训内容如下：",
                    List.of(
                            "动物设施的基本结构介绍；",
                            "进入屏障系统的准备工作；",
                            "如何穿戴隔离服以及通过风淋系统进入屏障内进行动物实验： DLAS-SOP-FAC.04 屏障设施人员进出程序；",
                            "在屏障系统内实施动物实验应注意的事项；",
                            "如何将物品及动物传入屏障系统： DLAS-SOP-FAC.05 屏障设施动物传递程序；",
                            "如何将物品及动物传出屏障系统： DLAS-SOP-FAC.05 屏障设施动物传递程序；",
                            "实验结束后如何从屏障系统退出。"),
                    "通过以上的现场培训我已经理解全部的相关SOP以及如何使用屏障系统实施动物实验。我将按照实验动物科学部相关规章制度以及SOP从事动物实验工作。"),
            template(T_EUTHANASIA,
                    "上海交通大学医学院二氧化碳安乐死培训记录",
                    "CO2 Euthanasia Training Record",
                    "1.0", "2015年7月27日",
                    "我已经接受上海交通大学医学院实验动物科学部关于“人道终点”的培训： DLAS-MP-ANIM.13 人道终点”，了解在上海交通大学医学院范围内容的全部动物实验都需要实施“人道终点”。同时接受了实验动物科学部提供的二氧化碳安乐死现场培训，主要培训内容如下：",
                    List.of(
                            "二氧化碳安乐死设备介绍；",
                            "二氧化碳安乐死所适用的动物种类；",
                            "二氧化碳安乐死具体操作方法；",
                            "动物实施安乐死后尸体处理方式。"),
                    "以上全部培训内容涵盖在“DLAS-MP-ANIM.04 小鼠及大鼠的安乐死”以及“DLAS-MP-ANIM.01 动物尸体处理”政策中。通过以上的现场培训我已经理解全部的相关SOP以及规章制度，我将按照实验动物科学部相关规章制度以及SOP从事动物实验工作。"),
            template(T_INJECTION,
                    "上海交通大学医学院实验动物注射给药培训记录",
                    "Animal Injection & Dosing Training Record",
                    "1.0", "—",
                    "（本模板正文待补充：请提供注射/给药培训记录的正式文案与版本号）",
                    List.of(), ""));

    private static final Map<String, Map<String, Object>> BY_KEY = buildIndex();

    private CertificateTemplates() {
    }

    private static Map<String, Map<String, Object>> buildIndex() {
        Map<String, Map<String, Object>> m = new LinkedHashMap<>();
        for (Map<String, Object> t : ALL) {
            m.put(String.valueOf(t.get("key")), t);
        }
        return m;
    }

    /** 全部模板（发给前端渲染用）。 */
    public static List<Map<String, Object>> all() {
        return ALL;
    }

    /** 取模板；未知 key 返回 null（PDF 出件会退化成只印变量）。 */
    public static Map<String, Object> of(String key) {
        return BY_KEY.get(key);
    }

    /** 发证时快照的版本号。 */
    public static String versionOf(String key) {
        Map<String, Object> t = BY_KEY.get(key);
        return t == null ? null : String.valueOf(t.get("version"));
    }

    private static Map<String, Object> template(String key, String titleZh, String titleEn,
                                                 String version, String templateDate,
                                                 String intro, List<String> items, String outro) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("titleZh", titleZh);
        m.put("titleEn", titleEn);
        m.put("version", version);
        m.put("templateDate", templateDate);
        m.put("intro", intro);
        m.put("items", items);
        m.put("outro", outro);
        return m;
    }
}

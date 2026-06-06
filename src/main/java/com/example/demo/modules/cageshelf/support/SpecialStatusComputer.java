package com.example.demo.modules.cageshelf.support;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 笼位特殊状态计算器。
 * 从 cageBoxVo 中提取 6 种特殊状态标记（可多标共存）。
 */
public final class SpecialStatusComputer {

    private SpecialStatusComputer() {
    }

    public static final String CODE_NORMAL = "NORMAL";
    public static final String CODE_COHABITATION = "COHABITATION";
    public static final String CODE_SPECIAL_FEEDING = "SPECIAL_FEEDING";
    public static final String CODE_NEED_DIVIDE = "NEED_DIVIDE";
    public static final String CODE_HEALTH_ABNORMAL = "HEALTH_ABNORMAL";
    public static final String CODE_ANIMAL_TRANSFER = "ANIMAL_TRANSFER";

    /**
     * 从 cageBoxVo 计算特殊状态列表。
     *
     * @param cageBoxVo /back 接口返回的 cageBoxVo 嵌套对象，可能为 null
     * @return 特殊状态列表；cageBoxVo 为 null 或全部标记为 0/空时返回 [NORMAL]
     */
    public static List<SpecialStatusEntry> compute(Map<String, Object> cageBoxVo) {
        if (cageBoxVo == null || cageBoxVo.isEmpty()) {
            return Collections.singletonList(SpecialStatusEntry.NORMAL);
        }

        List<SpecialStatusEntry> results = new ArrayList<>();

        // 合笼/繁殖：closingdate 非空
        if (isNonBlank(cageBoxVo.get("closingdate"))) {
            results.add(new SpecialStatusEntry(
                    CODE_COHABITATION, "合笼/繁殖", "cohabitation", null, null));
        }

        // 特殊饲养：needFeedingYn = 1
        if (isFlagOne(cageBoxVo.get("needFeedingYn"))) {
            String detailName = stringVal(cageBoxVo.get("specialBreedingName"));
            String detailDesc = stringVal(cageBoxVo.get("specialBreedingDescription"));
            results.add(new SpecialStatusEntry(
                    CODE_SPECIAL_FEEDING, "特殊饲养", "feeding", detailName, detailDesc));
        }

        // 请分笼/密度超标：needDivideYn = 1
        if (isFlagOne(cageBoxVo.get("needDivideYn"))) {
            results.add(new SpecialStatusEntry(
                    CODE_NEED_DIVIDE, "请分笼/密度超标", "divide", null, null));
        }

        // 动物健康异常：abnormalHealthYn = 1
        if (isFlagOne(cageBoxVo.get("abnormalHealthYn"))) {
            results.add(new SpecialStatusEntry(
                    CODE_HEALTH_ABNORMAL, "动物健康异常", "health", null, null));
        }

        // 动物转移：needTransferYn = 1
        if (isFlagOne(cageBoxVo.get("needTransferYn"))) {
            results.add(new SpecialStatusEntry(
                    CODE_ANIMAL_TRANSFER, "动物转移", "transfer", null, null));
        }

        if (results.isEmpty()) {
            return Collections.singletonList(SpecialStatusEntry.NORMAL);
        }
        return results;
    }

    // ---- helpers ----

    private static boolean isFlagOne(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Number n) {
            return n.intValue() == 1;
        }
        String s = String.valueOf(v).trim();
        return "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    private static boolean isNonBlank(Object v) {
        if (v == null) {
            return false;
        }
        String s = String.valueOf(v).trim();
        return !s.isEmpty() && !"null".equalsIgnoreCase(s);
    }

    private static String stringVal(Object v) {
        if (v == null) {
            return "";
        }
        return String.valueOf(v).trim();
    }

    /**
     * 单个特殊状态条目。
     */
    public static class SpecialStatusEntry {
        public static final SpecialStatusEntry NORMAL =
                new SpecialStatusEntry(CODE_NORMAL, "正常", "normal", null, null);

        private final String code;
        private final String label;
        private final String iconKey;
        private final String detailName;
        private final String detailDescription;

        public SpecialStatusEntry(String code, String label, String iconKey,
                                   String detailName, String detailDescription) {
            this.code = code;
            this.label = label;
            this.iconKey = iconKey;
            this.detailName = detailName;
            this.detailDescription = detailDescription;
        }

        public String getCode() {
            return code;
        }

        public String getLabel() {
            return label;
        }

        public String getIconKey() {
            return iconKey;
        }

        public String getDetailName() {
            return detailName;
        }

        public String getDetailDescription() {
            return detailDescription;
        }
    }
}

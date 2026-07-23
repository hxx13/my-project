package com.example.demo.modules.telemetry.animalroom.layout;

import com.example.demo.modules.telemetry.animalroom.dto.FacilityLayoutRulesV1;
import com.example.demo.modules.telemetry.animalroom.dto.MpMetricSlotDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpRoomCardDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpSuiteGroupDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 由 {@link FacilityLayoutRulesV1} 派生的可复用谓词/折叠（与 Web 同语义）。
 */
public final class FacilityLayoutRulebook {

    private final FacilityLayoutRulesV1 rules;
    private final List<String> facilityKeywordsSorted;
    private final Collator collator;

    public FacilityLayoutRulebook(FacilityLayoutRulesV1 rules, Collator collator) {
        this.rules = rules;
        this.collator = collator;
        this.facilityKeywordsSorted = sortKeywordsLongestFirst(rules.getFacilitySmallRoomKeywords());
    }

    private static List<String> sortKeywordsLongestFirst(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        List<String> copy = new ArrayList<>(raw);
        copy.sort(Comparator.comparingInt(String::length).reversed().thenComparing(Comparator.naturalOrder()));
        return copy;
    }

    private static boolean facilitySegmentMatchesKeyword(String segment, String keyword) {
        if (segment == null || keyword == null) {
            return false;
        }
        String s = segment.trim();
        if (s.isEmpty()) {
            return false;
        }
        if (s.equals(keyword)) {
            return true;
        }
        if (s.startsWith(keyword) && s.length() > keyword.length()) {
            String rest = s.substring(keyword.length());
            for (int i = 0; i < rest.length(); i++) {
                if (!Character.isDigit(rest.charAt(i))) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    public String facilityRoomCardIdentity(String roomCanonical) {
        if (roomCanonical == null) {
            return "";
        }
        String r = roomCanonical.trim();
        if (r.isEmpty()) {
            return r;
        }
        List<String> parts = new ArrayList<>();
        for (String x : r.split("-")) {
            String t = x.trim();
            if (!t.isEmpty()) {
                parts.add(t);
            }
        }
        if (parts.size() < 2) {
            return r;
        }
        for (int pi = 0; pi < parts.size(); pi++) {
            String seg = parts.get(pi);
            for (String kw : facilityKeywordsSorted) {
                if (!facilitySegmentMatchesKeyword(seg, kw)) {
                    continue;
                }
                if (pi + 1 < parts.size() && parts.get(pi + 1).matches("\\d+")) {
                    return String.join("-", parts.subList(0, pi + 1));
                }
                return String.join("-", parts.subList(0, pi + 1));
            }
        }
        return r;
    }

    public int facilitySlotOrdinalFromRoomCanonical(String roomCanonical) {
        if (roomCanonical == null) {
            return 0;
        }
        String r = roomCanonical.trim();
        if (r.isEmpty()) {
            return 0;
        }
        List<String> parts = new ArrayList<>();
        for (String x : r.split("-")) {
            String t = x.trim();
            if (!t.isEmpty()) {
                parts.add(t);
            }
        }
        for (int pi = 0; pi < parts.size(); pi++) {
            String seg = parts.get(pi);
            for (String kw : facilityKeywordsSorted) {
                if (!facilitySegmentMatchesKeyword(seg, kw)) {
                    continue;
                }
                if (pi + 1 < parts.size() && parts.get(pi + 1).matches("\\d+")) {
                    try {
                        return Integer.parseInt(parts.get(pi + 1));
                    } catch (NumberFormatException e) {
                        return 0;
                    }
                }
                return 0;
            }
        }
        return 0;
    }

    /**
     * 单间卡片内展示顺序：温度(0) → 湿度(1) → 压差/压力(2) → 其它(3)；同档按变量名稳定排序。
     */
    public int roomMetricDisplayRank(MpMetricSlotDto s) {
        if (s == null) {
            return 3;
        }
        String code = s.getMetricKindCode() == null ? "" : s.getMetricKindCode().trim().toUpperCase(Locale.ROOT);
        String lb = s.getMetricKindLabel() == null ? "" : s.getMetricKindLabel().trim();
        if ("TEMP".equals(code) || code.startsWith("TEMP") || lb.contains("温度") || lb.contains("气温")) {
            return 0;
        }
        if ("HUM".equals(code) || "RH".equals(code) || code.startsWith("HUM") || lb.contains("湿度")
                || lb.contains("相对湿度")) {
            return 1;
        }
        if ("PRESSURE".equals(code) || code.startsWith("PRESSURE") || lb.contains("压差") || lb.contains("压力")
                || lb.contains("压强")) {
            return 2;
        }
        return 3;
    }

    public int compareMetricsInFacilityRoom(MpMetricSlotDto a, MpMetricSlotDto b) {
        String ra = a.getItem() != null && a.getItem().getRoomCanonical() != null
                ? a.getItem().getRoomCanonical() : "";
        String rb = b.getItem() != null && b.getItem().getRoomCanonical() != null
                ? b.getItem().getRoomCanonical() : "";
        int oa = facilitySlotOrdinalFromRoomCanonical(ra);
        int ob = facilitySlotOrdinalFromRoomCanonical(rb);
        if (oa != ob) {
            return Integer.compare(oa, ob);
        }
        int rao = roomMetricDisplayRank(a);
        int rbo = roomMetricDisplayRank(b);
        if (rao != rbo) {
            return Integer.compare(rao, rbo);
        }
        String va = a.getItem() != null && a.getItem().getVariableName() != null
                ? a.getItem().getVariableName() : "";
        String vb = b.getItem() != null && b.getItem().getVariableName() != null
                ? b.getItem().getVariableName() : "";
        return collator.compare(va, vb);
    }

    public boolean segmentIndicatesGongShuiSupply(String segment) {
        FacilityLayoutRulesV1.GongShuiConfig g = rules.getGongShui();
        if (segment == null || g == null) {
            return false;
        }
        String s = segment.trim();
        if (s.isEmpty()) {
            return false;
        }
        if (g.getSegmentEquals() != null) {
            for (String eq : g.getSegmentEquals()) {
                if (eq != null && s.equals(eq.trim())) {
                    return true;
                }
            }
        }
        if (g.getSegmentContains() != null) {
            for (String sub : g.getSegmentContains()) {
                if (sub != null && !sub.isEmpty() && s.contains(sub)) {
                    return true;
                }
            }
        }
        return false;
    }

    public boolean roomCanonicalHasGongShuiSupplySegment(String roomCanonical) {
        if (roomCanonical == null || roomCanonical.isBlank()) {
            return false;
        }
        for (String x : roomCanonical.split("-")) {
            if (segmentIndicatesGongShuiSupply(x)) {
                return true;
            }
        }
        return false;
    }

    public boolean metricSlotIsTitleTempPressureMetric(MpMetricSlotDto slot) {
        if (slot == null) {
            return false;
        }
        FacilityLayoutRulesV1.TitleMetricConfig tm = rules.getTitleMetric();
        if (tm == null) {
            return false;
        }
        String code = slot.getMetricKindCode() == null ? "" : slot.getMetricKindCode().trim().toUpperCase(Locale.ROOT);
        if (tm.getKindCodePrefixes() != null) {
            for (String p : tm.getKindCodePrefixes()) {
                if (p == null || p.isEmpty()) {
                    continue;
                }
                String up = p.trim().toUpperCase(Locale.ROOT);
                if (code.equals(up) || code.startsWith(up)) {
                    return true;
                }
            }
        }
        String lb = slot.getMetricKindLabel() == null ? "" : slot.getMetricKindLabel().trim();
        if (tm.getLabelContainsAny() != null) {
            for (String frag : tm.getLabelContainsAny()) {
                if (frag != null && !frag.isEmpty() && lb.contains(frag)) {
                    return true;
                }
            }
        }
        return false;
    }

    public boolean suiteNormExclusiveBasementChromeRow(String suiteNorm) {
        if (suiteNorm == null || suiteNorm.isBlank()) {
            return false;
        }
        FacilityLayoutRulesV1.BasementWebChrome bc = rules.getBasementWebChrome();
        if (bc == null || bc.getExclusiveRowIfSuiteNormContains() == null) {
            return false;
        }
        for (String t : bc.getExclusiveRowIfSuiteNormContains()) {
            if (t != null && !t.isEmpty() && suiteNorm.contains(t)) {
                return true;
            }
        }
        return false;
    }

    public boolean suiteAllowsBoilerSwitchRowMerge(MpSuiteGroupDto suite) {
        if (suite == null || suite.getSuiteNorm() == null) {
            return false;
        }
        String sn = suite.getSuiteNorm();
        FacilityLayoutRulesV1.BasementWebChrome bc = rules.getBasementWebChrome();
        if (bc == null || bc.getBoilerSwitchRowMergeIfSuiteNormContains() == null) {
            return false;
        }
        for (String t : bc.getBoilerSwitchRowMergeIfSuiteNormContains()) {
            if (t != null && !t.isEmpty() && sn.contains(t)) {
                return true;
            }
        }
        return false;
    }

    public boolean suiteContainsAnyToken(MpSuiteGroupDto suite, List<String> tokens) {
        if (suite == null || tokens == null || tokens.isEmpty()) {
            return false;
        }
        String sn = suite.getSuiteNorm() == null ? "" : suite.getSuiteNorm().trim();
        String st = suite.getSuiteTitle() == null ? "" : suite.getSuiteTitle().trim();
        for (String tok : tokens) {
            if (tok == null || tok.isEmpty()) {
                continue;
            }
            if (sn.contains(tok) || st.contains(tok)) {
                return true;
            }
        }
        if (suite.getRooms() != null) {
            for (MpRoomCardDto r : suite.getRooms()) {
                String rc = r.getRoomCanonical();
                if (rc == null) {
                    continue;
                }
                for (String tok : tokens) {
                    if (tok != null && !tok.isEmpty() && rc.contains(tok)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public boolean suiteIsPowerStationSuite(MpSuiteGroupDto suite) {
        FacilityLayoutRulesV1.SuiteRecognition sr = rules.getSuiteRecognition();
        if (sr == null || sr.getPowerStation() == null) {
            return false;
        }
        return suiteContainsAnyToken(suite, sr.getPowerStation().getTokens());
    }

    public boolean suiteIsBoilerRoomSuite(MpSuiteGroupDto suite) {
        FacilityLayoutRulesV1.SuiteRecognition sr = rules.getSuiteRecognition();
        if (sr == null || sr.getBoilerRoom() == null) {
            return false;
        }
        return suiteContainsAnyToken(suite, sr.getBoilerRoom().getTokens());
    }

    /** 状态测点：不参与标题行「单测点升入」时保留在房间内（与 Assembler 静态逻辑一致） */
    public static boolean isStatusMetricKind(TelemetryTagItemDto it) {
        String mk = it.getMetricKindCode();
        if (mk != null && "STATUS".equalsIgnoreCase(mk.trim())) {
            return true;
        }
        String ml = it.getMetricKindLabel();
        return ml != null && "状态".equals(ml.trim());
    }

    public FacilityLayoutRulesV1 getRules() {
        return rules;
    }
}

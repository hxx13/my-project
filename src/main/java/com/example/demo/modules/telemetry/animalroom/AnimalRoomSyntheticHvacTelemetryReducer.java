package com.example.demo.modules.telemetry.animalroom;

import com.example.demo.modules.telemetry.animalroom.dto.MpChromeCellDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpMetricSlotDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpPreparedSuiteDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpRoomCardDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpStructuredTabDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpSuiteGroupDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpViewChunkDto;
import com.example.demo.modules.telemetry.animalroom.dto.AnimalRoomTelemetryPageDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 小程序「机房」Tab 专用分块：与 {@code animalRoomHvacUnits.js} / Web {@code animalTelemetryHvacUnits.ts}
 * 同源字符串规则（FAU/PAU/AHU/MAU、锅炉、动力站），一次 assemble 后仅下发机房相关块与 tagItems，避免逐层拉整层无关变量。
 */
public final class AnimalRoomSyntheticHvacTelemetryReducer {

    public static final String SYNTHETIC_HVAC_TAB_KEY = "__hvac_units__";

    private AnimalRoomSyntheticHvacTelemetryReducer() {
    }

    public static boolean isSyntheticHvacTabKey(String k) {
        if (k == null || k.isBlank()) {
            return false;
        }
        return SYNTHETIC_HVAC_TAB_KEY.equalsIgnoreCase(k.trim());
    }

    private static String hay(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p != null && !p.isBlank()) {
                sb.append(p.trim()).append(' ');
            }
        }
        return sb.toString().toUpperCase(Locale.ROOT);
    }

    private static boolean haystackIndicatesHvacMechanical(String hay) {
        if (hay == null || hay.isBlank()) {
            return false;
        }
        String u = hay.toUpperCase(Locale.ROOT);
        return u.contains("FAU") || u.contains("PAU") || u.contains("AHU") || u.contains("MAU")
                || u.contains("锅炉") || u.contains("动力站");
    }

    private static boolean isHvacMechanicalSuitePrepared(MpPreparedSuiteDto prepared) {
        if (prepared == null || prepared.getSuite() == null) {
            return false;
        }
        MpSuiteGroupDto s = prepared.getSuite();
        List<String> parts = new ArrayList<>();
        if (StringUtils.hasText(s.getSuiteNorm())) {
            parts.add(s.getSuiteNorm().trim());
        }
        if (StringUtils.hasText(s.getSuiteTitle())) {
            parts.add(s.getSuiteTitle().trim());
        }
        if (s.getRooms() != null) {
            for (MpRoomCardDto r : s.getRooms()) {
                if (r != null && StringUtils.hasText(r.getRoomCanonical())) {
                    parts.add(r.getRoomCanonical().trim());
                }
            }
        }
        return haystackIndicatesHvacMechanical(String.join(" ", parts));
    }

    private static boolean microRoomCardIsHvacMechanical(MpRoomCardDto card) {
        if (card == null) {
            return false;
        }
        return haystackIndicatesHvacMechanical(hay(card.getDisplayTitle(), card.getRoomCanonical()));
    }

    private static boolean hubChromeCellIsHvac(MpChromeCellDto cell) {
        if (cell == null) {
            return false;
        }
        if (cell.getPrepared() != null && isHvacMechanicalSuitePrepared(cell.getPrepared())) {
            return true;
        }
        List<MpPreparedSuiteDto> side = cell.getWebSidecarPreparedSuites();
        if (cell.getPrepared() == null && side != null && !side.isEmpty()) {
            return side.stream().allMatch(AnimalRoomSyntheticHvacTelemetryReducer::isHvacMechanicalSuitePrepared);
        }
        return false;
    }

    private static List<MpChromeCellDto> splitHvacChromeList(List<MpChromeCellDto> list) {
        List<MpChromeCellDto> hvac = new ArrayList<>();
        if (list == null) {
            return hvac;
        }
        for (MpChromeCellDto cell : list) {
            if (hubChromeCellIsHvac(cell)) {
                hvac.add(cell);
            }
        }
        return hvac;
    }

    /** 单层 viewChunks 中仅保留机房相关块（与 extractHvacOnlyHubChunks 对齐） */
    public static List<MpViewChunkDto> extractHvacOnlyHubChunks(List<MpViewChunkDto> chunks) {
        List<MpViewChunkDto> out = new ArrayList<>();
        if (chunks == null) {
            return out;
        }
        for (MpViewChunkDto ch : chunks) {
            if (ch == null) {
                continue;
            }
            if ("suite".equals(ch.getKind()) && ch.getPrepared() != null && isHvacMechanicalSuitePrepared(ch.getPrepared())) {
                out.add(ch);
                continue;
            }
            if ("chromeSuiteRow".equals(ch.getKind()) && ch.getList() != null && !ch.getList().isEmpty()) {
                List<MpChromeCellDto> hvac = splitHvacChromeList(ch.getList());
                if (!hvac.isEmpty()) {
                    String baseKey = ch.getKey() != null ? ch.getKey() : "chrome";
                    out.add(MpViewChunkDto.builder()
                            .kind("chromeSuiteRow")
                            .key(baseKey + "-hvac")
                            .suiteHalfRow(ch.getSuiteHalfRow())
                            .suiteLatestText(ch.getSuiteLatestText())
                            .rowKind(ch.getRowKind())
                            .list(new ArrayList<>(hvac))
                            .build());
                }
            }
        }
        return out;
    }

    private static void walkPreparedVariableNames(MpPreparedSuiteDto p, Set<String> out) {
        if (p == null) {
            return;
        }
        if (p.getTitleSlots() != null) {
            for (MpMetricSlotDto s : p.getTitleSlots()) {
                if (s != null && s.getItem() != null && StringUtils.hasText(s.getItem().getVariableName())) {
                    out.add(s.getItem().getVariableName().trim());
                }
            }
        }
        if (p.getVisibleRooms() != null) {
            for (MpRoomCardDto room : p.getVisibleRooms()) {
                if (room == null || room.getMetrics() == null) {
                    continue;
                }
                for (MpMetricSlotDto m : room.getMetrics()) {
                    if (m != null && m.getItem() != null && StringUtils.hasText(m.getItem().getVariableName())) {
                        out.add(m.getItem().getVariableName().trim());
                    }
                }
            }
        }
    }

    private static void walkChunkVariableNames(MpViewChunkDto ch, Set<String> out) {
        if (ch == null) {
            return;
        }
        if ("zoneBand".equals(ch.getKind()) || "zoneCard".equals(ch.getKind())) {
            return;
        }
        if ("suite".equals(ch.getKind()) && ch.getPrepared() != null) {
            walkPreparedVariableNames(ch.getPrepared(), out);
            return;
        }
        if ("chromeSuiteRow".equals(ch.getKind()) && ch.getList() != null) {
            for (MpChromeCellDto cell : ch.getList()) {
                if (cell == null) {
                    continue;
                }
                if (cell.getPrepared() != null) {
                    walkPreparedVariableNames(cell.getPrepared(), out);
                }
                if (cell.getWebSidecarPreparedSuites() != null) {
                    for (MpPreparedSuiteDto p : cell.getWebSidecarPreparedSuites()) {
                        walkPreparedVariableNames(p, out);
                    }
                }
                if (cell.getWebSoloMicroGrid() != null) {
                    for (MpRoomCardDto card : cell.getWebSoloMicroGrid()) {
                        if (card == null || card.getMetrics() == null) {
                            continue;
                        }
                        for (MpMetricSlotDto m : card.getMetrics()) {
                            if (m != null && m.getItem() != null && StringUtils.hasText(m.getItem().getVariableName())) {
                                out.add(m.getItem().getVariableName().trim());
                            }
                        }
                    }
                }
            }
        }
    }

    private static Set<String> collectVariableNamesFromHubChunks(List<MpViewChunkDto> chunks) {
        Set<String> out = new HashSet<>();
        if (chunks == null) {
            return out;
        }
        for (MpViewChunkDto ch : chunks) {
            walkChunkVariableNames(ch, out);
        }
        return out;
    }

    /**
     * 与 Web buildSyntheticHvacHubTab（emitSourceTabBands=true）一致：各层 zoneBand + 机房块。
     */
    public static List<MpViewChunkDto> buildSyntheticHvacHubViewChunks(List<MpStructuredTabDto> baseTabs) {
        List<MpViewChunkDto> outChunks = new ArrayList<>();
        if (baseTabs == null) {
            return outChunks;
        }
        boolean any = false;
        for (MpStructuredTabDto tab : baseTabs) {
            if (tab == null || !StringUtils.hasText(tab.getTabKey())) {
                continue;
            }
            String tk = tab.getTabKey().trim();
            if (isSyntheticHvacTabKey(tk)) {
                continue;
            }
            List<MpViewChunkDto> hv = extractHvacOnlyHubChunks(tab.getViewChunks());
            if (hv.isEmpty()) {
                continue;
            }
            any = true;
            String title = StringUtils.hasText(tab.getTitle()) ? tab.getTitle().trim() : tk;
            outChunks.add(MpViewChunkDto.builder()
                    .kind("zoneBand")
                    .key("hvac-band-" + tk)
                    .zoneLabel(title)
                    .build());
            outChunks.addAll(hv);
        }
        if (!any) {
            return List.of();
        }
        return outChunks;
    }

    /**
     * 生成「机房专用」页：tabs 仅保留各层元数据 + 空 viewChunks（体积极小）；机房渲染走 {@link AnimalRoomTelemetryPageDto#getHvacMechanicalHubViewChunks()}。
     */
    public static AnimalRoomTelemetryPageDto toHvacMechanicalDetailPage(AnimalRoomTelemetryPageDto full) {
        if (full == null) {
            return null;
        }
        List<MpStructuredTabDto> summaryTabs = new ArrayList<>();
        if (full.getTabs() != null) {
            for (MpStructuredTabDto t : full.getTabs()) {
                if (t == null) {
                    continue;
                }
                summaryTabs.add(MpStructuredTabDto.builder()
                        .tabKey(t.getTabKey())
                        .title(t.getTitle())
                        .roomCount(t.getRoomCount())
                        .suiteCount(t.getSuiteCount())
                        .viewChunks(List.of())
                        .build());
            }
        }
        List<MpViewChunkDto> hubChunks = buildSyntheticHvacHubViewChunks(full.getTabs());
        Set<String> want = collectVariableNamesFromHubChunks(hubChunks);
        List<TelemetryTagItemDto> items = new ArrayList<>();
        if (full.getTagItems() != null) {
            for (TelemetryTagItemDto it : full.getTagItems()) {
                if (it == null || !StringUtils.hasText(it.getVariableName())) {
                    continue;
                }
                if (want.contains(it.getVariableName().trim())) {
                    items.add(it);
                }
            }
        }
        return full.toBuilder()
                .tabs(summaryTabs)
                .hvacMechanicalHubViewChunks(hubChunks)
                .tagItems(items)
                .build();
    }
}

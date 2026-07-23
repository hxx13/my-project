package com.example.demo.modules.telemetry.animalroom;

import com.example.demo.modules.telemetry.animalroom.dto.AnimalRoomTelemetryPageDto;
import com.example.demo.modules.telemetry.animalroom.dto.MpStructuredTabDto;
import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;

import java.util.ArrayList;
import java.util.List;

/**
 * 缩小 GET /animal-room 响应体积，避免微信小程序经云函数转发时超出 CloudBase 约 1MB 回包上限。
 */
public final class AnimalRoomTelemetryPageReducer {

    private AnimalRoomTelemetryPageReducer() {
    }

    public static AnimalRoomTelemetryPageDto toSummaryOnly(AnimalRoomTelemetryPageDto src) {
        if (src == null) {
            return null;
        }
        List<MpStructuredTabDto> tabs = new ArrayList<>();
        if (src.getTabs() != null) {
            for (MpStructuredTabDto t : src.getTabs()) {
                tabs.add(MpStructuredTabDto.builder()
                        .tabKey(t.getTabKey())
                        .title(t.getTitle())
                        .roomCount(t.getRoomCount())
                        .suiteCount(t.getSuiteCount())
                        .viewChunks(List.of())
                        .build());
            }
        }
        return src.toBuilder()
                .tabs(tabs)
                .tagItems(List.of())
                .build();
    }

    public static AnimalRoomTelemetryPageDto forSingleStructuredTab(AnimalRoomTelemetryPageDto src, String telemetryTabKey) {
        if (src == null) {
            return null;
        }
        String key = telemetryTabKey == null ? "" : telemetryTabKey.trim();
        if (key.isEmpty()) {
            return src.toBuilder().tabs(List.of()).tagItems(List.of()).build();
        }
        List<MpStructuredTabDto> matchedTabs = new ArrayList<>();
        if (src.getTabs() != null) {
            for (MpStructuredTabDto t : src.getTabs()) {
                if (t.getTabKey() != null && t.getTabKey().trim().equalsIgnoreCase(key)) {
                    matchedTabs.add(t);
                }
            }
        }
        List<TelemetryTagItemDto> items = new ArrayList<>();
        if (src.getTagItems() != null) {
            for (TelemetryTagItemDto it : src.getTagItems()) {
                if (AnimalRoomHubAssembler.itemMatchesStructuredTelemetryTab(it, key)) {
                    items.add(it);
                }
            }
        }
        return src.toBuilder()
                .tabs(matchedTabs)
                .tagItems(items)
                .build();
    }
}

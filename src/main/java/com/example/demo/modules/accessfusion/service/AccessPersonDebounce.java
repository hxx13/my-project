package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessRawEvent;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 按刷卡人实体 + 通道计算去抖被丢弃的记录 ID（与推断引擎同一套键规则）。 */
final class AccessPersonDebounce {

    private AccessPersonDebounce() {}

    static Set<String> droppedRecordIds(List<AccessRawEvent> events, int taskDebounceSeconds) {
        if (events == null || events.isEmpty()) {
            return Set.of();
        }
        List<AccessRawEvent> sorted = new ArrayList<>(events);
        sorted.sort(Comparator.comparing(
                AccessRawEvent::getSwingTime, Comparator.nullsLast(Comparator.naturalOrder())));

        Set<String> dropped = new LinkedHashSet<>();
        Map<String, AccessRawEvent> lastByPersonChannel = new HashMap<>();
        int sec = taskDebounceSeconds > 0 ? taskDebounceSeconds : 45;
        for (AccessRawEvent e : sorted) {
            String key = AccessPersonIdentity.personChannelDebounceKey(e);
            AccessRawEvent last = lastByPersonChannel.get(key);
            if (last != null
                    && last.getSwingTime() != null
                    && e.getSwingTime() != null
                    && e.getSwingTime().isBefore(last.getSwingTime().plusSeconds(sec))) {
                if (e.getRecordId() != null && !e.getRecordId().isBlank()) {
                    dropped.add(e.getRecordId());
                }
                continue;
            }
            lastByPersonChannel.put(key, e);
        }
        return dropped;
    }
}

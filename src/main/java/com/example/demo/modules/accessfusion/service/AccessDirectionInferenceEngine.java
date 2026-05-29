package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessDoorRule;
import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.accessfusion.model.InferredAccessEvent;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class AccessDirectionInferenceEngine {

    public List<InferredAccessEvent> infer(
            List<AccessRawEvent> rawEvents,
            Map<String, AccessDoorRule> rulesByChannel,
            AccessFusionRoomResolver roomResolver) {
        return infer(rawEvents, rulesByChannel, roomResolver, 45);
    }

    public List<InferredAccessEvent> infer(
            List<AccessRawEvent> rawEvents,
            Map<String, AccessDoorRule> rulesByChannel,
            AccessFusionRoomResolver roomResolver,
            int taskDebounceSeconds) {
        if (rawEvents == null || rawEvents.isEmpty()) {
            return List.of();
        }
        List<AccessRawEvent> sorted = new ArrayList<>(rawEvents);
        sorted.sort(Comparator.comparing(AccessRawEvent::getSwingTime, Comparator.nullsLast(Comparator.naturalOrder())));

        Map<String, List<AccessRawEvent>> byUserDay = new HashMap<>();
        for (AccessRawEvent r : sorted) {
            if (r.getSwingTime() == null) {
                continue;
            }
            String key = AccessPersonIdentity.personIdentityKey(r) + "|" + LocalDate.from(r.getSwingTime());
            byUserDay.computeIfAbsent(key, k -> new ArrayList<>()).add(r);
        }

        List<InferredAccessEvent> out = new ArrayList<>();
        for (List<AccessRawEvent> group : byUserDay.values()) {
            out.addAll(inferUserDay(group, rulesByChannel, roomResolver, taskDebounceSeconds));
        }
        out.sort(Comparator.comparing(e -> e.eventTime, Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }

    private List<InferredAccessEvent> inferUserDay(
            List<AccessRawEvent> events,
            Map<String, AccessDoorRule> rulesByChannel,
            AccessFusionRoomResolver roomResolver,
            int taskDebounceSeconds) {
        List<AccessRawEvent> debounced = debounce(events, rulesByChannel, taskDebounceSeconds);
        Map<String, Boolean> insideByZone = new HashMap<>();
        List<InferredAccessEvent> inferred = new ArrayList<>();
        int debounceSec = taskDebounceSeconds > 0 ? taskDebounceSeconds : 45;

        for (AccessRawEvent raw : debounced) {
            InferredAccessEvent ev = new InferredAccessEvent();
            ev.raw = raw;
            ev.eventTime = raw.getSwingTime();
            AccessDoorRule rule = rulesByChannel.get(raw.getChannelCode());
            String doorMode = resolveDoorMode(rule, raw);

            AccessFusionRoomResolver.RoomCtx room = roomResolver.resolve(raw.getChannelCode());
            if (room != null) {
                ev.roomId = room.roomId();
                ev.roomName = room.roomName();
                ev.areaName = room.areaName();
                ev.floorName = room.floorName();
            } else {
                ev.roomName = raw.getChannelName();
                ev.areaName = "未映射区域";
            }
            ev.projectGroupNames = roomResolver.projectGroupsForUser(raw.getMappingUserId());

            String zoneKey = zoneKey(ev);
            boolean inside = insideByZone.getOrDefault(zoneKey, false);

            if ("DAHUA_ENTER_EXIT".equals(doorMode)) {
                Integer dahua = raw.getDahuaEnterOrExit();
                String nativeDir =
                        dahua == null
                                ? null
                                : dahua == 1 ? "ENTER" : dahua == 2 ? "EXIT" : null;
                if (nativeDir != null) {
                    ev.direction = nativeDir;
                    ev.accessType = "ENTER".equals(nativeDir) ? 1 : 2;
                    ev.inferenceMethod = "DAHUA_NATIVE";
                    ev.confidence = 96;
                    insideByZone.put(zoneKey, "ENTER".equals(nativeDir));
                } else {
                    ev.direction = "ENTER";
                    ev.accessType = 1;
                    ev.inferenceMethod = "DAHUA_NATIVE";
                    ev.confidence = 50;
                    ev.flags.add("DAHUA_DIRECTION_MISSING");
                    ev.needsReview = true;
                    insideByZone.put(zoneKey, true);
                }
            } else if ("ENTRY_ONLY".equals(doorMode)) {
                ev.direction = "ENTER";
                ev.accessType = 1;
                ev.inferenceMethod = "DOOR_RULE";
                ev.confidence = 95;
                insideByZone.put(zoneKey, true);
            } else if ("EXIT_ONLY".equals(doorMode)) {
                ev.direction = "EXIT";
                ev.accessType = 2;
                ev.inferenceMethod = "DOOR_RULE";
                ev.confidence = 95;
                insideByZone.put(zoneKey, false);
                if (!inside) {
                    ev.flags.add("UNPAIRED_EXIT");
                    ev.needsReview = true;
                }
            } else {
                if (!inside) {
                    ev.direction = "ENTER";
                    ev.accessType = 1;
                    ev.inferenceMethod = "TOGGLE_STATE";
                    ev.confidence = 85;
                    insideByZone.put(zoneKey, true);
                } else {
                    ev.direction = "EXIT";
                    ev.accessType = 2;
                    ev.inferenceMethod = "TOGGLE_STATE";
                    ev.confidence = 85;
                    insideByZone.put(zoneKey, false);
                }
            }

            if (!"DAHUA_ENTER_EXIT".equals(doorMode)) {
                alignWithDahuaNative(ev, raw);
            }
            if (ev.confidence < 70) {
                ev.needsReview = true;
            }
            inferred.add(ev);
        }

        markRapidRepeats(inferred, debounceSec);
        return inferred;
    }

    private static void alignWithDahuaNative(InferredAccessEvent ev, AccessRawEvent raw) {
        Integer dahua = raw.getDahuaEnterOrExit();
        if (dahua == null) {
            return;
        }
        String nativeDir = dahua == 1 ? "ENTER" : dahua == 2 ? "EXIT" : null;
        if (nativeDir == null) {
            return;
        }
        if (nativeDir.equals(ev.direction)) {
            ev.confidence = Math.min(100, ev.confidence + 8);
            if ("TOGGLE_STATE".equals(ev.inferenceMethod)) {
                ev.inferenceMethod = "DAHUA_NATIVE";
            }
        } else {
            ev.flags.add("DAHUA_CONFLICT");
            ev.needsReview = true;
        }
    }

    private static void markRapidRepeats(List<InferredAccessEvent> inferred, int debounceSec) {
        for (int i = 1; i < inferred.size(); i++) {
            InferredAccessEvent prev = inferred.get(i - 1);
            InferredAccessEvent cur = inferred.get(i);
            if (samePerson(prev.raw, cur.raw)
                    && prev.raw.getChannelCode().equals(cur.raw.getChannelCode())
                    && prev.direction.equals(cur.direction)
                    && prev.eventTime != null
                    && cur.eventTime != null
                    && cur.eventTime.isBefore(prev.eventTime.plusSeconds(debounceSec))) {
                cur.flags.add("RAPID_REPEAT");
                cur.confidence = Math.max(40, cur.confidence - 15);
                cur.needsReview = true;
            }
        }
    }

    private static List<AccessRawEvent> debounce(
            List<AccessRawEvent> events, Map<String, AccessDoorRule> rules, int taskDebounceSeconds) {
        List<AccessRawEvent> out = new ArrayList<>();
        Map<String, AccessRawEvent> lastByPersonChannel = new HashMap<>();
        int defaultSec = taskDebounceSeconds > 0 ? taskDebounceSeconds : 45;
        for (AccessRawEvent e : events) {
            String key = AccessPersonIdentity.personChannelDebounceKey(e);
            AccessRawEvent last = lastByPersonChannel.get(key);
            if (last != null
                    && last.getSwingTime() != null
                    && e.getSwingTime() != null
                    && e.getSwingTime().isBefore(last.getSwingTime().plusSeconds(defaultSec))) {
                continue;
            }
            out.add(e);
            lastByPersonChannel.put(key, e);
        }
        return out;
    }

    private static boolean samePerson(AccessRawEvent a, AccessRawEvent b) {
        return AccessPersonIdentity.personIdentityKey(a).equals(AccessPersonIdentity.personIdentityKey(b));
    }

    /**
     * 无门规则或仍为正反切换时：若大华已带 enter_or_exit，一律按大华进出推断（单门双向场景）。
     */
    private static String resolveDoorMode(AccessDoorRule rule, AccessRawEvent raw) {
        if (raw.getDahuaEnterOrExit() != null) {
            return "DAHUA_ENTER_EXIT";
        }
        if (rule != null && StringUtils.hasText(rule.getDoorMode())) {
            String mode = rule.getDoorMode().trim();
            if (!"BIDIRECTIONAL_TOGGLE".equals(mode)) {
                return mode;
            }
        }
        return "BIDIRECTIONAL_TOGGLE";
    }

    private static String zoneKey(InferredAccessEvent ev) {
        if (ev.roomId != null && !ev.roomId.isBlank()) {
            return "room:" + ev.roomId;
        }
        return "ch:" + ev.raw.getChannelCode();
    }

    public List<AccessVisitRoundDraft> buildVisitRounds(List<InferredAccessEvent> events) {
        Map<String, List<InferredAccessEvent>> byUserRoom = new HashMap<>();
        for (InferredAccessEvent e : events) {
            String rk = e.roomId != null ? e.roomId : e.raw.getChannelCode();
            byUserRoom.computeIfAbsent(e.raw.getMappingUserId() + "|" + rk, k -> new ArrayList<>()).add(e);
        }
        List<AccessVisitRoundDraft> rounds = new ArrayList<>();
        for (List<InferredAccessEvent> list : byUserRoom.values()) {
            list.sort(Comparator.comparing(x -> x.eventTime));
            boolean inside = false;
            InferredAccessEvent openEnter = null;
            for (InferredAccessEvent e : list) {
                if (e.accessType == 1) {
                    if (!inside) {
                        inside = true;
                        openEnter = e;
                    }
                } else if (e.accessType == 2) {
                    if (inside && openEnter != null) {
                        rounds.add(new AccessVisitRoundDraft(openEnter, e, "COMPLETE"));
                        inside = false;
                        openEnter = null;
                    } else {
                        rounds.add(new AccessVisitRoundDraft(null, e, "ORPHAN_EXIT"));
                    }
                }
            }
            if (inside && openEnter != null) {
                rounds.add(new AccessVisitRoundDraft(openEnter, null, "OPEN"));
            }
        }
        return rounds;
    }

    public record AccessVisitRoundDraft(InferredAccessEvent enter, InferredAccessEvent exit, String status) {}
}

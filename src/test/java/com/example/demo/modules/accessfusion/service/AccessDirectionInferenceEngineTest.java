package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessDoorRule;
import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.accessfusion.model.InferredAccessEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccessDirectionInferenceEngineTest {

  @Mock private AccessFusionRoomResolver roomResolver;

  private final AccessDirectionInferenceEngine engine = new AccessDirectionInferenceEngine();

  @BeforeEach
  void stubRoom() {
    lenient()
        .when(roomResolver.resolve(anyString()))
        .thenAnswer(
            inv ->
                new AccessFusionRoomResolver.RoomCtx(
                    inv.getArgument(0), "room1", "测试房", "浦东", "2F"));
    lenient().when(roomResolver.projectGroupsForUser(anyString())).thenReturn(null);
  }

  @Test
  void toggleDoor_firstSwipeIsEnter() {
    AccessRawEvent raw = raw("u1", "CH1", LocalDateTime.of(2026, 5, 17, 9, 0));
    AccessDoorRule rule = rule("CH1", "BIDIRECTIONAL_TOGGLE");
    List<InferredAccessEvent> inferred =
        engine.infer(List.of(raw), Map.of("CH1", rule), roomResolver);
    assertEquals(1, inferred.size());
    assertEquals("ENTER", inferred.get(0).direction);
    assertEquals(1, inferred.get(0).accessType);
  }

  @Test
  void toggleDoor_secondSwipeIsExit() {
    AccessRawEvent r1 = raw("u1", "CH1", LocalDateTime.of(2026, 5, 17, 9, 0));
    AccessRawEvent r2 = raw("u1", "CH1", LocalDateTime.of(2026, 5, 17, 10, 0));
    AccessDoorRule rule = rule("CH1", "BIDIRECTIONAL_TOGGLE");
    List<InferredAccessEvent> inferred =
        engine.infer(List.of(r1, r2), Map.of("CH1", rule), roomResolver);
    assertEquals(2, inferred.size());
    assertEquals("EXIT", inferred.get(1).direction);
  }

  @Test
  void entryOnlyDoor_alwaysEnter() {
    AccessRawEvent raw = raw("u1", "IN1", LocalDateTime.of(2026, 5, 17, 8, 0));
    AccessDoorRule rule = rule("IN1", "ENTRY_ONLY");
    List<InferredAccessEvent> inferred =
        engine.infer(List.of(raw), Map.of("IN1", rule), roomResolver);
    assertEquals("ENTER", inferred.get(0).direction);
    assertTrue(inferred.get(0).confidence >= 90);
  }

  @Test
  void debounce_collapsesRapidRepeats() {
    AccessRawEvent r1 = raw("u1", "CH1", LocalDateTime.of(2026, 5, 17, 9, 0, 0));
    AccessRawEvent r2 = raw("u1", "CH1", LocalDateTime.of(2026, 5, 17, 9, 0, 20));
    AccessDoorRule rule = rule("CH1", "BIDIRECTIONAL_TOGGLE");
    rule.setDebounceSeconds(45);
    List<InferredAccessEvent> inferred =
        engine.infer(List.of(r1, r2), Map.of("CH1", rule), roomResolver);
    assertEquals(1, inferred.size());
  }

  private static AccessRawEvent raw(String userId, String channel, LocalDateTime time) {
    return raw(userId, channel, time, 0);
  }

  private static AccessRawEvent raw(
      String userId, String channel, LocalDateTime time, int second) {
    AccessRawEvent r = new AccessRawEvent();
    r.setId(1L);
    r.setMappingUserId(userId);
    r.setChannelCode(channel);
    r.setSwingTime(time.withSecond(second));
    r.setOpenResult(1);
    return r;
  }

  private static AccessDoorRule rule(String ch, String mode) {
    AccessDoorRule r = new AccessDoorRule();
    r.setChannelCode(ch);
    r.setDoorMode(mode);
    r.setDebounceSeconds(45);
    return r;
  }
}

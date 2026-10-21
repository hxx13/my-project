package com.example.demo.modules.telemetry.animalroom;

import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 变量级「显示在动物房页」开关：隐藏行留在快照里，但不产生楼层页签。 */
class AnimalRoomHubAssemblerVisibilityTest {

    private static TelemetryTagItemDto item(Boolean visible) {
        return TelemetryTagItemDto.builder()
                .variableName("2F-201-温度")
                .floorCode("2F")
                .roomCanonical("2F-201")
                .metricKindCode("TEMP")
                .showInAnimalRoom(visible)
                .build();
    }

    @Test
    void hiddenVariableKeepsSnapshotRowButGetsNoAnimalRoomTab() {
        TelemetryTagItemDto hidden = item(false);
        assertEquals(Boolean.FALSE, hidden.getShowInAnimalRoom());
        assertFalse(AnimalRoomHubAssembler.isVisibleInAnimalRoom(hidden));
        assertNull(AnimalRoomHubAssembler.structuredTelemetryTabKeyForItem(hidden));
    }

    @Test
    void missingOrTrueFlagIsVisible() {
        assertTrue(AnimalRoomHubAssembler.isVisibleInAnimalRoom(item(null)));
        assertEquals("2F", AnimalRoomHubAssembler.structuredTelemetryTabKeyForItem(item(null)));
        assertEquals("2F", AnimalRoomHubAssembler.structuredTelemetryTabKeyForItem(item(true)));
    }
}

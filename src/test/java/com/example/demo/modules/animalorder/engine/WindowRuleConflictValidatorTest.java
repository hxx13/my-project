package com.example.demo.modules.animalorder.engine;

import com.example.demo.common.exception.TwinBusinessException;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;

class WindowRuleConflictValidatorTest {

    @Test
    void oppositeOverlap_rejected() {
        var open = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
                LocalTime.of(9, 0), LocalTime.of(17, 0));
        var disable = AnimalOrderTimeModels.daily("GLOBAL", null, "DISABLE",
                LocalTime.of(12, 0), LocalTime.of(13, 0));
        assertThrows(TwinBusinessException.class,
                () -> WindowRuleConflictValidator.validateNoOppositeOverlap(List.of(open, disable)));
    }

    @Test
    void sameEffectOverlap_allowed() {
        var a = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
                LocalTime.of(9, 0), LocalTime.of(12, 0));
        var b = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
                LocalTime.of(11, 0), LocalTime.of(17, 0));
        WindowRuleConflictValidator.validateNoOppositeOverlap(List.of(a, b)); // no throw
    }
}

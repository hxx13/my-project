package com.example.demo.modules.twin.dashboard.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InteractiveChallengeVerifierTest {

    @Test
    void acceptsExactAnswer() {
        assertTrue
                (InteractiveChallengeVerifier.matches("按时签退，人走灯灭", "按时签退，人走灯灭"));
    }

    @Test
    void toleratesSurroundingWhitespace() {
        assertTrue(InteractiveChallengeVerifier.matches("  按时签退  ", "按时签退"));
        assertTrue(InteractiveChallengeVerifier.matches("按时签退", "  按时签退  "));
    }

    @Test
    void rejectsNullAnswer() {
        assertFalse(InteractiveChallengeVerifier.matches("按时签退", null));
    }

    @Test
    void rejectsWrongAnswer() {
        assertFalse(InteractiveChallengeVerifier.matches("按时签退", "随便写的"));
    }

    @Test
    void rejectsAnswerMissingPunctuation() {
        // 前端逐字取自 phrase，标点也是一张卡片，因此必须逐字符相等
        assertFalse(InteractiveChallengeVerifier.matches("按时签退，人走灯灭", "按时签退人走灯灭"));
    }

    @Test
    void rejectsWhenExpectedIsBlank() {
        assertFalse(InteractiveChallengeVerifier.matches("", ""));
        assertFalse(InteractiveChallengeVerifier.matches(null, "任意"));
        assertFalse(InteractiveChallengeVerifier.matches("   ", "   "));
    }
}

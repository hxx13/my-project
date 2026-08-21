package com.example.demo.modules.twin.obligation.disposition;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QuizBankTest {

    private final ObjectMapper om = new ObjectMapper();

    @Test
    void drawRespectsCountAndHidesAnswers() {
        List<Map<String, Object>> drawn = QuizBank.drawPublic(QuizBank.DEFAULT_BANK_ID, 3);
        assertEquals(3, drawn.size());
        for (Map<String, Object> q : drawn) {
            assertTrue(q.containsKey("id"));
            assertTrue(q.containsKey("prompt"));
            assertTrue(q.containsKey("options"));
            assertFalse(q.containsKey("correctIndex"));
        }
    }

    @Test
    void gradeCountsCorrectAnswers() {
        int n = QuizBank.grade(QuizBank.DEFAULT_BANK_ID, Map.of("q1", 0, "q2", 0));
        assertEquals(2, n);
        assertEquals(0, QuizBank.grade(QuizBank.DEFAULT_BANK_ID, Map.of("q1", 3)));
    }

    @Test
    void quizGradeSupportUsesPassCount() throws Exception {
        String cfg = "{\"questionBankId\":\"default\",\"passCount\":2}";
        String ok = om.writeValueAsString(Map.of("answers", Map.of("q1", 0, "q2", 0)));
        String bad = om.writeValueAsString(Map.of("answers", Map.of("q1", 0)));
        assertTrue(QuizGradeSupport.passed(om, cfg, ok));
        assertFalse(QuizGradeSupport.passed(om, cfg, bad));
    }
}

package com.example.demo.modules.twin.obligation.disposition;

import com.example.demo.modules.twin.obligation.support.ObligationSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DispositionStrategyRegistryTest {

    private DispositionStrategyRegistry registry;

    @BeforeEach
    void setUp() {
        ObjectMapper om = new ObjectMapper();
        registry = new DispositionStrategyRegistry(List.of(
                new ShowOnlyDispositionStrategy(),
                new AckReadDispositionStrategy(),
                new AckPuzzleDispositionStrategy(om),
                new QuizDispositionStrategy(om),
                new SignatureDispositionStrategy(om)
        ));
    }

    @Test
    void puzzleVerifiesPhrase() {
        assertTrue(registry.verify(
                ObligationSupport.DISPOSITION_ACK_PUZZLE,
                "{\"phrase\":\"一人一卡\"}",
                "一人一卡"));
        assertFalse(registry.verify(
                ObligationSupport.DISPOSITION_ACK_PUZZLE,
                "{\"phrase\":\"一人一卡\"}",
                "错误"));
    }

    @Test
    void quizRequiresPassedFlag() {
        assertTrue(registry.verify(ObligationSupport.DISPOSITION_QUIZ, "{}", "{\"passed\":true}"));
        assertFalse(registry.verify(ObligationSupport.DISPOSITION_QUIZ, "{}", "{\"passed\":false}"));
        assertFalse(registry.verify(ObligationSupport.DISPOSITION_QUIZ, "{}", "not-json"));
    }

    @Test
    void signatureRequiresNonEmptySignature() {
        assertTrue(registry.verify(ObligationSupport.DISPOSITION_SIGNATURE, "{}", "{\"signature\":\"张三\"}"));
        assertFalse(registry.verify(ObligationSupport.DISPOSITION_SIGNATURE, "{}", "{\"signature\":\"\"}"));
    }

    @Test
    void showOnlyDoesNotRequireInteraction() {
        DispositionStrategy s = registry.require(ObligationSupport.DISPOSITION_SHOW_ONLY);
        assertFalse(s.requiresInteraction());
        assertEquals(ObligationSupport.DISPOSITION_SHOW_ONLY, s.type());
    }
}

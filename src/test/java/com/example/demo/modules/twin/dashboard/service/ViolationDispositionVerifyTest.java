package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.obligation.disposition.DispositionStrategy;
import com.example.demo.modules.twin.obligation.disposition.DispositionStrategyRegistry;
import com.example.demo.modules.twin.obligation.entity.TwinObligation;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 回归：记录级拼图短语优先于待办处置策略。
 *
 * <p>漏洞背景（e834da07 引入）：管理端可把带短语违规的待办策略覆盖成 SHOW_ONLY / ACK_READ
 * （两者的 {@code verify} 恒返回 true）。若先按待办策略校验，任意答案都会通过，
 * 而写库 SQL 以「记录有短语」为条件置 verified_at，进而触发 interactive_unlock_on_verify
 * 解禁——等于不解题就解锁。故只要记录带短语，就必须拼对，不再看待办策略。
 *
 * <p>本测试不加载 Spring 上下文、不连库。
 */
class ViolationDispositionVerifyTest {

    private static TwinStudentViolation phraseRow() {
        TwinStudentViolation row = new TwinStudentViolation();
        row.setId(1L);
        row.setInteractiveChallenge("知识就是力量");
        return row;
    }

    /** 复现漏洞路径：记录带短语 + 待办策略 SHOW_ONLY + 注册表 verify 恒真，任意答案也不得通过。 */
    @Test
    void phraseRowWithAlwaysTrueObligationStrategy_rejectsArbitraryAnswer() {
        ObligationService obligationService = mock(ObligationService.class);
        DispositionStrategyRegistry registry = mock(DispositionStrategyRegistry.class);
        TwinObligation ob = new TwinObligation();
        ob.setDispositionType("SHOW_ONLY");
        when(obligationService.findByViolationId(1L)).thenReturn(ob);
        when(registry.verify(eq("SHOW_ONLY"), any(), any())).thenReturn(true);

        TwinStudentViolationService service = newService(obligationService, registry);

        assertFalse(service.verifyDispositionAnswer(phraseRow(), "随便乱答"));
    }

    @Test
    void phraseRow_rejectsArbitraryAnswer() {
        TwinStudentViolationService service = newService(null, null);
        assertFalse(service.verifyDispositionAnswer(phraseRow(), "随便乱答"));
    }

    @Test
    void phraseRow_acceptsExactAnswer() {
        TwinStudentViolationService service = newService(null, null);
        assertTrue(service.verifyDispositionAnswer(phraseRow(), "知识就是力量"));
    }

    @Test
    void noPhraseNoObligation_throws() {
        TwinStudentViolationService service = newService(null, null);
        TwinStudentViolation row = new TwinStudentViolation();
        row.setId(2L);
        assertThrows(IllegalArgumentException.class,
                () -> service.verifyDispositionAnswer(row, "任意答案"));
    }

    /** 12 参构造器，除待校验的两个依赖外全部传 null（无可用的待办/策略即覆盖「短语优先」路径）。 */
    private static TwinStudentViolationService newService(
            ObligationService obligationService, DispositionStrategyRegistry registry) {
        return new TwinStudentViolationService(
                null, null, null, null, null, null, null, null, null, null,
                obligationService, registry);
    }

    /**
     * 「无需交互」的策略（SHOW_ONLY）不接受处置提交。
     * 否则任意答案都能把它标记成已处置；配上「验证后解禁」就是不解题即解锁。
     */
    @Test
    void noPhrase_showOnlyStrategy_isRejected() {
        ObligationService obligationService = mock(ObligationService.class);
        DispositionStrategyRegistry registry = mock(DispositionStrategyRegistry.class);
        TwinObligation ob = new TwinObligation();
        ob.setDispositionType("SHOW_ONLY");
        when(obligationService.findByViolationId(3L)).thenReturn(ob);
        DispositionStrategy showOnly = mock(DispositionStrategy.class);
        when(showOnly.requiresInteraction()).thenReturn(false);
        when(registry.find("SHOW_ONLY")).thenReturn(Optional.of(showOnly));

        TwinStudentViolationService service = newService(obligationService, registry);
        TwinStudentViolation row = new TwinStudentViolation();
        row.setId(3L);

        assertThrows(IllegalArgumentException.class,
                () -> service.verifyDispositionAnswer(row, "{}"));
    }

    /** 记录无短语时按待办策略校验——ACK_READ / QUIZ / SIGNATURE 走的就是这条路。 */
    @Test
    void noPhrase_quizStrategy_delegatesToStrategyVerify() {
        ObligationService obligationService = mock(ObligationService.class);
        DispositionStrategyRegistry registry = mock(DispositionStrategyRegistry.class);
        TwinObligation ob = new TwinObligation();
        ob.setDispositionType("QUIZ");
        ob.setDispositionConfigJson("{\"passCount\":1}");
        when(obligationService.findByViolationId(4L)).thenReturn(ob);
        DispositionStrategy quiz = mock(DispositionStrategy.class);
        when(quiz.requiresInteraction()).thenReturn(true);
        when(quiz.verify(eq("{\"passCount\":1}"), eq("{\"answers\":{}}"))).thenReturn(false);
        when(registry.find("QUIZ")).thenReturn(Optional.of(quiz));

        TwinStudentViolationService service = newService(obligationService, registry);
        TwinStudentViolation row = new TwinStudentViolation();
        row.setId(4L);

        assertFalse(service.verifyDispositionAnswer(row, "{\"answers\":{}}"));
    }

    /** 未注册的策略编码不放行。 */
    @Test
    void noPhrase_unknownStrategy_isRejected() {
        ObligationService obligationService = mock(ObligationService.class);
        DispositionStrategyRegistry registry = mock(DispositionStrategyRegistry.class);
        TwinObligation ob = new TwinObligation();
        ob.setDispositionType("NOT_A_REAL_STRATEGY");
        when(obligationService.findByViolationId(5L)).thenReturn(ob);
        when(registry.find("NOT_A_REAL_STRATEGY")).thenReturn(Optional.empty());

        TwinStudentViolationService service = newService(obligationService, registry);
        TwinStudentViolation row = new TwinStudentViolation();
        row.setId(5L);

        assertFalse(service.verifyDispositionAnswer(row, "任意答案"));
    }
}

package com.example.demo.modules.twin.dashboard.service;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 处置情况摘要纯函数：列表与详情共用同一套解析，签名图绝不进返回值。
 *
 * <p>不加载 Spring 上下文、不连库。
 */
class ViolationDispositionSummaryTest {

    /** 按回执落库格式包一层：{"answer":"<原始提交>"} */
    private static String wrap(String rawAnswer) {
        return "{\"answer\":\"" + rawAnswer.replace("\"", "\\\"") + "\"}";
    }

    private static Map<String, Object> sum(String type, String status, String payload) {
        return TwinStudentViolationService.dispositionSummary(type, status, payload, null, null);
    }

    @Test
    void ackReadCompleted_showsDisposedAndReadDetail() {
        Map<String, Object> r = sum("ACK_READ", "COMPLETED", wrap(""));
        assertEquals("已处置", r.get("stateLabel"));
        assertTrue(String.valueOf(r.get("detail")).contains("阅读"), "阅读策略 detail 应含「阅读」");
    }

    @Test
    void quizCompleted_detailMentionsAnswer() {
        Map<String, Object> r = sum("QUIZ", "COMPLETED", wrap("{\"answers\":{\"q1\":1}}"));
        assertTrue(String.valueOf(r.get("detail")).contains("答"), "答题策略 detail 应含「答」");
    }

    @Test
    void signatureCompleted_flagsImageWithoutLeakingDataUrl() {
        Map<String, Object> r = sum("SIGNATURE", "COMPLETED",
                wrap("{\"signature\":\"data:image/jpeg;base64,AAA\"}"));
        assertEquals(Boolean.TRUE, r.get("hasSignatureImage"));
        // 硬约束：摘要绝不能把签名 dataUrl（base64）带进任何键
        assertFalse(String.valueOf(r).contains("base64"), "摘要不得包含 base64 签名数据");
    }

    @Test
    void quizPending_noReceipt_staysPending() {
        Map<String, Object> r = sum("QUIZ", "PENDING_DISPOSITION", null);
        assertEquals("待处置", r.get("stateLabel"));
    }

    @Test
    void unknownType_fallsBackToCodeWithoutThrowing() {
        Map<String, Object> r = sum("FOO_BAR", "PENDING_DISPOSITION", null);
        assertEquals("FOO_BAR", r.get("typeLabel"));
    }

    @Test
    void invalidJsonPayload_doesNotThrow() {
        assertDoesNotThrow(() -> sum("ACK_READ", "COMPLETED", "{not json"));
    }

    @Test
    void showOnlyAndNoObligation_needNoDisposition() {
        assertEquals("无需处置", sum("SHOW_ONLY", "PENDING_DISPOSITION", null).get("stateLabel"));
        Map<String, Object> none = sum(null, null, null);
        assertEquals("无需处置", none.get("stateLabel"));
        assertNull(none.get("type"), "无策略时 type 保持 null");
        assertEquals(Boolean.FALSE, none.get("hasSignatureImage"));
    }

    @Test
    void nonSignatureType_neverFlagsImageEvenIfAnswerCarriesSignature() {
        Map<String, Object> r = sum("QUIZ", "COMPLETED",
                wrap("{\"signature\":\"data:image/jpeg;base64,AAA\"}"));
        assertEquals(Boolean.FALSE, r.get("hasSignatureImage"));
    }
}

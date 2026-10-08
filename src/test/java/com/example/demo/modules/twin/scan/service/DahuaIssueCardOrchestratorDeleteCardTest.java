package com.example.demo.modules.twin.scan.service;

import com.example.demo.modules.dahua.service.DahuaAuthService;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 删卡的判定口径：大华侧没清干净时不许清本地映射、不许报成功，
 * 否则会留下「我们这里没这张卡、大华那边还绑着」的幽灵卡。
 */
@ExtendWith(MockitoExtension.class)
class DahuaIssueCardOrchestratorDeleteCardTest {

    private static final String CARD_NO = "1A2B3C4D";
    private static final String SIBLING_CARD_NO = "5E6F7A8B";

    @Mock
    private DahuaOpenApiService dahuaOpenApiService;

    @Mock
    private TwinCardMappingService mappingService;

    private DahuaIssueCardOrchestratorService service;

    @BeforeEach
    void setUp() {
        service = new DahuaIssueCardOrchestratorService(dahuaOpenApiService, mappingService);
        // isSuccess 是真实业务规则，别让它被 mock 成恒 false
        DahuaOpenApiService real = new DahuaOpenApiService(mock(DahuaAuthService.class));
        when(dahuaOpenApiService.isSuccess(any())).thenAnswer(inv -> real.isSuccess(inv.getArgument(0)));
    }

    private Map<String, Object> resp(boolean success, String code, String errMsg, Map<String, Object> data) {
        Map<String, Object> m = new HashMap<>();
        m.put("success", success);
        m.put("code", code);
        m.put("errMsg", errMsg);
        m.put("data", data);
        return m;
    }

    private Map<String, Object> cardExists() {
        return resp(true, "0", "", Map.of("id", 123));
    }

    private Map<String, Object> mainCardExists() {
        return resp(true, "0", "", Map.of("id", 123, "isMainCard", 1, "personId", 1081));
    }

    /** 同人另一张卡的本地映射（删主卡时要临时解绑它） */
    private TwinCardMapping siblingMapping() {
        TwinCardMapping sib = new TwinCardMapping();
        sib.setCardNo(SIBLING_CARD_NO);
        sib.setDahuaSeq("1081");
        return sib;
    }

    private Map<String, Object> siblingCard() {
        return resp(true, "0", "", Map.of("id", 456, "cardNumber", SIBLING_CARD_NO, "personId", 1081,
                "departmentId", 26, "category", "0",
                "startDate", "2026-10-08 00:00:00", "endDate", "2036-10-08 23:59:59"));
    }

    private Map<String, Object> cardMissing() {
        return resp(false, "28140001", "卡号不存在", null);
    }

    @Test
    @DisplayName("退卡失败不再跳过删除：删除成功即可清本地")
    void deleteProceedsEvenWhenReturnCardFails() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(cardExists());
        when(dahuaOpenApiService.returnCardById(123L))
                .thenReturn(resp(false, "28140002", "卡片状态不允许退卡", null));
        when(dahuaOpenApiService.deleteCardByNumber(CARD_NO))
                .thenReturn(resp(true, "0", "", Map.of("successNum", 1, "failNum", 0)));

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.TRUE, result.get("success"));
        verify(dahuaOpenApiService).deleteCardByNumber(CARD_NO);
        verify(mappingService).deleteMapping(eq(CARD_NO), any());
    }

    @Test
    @DisplayName("大华侧删除被拒（successNum=0）时保留本地映射并报失败")
    void keepsLocalMappingWhenUpstreamDeleteRejected() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(cardExists());
        when(dahuaOpenApiService.returnCardById(123L)).thenReturn(resp(true, "0", "", Map.of()));
        when(dahuaOpenApiService.deleteCardByNumber(CARD_NO))
                .thenReturn(resp(true, "0", "", Map.of("successNum", 0, "failNum", 1)));

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.FALSE, result.get("success"));
        verify(mappingService, never()).deleteMapping(anyString(), any());
    }

    @Test
    @DisplayName("退卡失败且删除失败时保留本地映射并报失败")
    void keepsLocalMappingWhenBothUpstreamStepsFail() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(cardExists());
        when(dahuaOpenApiService.returnCardById(123L))
                .thenReturn(resp(false, "28140002", "卡片状态不允许退卡", null));
        when(dahuaOpenApiService.deleteCardByNumber(CARD_NO))
                .thenReturn(resp(false, "28140003", "删除失败", null));

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.FALSE, result.get("success"));
        verify(mappingService, never()).deleteMapping(anyString(), any());
    }

    @Test
    @DisplayName("冻结态删卡（28140014）：保留本地映射，并提示先解冻")
    void frozenPersonFailureTellsOperatorToUnfreezeFirst() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(cardExists());
        when(dahuaOpenApiService.returnCardById(123L))
                .thenReturn(resp(false, "28140014", "card operate fail", null));
        when(dahuaOpenApiService.deleteCardByNumber(CARD_NO))
                .thenReturn(resp(false, "28140014", "card operate fail", null));

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.FALSE, result.get("success"));
        assertTrue(String.valueOf(result.get("message")).contains("解冻"),
                "冻结态失败必须给出「先解冻」的可执行提示，实际=" + result.get("message"));
        verify(mappingService, never()).deleteMapping(anyString(), any());
    }

    @Test
    @DisplayName("主卡删不掉且副卡也退不掉（28140014）：保留本地映射，点明主卡规则")
    void mainCardFailureTellsOperatorMainCardRule() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(mainCardExists());
        when(mappingService.listByDahuaSeq("1081")).thenReturn(List.of(siblingMapping()));
        when(dahuaOpenApiService.returnCardById(123L))
                .thenReturn(resp(false, "28140014", "card operate fail", null));
        when(dahuaOpenApiService.deleteCardByNumber(CARD_NO))
                .thenReturn(resp(false, "28140014", "card operate fail", null));
        when(dahuaOpenApiService.queryCardByNumber(SIBLING_CARD_NO)).thenReturn(siblingCard());
        when(dahuaOpenApiService.returnCardById(456L))
                .thenReturn(resp(true, "0", "", Map.of("failList", Map.of(SIBLING_CARD_NO, "28140008"), "successNum", 0)));

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.FALSE, result.get("success"));
        assertTrue(String.valueOf(result.get("message")).contains("主卡"),
                "主卡失败必须点明主卡规则，实际=" + result.get("message"));
        assertTrue(String.valueOf(result.get("message")).contains("28140008"),
                "副卡退卡失败的错误码也要带出来，实际=" + result.get("message"));
        verify(mappingService, never()).deleteMapping(anyString(), any());
    }

    @Test
    @DisplayName("主卡：先临时解绑副卡 → 删主卡 → 副卡重新激活回该人")
    void mainCardIsDeletedByDetachingThenRestoringSibling() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(mainCardExists());
        when(mappingService.listByDahuaSeq("1081")).thenReturn(List.of(siblingMapping()));
        // 第一次退卡+删除都因主卡被拒，临时解绑副卡后第二次全部成功
        when(dahuaOpenApiService.returnCardById(123L))
                .thenReturn(resp(false, "28140014", "card operate fail", null))
                .thenReturn(resp(true, "0", "", Map.of("successNum", 1, "failList", Map.of())));
        when(dahuaOpenApiService.deleteCardByNumber(CARD_NO))
                .thenReturn(resp(false, "28140014", "card operate fail", null))
                .thenReturn(resp(true, "0", "", Map.of("successNum", 1, "failNum", 0)));
        when(dahuaOpenApiService.queryCardByNumber(SIBLING_CARD_NO)).thenReturn(siblingCard());
        when(dahuaOpenApiService.returnCardById(456L))
                .thenReturn(resp(true, "0", "", Map.of("successNum", 1, "failList", Map.of())));
        when(dahuaOpenApiService.putRaw(eq("/evo-apigw/evo-brm/1.0.0/card/active"), any()))
                .thenReturn(resp(true, "0", "", Map.of("id", 456)));

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.TRUE, result.get("success"));
        assertTrue(String.valueOf(result.get("message")).contains("临时解绑并恢复"),
                "成功文案要讲明白副卡被临时解绑过，实际=" + result.get("message"));
        verify(mappingService).deleteMapping(eq(CARD_NO), any());
        // 副卡的本地映射不能被牵连
        verify(mappingService, never()).deleteMapping(eq(SIBLING_CARD_NO), any());
    }

    @Test
    @DisplayName("退卡逐卡失败（success=true + failList）不能当成功，错误码要带进提示")
    void perCardReturnFailureIsNotTreatedAsSuccess() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(cardExists());
        when(dahuaOpenApiService.returnCardById(123L)).thenReturn(
                resp(true, "0", "", Map.of("failList", Map.of(CARD_NO, "28140008"), "successNum", 0)));
        when(dahuaOpenApiService.deleteCardByNumber(CARD_NO))
                .thenReturn(resp(false, "28140014", "card operate fail", null));

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.FALSE, result.get("success"));
        assertTrue(String.valueOf(result.get("message")).contains("28140008"),
                "退卡逐卡失败的错误码必须带出来，实际=" + result.get("message"));
        verify(mappingService, never()).deleteMapping(anyString(), any());
    }

    @Test
    @DisplayName("大华侧已无此卡：不调删除接口，只清本地映射并报成功")
    void clearsLocalOnlyWhenCardAlreadyGoneUpstream() {
        when(dahuaOpenApiService.queryCardByNumber(CARD_NO)).thenReturn(cardMissing());

        Map<String, Object> result = service.deleteCardFromDahua(CARD_NO);

        assertEquals(Boolean.TRUE, result.get("success"));
        verify(dahuaOpenApiService, never()).returnCardById(any());
        verify(dahuaOpenApiService, never()).deleteCardByNumber(anyString());
        verify(mappingService).deleteMapping(eq(CARD_NO), any());
    }
}

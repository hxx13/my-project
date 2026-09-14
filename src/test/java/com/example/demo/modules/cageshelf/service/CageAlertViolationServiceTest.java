package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.dashboard.service.TwinViolationRuleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link CageAlertViolationService#matchesGroupWhitelist} 的空白名单口径回归。
 *
 * <p>前端 {@code serializeCageFields} 把空数组序列化成 {@code "[]"} 入库，此前该方法只把 null/blank
 * 当「不限课题组」，{@code "[]"} 一路落到逗号兜底后恒返回 false——告警照建但 violation_id 恒 NULL、
 * 自动发违规整条链静默断掉。这里钉死：所有「空的白名单」形态都必须返回 true。
 *
 * <p>另含「同一段超时不重复发违规」的回归（{@code publishIfWanted} 的第一道幂等）。
 */
@ExtendWith(MockitoExtension.class)
class CageAlertViolationServiceTest {

    private static final String LUJIN = "卢今";

    @Mock private TwinViolationRuleService ruleService;
    @Mock private TwinCageStatusViolationMapper cageStatusViolationMapper;
    @Mock private TwinStudentViolationService violationService;
    @Mock private AroService aroService;
    @Mock private CageStatusAlertMapper alertMapper;
    @Mock private CageCellIndexMapper cellIndexMapper;
    @Mock private CageCellDetailMapper cellDetailMapper;
    @Mock private CageAlertRuleService alertRuleService;

    private CageAlertViolationService service;

    @BeforeEach
    void setUp() {
        service = new CageAlertViolationService(ruleService, cageStatusViolationMapper, violationService,
                aroService, alertMapper, cellIndexMapper, cellDetailMapper, alertRuleService);
    }

    /** enabled=1 + source_tag=CAGE_STATUS + 空白名单（不限课题组）。 */
    private static TwinViolationRule cageStatusRule() {
        TwinViolationRule r = new TwinViolationRule();
        r.setId(6L);
        r.setEnabled(1);
        r.setSourceTag("CAGE_STATUS");
        r.setCageGroupWhitelist("[]");
        r.setCageTriggerAction("BOTH");
        return r;
    }

    private void stubRuleAndCage() {
        when(ruleService.listAll()).thenReturn(List.of(cageStatusRule()));
        when(cellIndexMapper.lookupByAnimalCageId(anyLong())).thenReturn(Map.of());
        CageCellDetail detail = new CageCellDetail();
        detail.setProjectPiName(LUJIN);
        when(cellDetailMapper.selectByAnimalCageId(anyLong())).thenReturn(detail);
    }

    /**
     * 核心回归：同一段超时（同笼位 + 同状态 + 同起算时刻）已经挂过违规 → 跳过，一条父记录都不建。
     *
     * <p>引擎「撤销 → 重建」会产生**新 id** 的告警行，按行 id 的 {@code claimViolationId} 守卫拦不住他，
     * 所以必须按 started_at 再卡一道；否则每撤销重建一次就重发一遍违规。
     */
    @Test
    void sameIntervalWithPriorViolationIsSkipped() {
        stubRuleAndCage();
        when(alertMapper.countPriorViolationForInterval(7L)).thenReturn(1);

        assertNull(service.publishIfWanted(7L, 100L, "NEED_DIVIDE"));
        verify(cageStatusViolationMapper, never()).insert(any(TwinCageStatusViolation.class));
    }

    /** 该段还没发过 → 照常建。对照组，证明上面那条不是因为别的原因早退。 */
    @Test
    void firstViolationForIntervalIsPublished() {
        stubRuleAndCage();
        when(alertMapper.countPriorViolationForInterval(7L)).thenReturn(0);
        when(cageStatusViolationMapper.insert(any(TwinCageStatusViolation.class))).thenAnswer(inv -> {
            ((TwinCageStatusViolation) inv.getArgument(0)).setId(555L);
            return 1;
        });
        when(alertMapper.claimViolationId(7L, 555L)).thenReturn(1);

        assertEquals(555L, service.publishIfWanted(7L, 100L, "NEED_DIVIDE"));
    }

    /**
     * 该笼位该状态还挂着**未结**的父违规 → 跳过。
     *
     * <p>这是「同一个未处理的问题只记一次」，覆盖上游把状态字段反复置开/置关造成的那类重复：
     * 每次都是新区间（新起算点），按起算点那道守卫拦不住。实测有笼位因此攒了 16 条重复违规。
     */
    @Test
    void unresolvedViolationForSameCellIsSkipped() {
        when(ruleService.listAll()).thenReturn(List.of(cageStatusRule()));
        when(cellIndexMapper.lookupByAnimalCageId(anyLong()))
                .thenReturn(Map.of("shelveId", 9L, "positionX", 1, "positionY", 2));
        CageCellDetail detail = new CageCellDetail();
        detail.setProjectPiName(LUJIN);
        when(cellDetailMapper.selectByAnimalCageId(anyLong())).thenReturn(detail);
        when(alertMapper.countPriorViolationForInterval(7L)).thenReturn(0);
        when(cageStatusViolationMapper.selectActiveByRuleAndCage(6L, "NEED_DIVIDE", 9L, 1, 2))
                .thenReturn(new TwinCageStatusViolation());

        assertNull(service.publishIfWanted(7L, 100L, "NEED_DIVIDE"));
        verify(cageStatusViolationMapper, never()).insert(any(TwinCageStatusViolation.class));
    }

    /** 坐标定位不到（架/坐标缺）→ 不做未结判定，宁可照发也不误杀。 */
    @Test
    void unresolvedCheckIsSkippedWhenCellCannotBeLocated() {
        stubRuleAndCage();
        when(alertMapper.countPriorViolationForInterval(7L)).thenReturn(0);
        when(cageStatusViolationMapper.insert(any(TwinCageStatusViolation.class))).thenAnswer(inv -> {
            ((TwinCageStatusViolation) inv.getArgument(0)).setId(777L);
            return 1;
        });
        when(alertMapper.claimViolationId(7L, 777L)).thenReturn(1);

        assertEquals(777L, service.publishIfWanted(7L, 100L, "NEED_DIVIDE"));
    }

    @Test
    void emptyArrayMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[]", LUJIN));
    }

    @Test
    void blankStringMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("", LUJIN));
    }

    @Test
    void nullJsonMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist(null, LUJIN));
    }

    @Test
    void literalNullStringMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("null", LUJIN));
    }

    @Test
    void whitespaceArrayMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[ ]", LUJIN));
    }

    @Test
    void onlyWhitespaceTokensMeansUnrestricted() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist(" , ", LUJIN));
    }

    @Test
    void singleEntryHit() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[\"卢今\"]", LUJIN));
    }

    @Test
    void singleEntryMiss() {
        assertFalse(CageAlertViolationService.matchesGroupWhitelist("[\"张三\"]", LUJIN));
    }

    @Test
    void multiEntryHit() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("[\"张三\",\"卢今\"]", LUJIN));
    }

    @Test
    void commaSeparatedHit() {
        assertTrue(CageAlertViolationService.matchesGroupWhitelist("张三,卢今", LUJIN));
    }

    @Test
    void commaSeparatedMiss() {
        assertFalse(CageAlertViolationService.matchesGroupWhitelist("张三", LUJIN));
    }
}

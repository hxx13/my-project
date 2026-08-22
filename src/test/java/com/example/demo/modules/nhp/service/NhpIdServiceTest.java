package com.example.demo.modules.nhp.service;

import com.example.demo.modules.nhp.entity.CrfIdRule;
import com.example.demo.modules.nhp.entity.CrfSequence;
import com.example.demo.modules.nhp.mapper.CrfIdRuleMapper;
import com.example.demo.modules.nhp.mapper.CrfSequenceMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NhpIdServiceTest {

    @Mock private CrfSequenceMapper sequenceMapper;
    @Mock private CrfIdRuleMapper idRuleMapper;

    private NhpIdService service;

    @BeforeEach
    void setUp() {
        service = new NhpIdService(sequenceMapper, idRuleMapper);
    }

    @Test
    void previewCode_peeksNextWithoutIncrement() {
        CrfIdRule rule = new CrfIdRule();
        rule.setIdType("DON");
        rule.setPattern("DON-{base}{year}-{seq:3}");
        rule.setDerived(false);
        when(idRuleMapper.listByType("DON")).thenReturn(List.of(rule));

        CrfSequence seq = new CrfSequence();
        seq.setNextValue(5);
        when(sequenceMapper.findByScope(eq("DON"), any())).thenReturn(seq);

        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("base", "FARM");
        ctx.put("year", 26);

        assertEquals("DON-FARM26-006", service.previewCode("DON", ctx));
        verify(sequenceMapper, never()).incrementByScope(any(), any());
        verify(sequenceMapper, never()).insert(any());
    }

    @Test
    void previewCode_defaultsToOneWhenNoSequenceRow() {
        CrfIdRule rule = new CrfIdRule();
        rule.setIdType("RCP");
        rule.setPattern("RCP-{center}{year}-{seq:3}");
        rule.setDerived(false);
        when(idRuleMapper.listByType("RCP")).thenReturn(List.of(rule));
        when(sequenceMapper.findByScope(eq("RCP"), any())).thenReturn(null);

        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("center", "SJ");
        ctx.put("year", 26);

        assertEquals("RCP-SJ26-001", service.previewCode("RCP", ctx));
        verify(sequenceMapper, never()).incrementByScope(any(), any());
    }

    @Test
    void previewCode_derivedAnesFormatsFromTxWithoutIncrement() {
        CrfIdRule rule = new CrfIdRule();
        rule.setIdType("ANES");
        rule.setPattern("ANES-{TX}");
        rule.setDerived(true);
        when(idRuleMapper.listByType("ANES")).thenReturn(List.of(rule));

        Map<String, Object> ctx = new LinkedHashMap<>();
        ctx.put("TX", "TX-SJ26-003");

        assertEquals("ANES-TX-SJ26-003", service.previewCode("ANES", ctx));
        verify(sequenceMapper, never()).incrementByScope(any(), any());
        verify(sequenceMapper, never()).insert(any());
    }
}

package com.example.demo.modules.cardprint.service;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageInfoField;
import com.example.demo.modules.cageshelf.entity.CageInfoValue;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoFieldMapper;
import com.example.demo.modules.cageshelf.mapper.CageInfoValueMapper;
import com.example.demo.modules.cardprint.entity.CardPrintValueMap;
import com.example.demo.modules.cardprint.mapper.CardPrintValueMapMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 数据组装契约：表单值按 canonical 落位 + 特殊字段 __qr__/__position__ 正确拼装。 */
class CardDataAssemblerTest {

    @Test
    void assemblesFormValueQrAndPosition() {
        CageInfoFieldMapper fieldMapper = mock(CageInfoFieldMapper.class);
        CageInfoValueMapper valueMapper = mock(CageInfoValueMapper.class);
        CageCellDetailMapper detailMapper = mock(CageCellDetailMapper.class);
        CageCellIndexMapper indexMapper = mock(CageCellIndexMapper.class);

        CageInfoField f = new CageInfoField();
        f.setId(1L);
        f.setCanonical("project_pi_name");
        f.setLabel("PI");
        f.setDataType("STRING");
        when(fieldMapper.selectPublished()).thenReturn(List.of(f));

        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(100L);
        v.setFieldId(1L);
        v.setValueString("郭滨");
        when(valueMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of(v));
        when(detailMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of());
        when(indexMapper.lookupByAnimalCageIds(anyList())).thenReturn(List.of(
                Map.of("animalCageId", 100L, "roomName", "605A", "shelveName", "A架",
                        "positionX", 3, "positionY", 5)));

        List<Map<String, Object>> rows = new CardDataAssembler(
                fieldMapper, valueMapper, detailMapper, indexMapper,
                mock(CardPrintValueMapMapper.class)).assemble(List.of(100L));

        assertEquals(1, rows.size());
        assertEquals("郭滨", rows.get(0).get("project_pi_name"));
        assertEquals("100", rows.get(0).get("__qr__"));
        assertEquals("A架#C-6", rows.get(0).get("__position__"));
    }

    @Test
    void emptyInputReturnsEmptyList() {
        CardDataAssembler assembler = new CardDataAssembler(
                mock(CageInfoFieldMapper.class), mock(CageInfoValueMapper.class),
                mock(CageCellDetailMapper.class), mock(CageCellIndexMapper.class),
                mock(CardPrintValueMapMapper.class));
        assertEquals(0, assembler.assemble(List.of()).size());
        assertEquals(0, assembler.assemble(null).size());
    }

    @Test
    void enumValueIsReadFromStringColumn() {
        CageInfoFieldMapper fieldMapper = mock(CageInfoFieldMapper.class);
        CageInfoValueMapper valueMapper = mock(CageInfoValueMapper.class);
        CageCellDetailMapper detailMapper = mock(CageCellDetailMapper.class);
        CageCellIndexMapper indexMapper = mock(CageCellIndexMapper.class);

        CageInfoField f = new CageInfoField();
        f.setId(7L);
        f.setCanonical("animal_sex");
        f.setLabel("性别");
        f.setDataType("ENUM");
        when(fieldMapper.selectPublished()).thenReturn(List.of(f));

        CageInfoValue v = new CageInfoValue();
        v.setAnimalCageId(200L);
        v.setFieldId(7L);
        v.setValueString("雄性");   // ENUM 的值存在 value_string
        when(valueMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of(v));
        when(detailMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of());
        when(indexMapper.lookupByAnimalCageIds(anyList())).thenReturn(List.of());

        List<Map<String, Object>> rows = new CardDataAssembler(
                fieldMapper, valueMapper, detailMapper, indexMapper,
                mock(CardPrintValueMapMapper.class)).assemble(List.of(200L));

        assertEquals("雄性", rows.get(0).get("animal_sex"), "ENUM 字段必须从 value_string 读到值");
        assertEquals("", rows.get(0).get("__position__"), "无位置数据时位置为空串");
    }

    @Test
    void aupNumberFallsBackToDetailWhenFormValueMissing() {
        CageInfoFieldMapper fieldMapper = mock(CageInfoFieldMapper.class);
        CageInfoValueMapper valueMapper = mock(CageInfoValueMapper.class);
        CageCellDetailMapper detailMapper = mock(CageCellDetailMapper.class);
        CageCellIndexMapper indexMapper = mock(CageCellIndexMapper.class);

        when(fieldMapper.selectPublished()).thenReturn(List.of());
        when(valueMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of());

        CageCellDetail d = new CageCellDetail();
        d.setAnimalCageId(300L);
        d.setAupNumber("JUMC2023-142-A");
        when(detailMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of(d));
        when(indexMapper.lookupByAnimalCageIds(anyList())).thenReturn(List.of());

        List<Map<String, Object>> rows = new CardDataAssembler(
                fieldMapper, valueMapper, detailMapper, indexMapper,
                mock(CardPrintValueMapMapper.class)).assemble(List.of(300L));

        assertEquals("JUMC2023-142-A", rows.get(0).get("aup_number"));
    }

    @Test
    void valueMapReplacesConfiguredFieldOnly() {
        CageInfoFieldMapper fieldMapper = mock(CageInfoFieldMapper.class);
        CageInfoValueMapper valueMapper = mock(CageInfoValueMapper.class);
        CageCellDetailMapper detailMapper = mock(CageCellDetailMapper.class);
        CageCellIndexMapper indexMapper = mock(CageCellIndexMapper.class);
        CardPrintValueMapMapper valueMapMapper = mock(CardPrintValueMapMapper.class);

        CageInfoField comeFrom = new CageInfoField();
        comeFrom.setId(9L);
        comeFrom.setCanonical("animal_come_from");
        comeFrom.setDataType("STRING");
        CageInfoField pi = new CageInfoField();
        pi.setId(10L);
        pi.setCanonical("project_pi_name");
        pi.setDataType("STRING");
        when(fieldMapper.selectPublished()).thenReturn(List.of(comeFrom, pi));

        CageInfoValue v1 = new CageInfoValue();
        v1.setAnimalCageId(400L);
        v1.setFieldId(9L);
        v1.setValueString("本中心");
        CageInfoValue v2 = new CageInfoValue();
        v2.setAnimalCageId(400L);
        v2.setFieldId(10L);
        v2.setValueString("郭滨");
        when(valueMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of(v1, v2));
        when(detailMapper.selectByAnimalCageIds(anyList())).thenReturn(List.of());
        when(indexMapper.lookupByAnimalCageIds(anyList())).thenReturn(List.of());

        CardPrintValueMap m = new CardPrintValueMap();
        m.setCanonical("animal_come_from");
        m.setRawValue("本中心");
        m.setShortValue("自繁");
        when(valueMapMapper.selectAll()).thenReturn(List.of(m));

        List<Map<String, Object>> rows = new CardDataAssembler(
                fieldMapper, valueMapper, detailMapper, indexMapper, valueMapMapper)
                .assemble(List.of(400L));

        assertEquals("自繁", rows.get(0).get("animal_come_from"), "配了映射的字段应替换为简称");
        assertEquals("郭滨", rows.get(0).get("project_pi_name"), "未配映射的字段不受影响");
    }
}

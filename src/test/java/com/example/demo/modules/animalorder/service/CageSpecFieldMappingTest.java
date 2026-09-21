package com.example.demo.modules.animalorder.service;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 规格 → 笼位字段映射：模板名键取选项值，「规格」键取最后一级物品名（本部署即周龄）。 */
class CageSpecFieldMappingTest {

    private static Map<String, String> mapping() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("性别", "animal_sex");
        m.put("规格", "animal_week_age");
        m.put("品系", "animal_strain_name");
        return m;
    }

    @Test
    void specLevelKeyTakesLeafItemName_soWeekAgeLandsInForm() {
        Map<String, Object> out = CageOrderReservationService.resolveSpecFields(mapping(), null, null, "7-8W");
        assertEquals("7-8W", out.get("animal_week_age"));
        assertEquals(1, out.size(), "无模板时不写性别");
    }

    @Test
    void templateKeyTakesSelectedOption_andLeafNameWritesAlongside() {
        Map<String, Object> out = CageOrderReservationService.resolveSpecFields(mapping(), "性别", "雌性", "8-9W");
        assertEquals("雌性", out.get("animal_sex"));
        assertEquals("8-9W", out.get("animal_week_age"));
    }

    @Test
    void noLeafNameOrIdFallback_writesNothing() {
        assertTrue(CageOrderReservationService.resolveSpecFields(mapping(), null, null, null).isEmpty());
        assertTrue(CageOrderReservationService.resolveSpecFields(mapping(), null, null, "ID:12").isEmpty(),
                "chainNodeName 的 ID 兜底不是周龄");
    }

    @Test
    void unmappedTemplateNameIsIgnored() {
        Map<String, Object> out = CageOrderReservationService.resolveSpecFields(mapping(), "基因型", "WT", null);
        assertTrue(out.isEmpty());
    }
}

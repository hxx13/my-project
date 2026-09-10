package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageInfoField;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 多值字段（ENUM_MULTI → value_json 数组）写读口径校验。
 * 三条来源必须收敛到同一种存储：前端勾选数组、ARO 同步单值（animalStrainName）、历史裸字符串。
 */
class CageInfoValueMultiTest {

    private CageInfoField field(String dataType) {
        CageInfoField f = new CageInfoField();
        f.setCanonical("animal_strain_name");
        f.setDataType(dataType);
        return f;
    }

    @Test
    void 前端数组直接序列化() {
        String stored = CageInfoValueService.jsonValue(field("ENUM_MULTI"), List.of("C57BL/6", "BALB/c"));
        assertEquals("[\"C57BL/6\",\"BALB/c\"]", stored);
        assertEquals(List.of("C57BL/6", "BALB/c"), CageInfoValueService.parseMulti(stored));
    }

    @Test
    void 同步单值包成数组() {
        String stored = CageInfoValueService.jsonValue(field("ENUM_MULTI"), "C57BL/6");
        assertEquals("[\"C57BL/6\"]", stored);
        assertEquals(List.of("C57BL/6"), CageInfoValueService.parseMulti(stored));
    }

    @Test
    void 历史裸字符串当单项读() {
        assertEquals(List.of("C57BL/6"), CageInfoValueService.parseMulti("C57BL/6"));
        assertEquals(List.of(), CageInfoValueService.parseMulti("  "));
        assertEquals(List.of(), CageInfoValueService.parseMulti(null));
    }

    @Test
    void 非多值字段不包数组() {
        String stored = CageInfoValueService.jsonValue(field("FILE"), "[]");
        assertEquals("[]", stored);
        assertEquals(List.of(), CageInfoValueService.parseMulti(stored));
    }
}

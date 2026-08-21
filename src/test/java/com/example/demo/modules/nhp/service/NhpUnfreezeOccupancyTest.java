package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfCodelist;
import com.example.demo.modules.nhp.entity.CrfField;
import com.example.demo.modules.nhp.mapper.CrfCodelistItemMapper;
import com.example.demo.modules.nhp.mapper.CrfCodelistLinkMapper;
import com.example.demo.modules.nhp.mapper.CrfCodelistMapper;
import com.example.demo.modules.nhp.mapper.CrfCompositeAtomMapper;
import com.example.demo.modules.nhp.mapper.CrfDictChangeLogMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldDictionaryMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateFieldMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 解冻占用：软删字段不计；有活跃字段引用则 409 并列出。 */
@ExtendWith(MockitoExtension.class)
class NhpUnfreezeOccupancyTest {

    @Mock CrfCodelistMapper codelistMapper;
    @Mock CrfCodelistItemMapper itemMapper;
    @Mock CrfCodelistLinkMapper linkMapper;
    @Mock CrfFieldMapper fieldMapper;
    @Mock CrfFieldDictionaryMapper dictionaryMapper;
    @Mock CrfTemplateFieldMapper templateFieldMapper;
    @Mock CrfFormMapper formMapper;
    @Mock CrfCompositeAtomMapper compositeAtomMapper;
    @Mock CrfDictChangeLogMapper changeLogMapper;

    NhpCodelistService service;

    @BeforeEach
    void setUp() {
        service = new NhpCodelistService(
                codelistMapper, itemMapper, linkMapper, fieldMapper, dictionaryMapper,
                templateFieldMapper, formMapper, compositeAtomMapper, changeLogMapper,
                new ObjectMapper());
    }

    @Test
    void unfreeze_allowsWhenNoActiveFieldRefs() {
        CrfCodelist frozen = cl(10L, "BREED", 1, "FROZEN");
        CrfCodelist draft = cl(10L, "BREED", 1, "DRAFT");
        when(codelistMapper.listByCode("BREED")).thenReturn(List.of(frozen));
        when(fieldMapper.listByCodelistId(10L)).thenReturn(List.of());
        when(codelistMapper.findById(10L)).thenReturn(draft);
        when(fieldMapper.countRefsGrouped()).thenReturn(List.of());
        when(changeLogMapper.insert(any())).thenReturn(1);

        Result<?> r = service.unfreeze("BREED", "tester");
        assertTrue(Boolean.TRUE.equals(r.getSuccess()));
        verify(codelistMapper).updateStatus(10L, "DRAFT");
    }

    @Test
    void unfreeze_blocksAndListsActiveFieldRefs() {
        CrfCodelist frozen = cl(10L, "BREED", 1, "FROZEN");
        CrfField f = new CrfField();
        f.setId(1L);
        f.setFieldCode("D1.01.001");
        f.setNameCn("品种");
        f.setStatus("FROZEN");
        f.setActive(true);
        when(codelistMapper.listByCode("BREED")).thenReturn(List.of(frozen));
        when(fieldMapper.listByCodelistId(10L)).thenReturn(List.of(f));

        Result<?> r = service.unfreeze("BREED", "tester");
        assertFalse(Boolean.TRUE.equals(r.getSuccess()));
        assertEquals(409, r.getCode());
        assertTrue(r.getMessage() != null && r.getMessage().contains("品种"));
        verify(codelistMapper, never()).updateStatus(anyLong(), anyString());
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) r.getData();
        assertEquals(1, data.get("refCount"));
    }

    private static CrfCodelist cl(Long id, String code, int ver, String status) {
        CrfCodelist c = new CrfCodelist();
        c.setId(id);
        c.setCode(code);
        c.setName(code);
        c.setVersion(ver);
        c.setStatus(status);
        c.setActive(true);
        return c;
    }
}

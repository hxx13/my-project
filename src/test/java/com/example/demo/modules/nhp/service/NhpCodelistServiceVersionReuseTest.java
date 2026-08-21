package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfCodelist;
import com.example.demo.modules.nhp.entity.CrfCodelistItem;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 码表软删后版号补位：复活 inactive 行，禁止再 INSERT。
 */
@ExtendWith(MockitoExtension.class)
class NhpCodelistServiceVersionReuseTest {

    @Mock private CrfCodelistMapper codelistMapper;
    @Mock private CrfCodelistItemMapper itemMapper;
    @Mock private CrfCodelistLinkMapper linkMapper;
    @Mock private CrfFieldMapper fieldMapper;
    @Mock private CrfFieldDictionaryMapper dictionaryMapper;
    @Mock private CrfTemplateFieldMapper templateFieldMapper;
    @Mock private CrfFormMapper formMapper;
    @Mock private CrfCompositeAtomMapper compositeAtomMapper;
    @Mock private CrfDictChangeLogMapper changeLogMapper;

    private NhpCodelistService service;

    @BeforeEach
    void setUp() {
        service = new NhpCodelistService(
                codelistMapper, itemMapper, linkMapper, fieldMapper, dictionaryMapper,
                templateFieldMapper, formMapper, compositeAtomMapper, changeLogMapper, new ObjectMapper());
    }

    @Test
    void createDraftVersion_softDeletedV1_reactivatesInsteadOfInsert() {
        CrfCodelist activeV2 = cl("BREED", 2L, 2, "FROZEN", true);
        CrfCodelist inactiveV1 = cl("BREED", 1L, 1, "RETIRED", false);
        CrfCodelist reactivated = cl("BREED", 1L, 1, "DRAFT", true);

        when(codelistMapper.listByCode("BREED")).thenReturn(List.of(activeV2));
        when(codelistMapper.listActiveVersionsByCode("BREED")).thenReturn(List.of(2));
        when(codelistMapper.findAnyByCodeAndVersion("BREED", 1)).thenReturn(inactiveV1);
        when(codelistMapper.reactivateAndUpdate(any(CrfCodelist.class))).thenReturn(1);
        when(codelistMapper.findById(1L)).thenReturn(reactivated);
        when(itemMapper.listByCodelistId(2L)).thenReturn(List.of());
        when(itemMapper.listByCodelistId(1L)).thenReturn(List.of());
        when(fieldMapper.countByCodelistId(1L)).thenReturn(0);
        when(changeLogMapper.insert(any())).thenReturn(1);

        Result<Map<String, Object>> result = service.createDraftVersion("BREED");

        assertTrue(Boolean.TRUE.equals(result.getSuccess()), () -> String.valueOf(result.getMessage()));
        verify(codelistMapper, never()).insert(any(CrfCodelist.class));
        ArgumentCaptor<CrfCodelist> cap = ArgumentCaptor.forClass(CrfCodelist.class);
        verify(codelistMapper).reactivateAndUpdate(cap.capture());
        assertEquals(1L, cap.getValue().getId());
        assertEquals("DRAFT", cap.getValue().getStatus());
        assertEquals(1, result.getData().get("version"));
    }

    private static CrfCodelist cl(String code, Long id, int version, String status, boolean active) {
        CrfCodelist c = new CrfCodelist();
        c.setId(id);
        c.setCode(code);
        c.setName(code);
        c.setVersion(version);
        c.setStatus(status);
        c.setActive(active);
        return c;
    }
}

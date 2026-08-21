package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfForm;
import com.example.demo.modules.nhp.entity.CrfStudy;
import com.example.demo.modules.nhp.mapper.CrfCodelistMapper;
import com.example.demo.modules.nhp.mapper.CrfCompositeAtomMapper;
import com.example.demo.modules.nhp.mapper.CrfFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfFormMapper;
import com.example.demo.modules.nhp.mapper.CrfRecordMapper;
import com.example.demo.modules.nhp.mapper.CrfStudyMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateFieldMapper;
import com.example.demo.modules.nhp.mapper.CrfTemplateSectionMapper;
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
 * 软删后版号补位：须复活 inactive 行，禁止再 INSERT（防 DuplicateKey）。
 */
@ExtendWith(MockitoExtension.class)
class NhpTemplateServiceVersionReuseTest {

    @Mock private CrfFormMapper formMapper;
    @Mock private CrfFieldMapper fieldMapper;
    @Mock private CrfCodelistMapper codelistMapper;
    @Mock private CrfTemplateSectionMapper sectionMapper;
    @Mock private CrfTemplateFieldMapper fieldTmplMapper;
    @Mock private CrfCompositeAtomMapper compositeAtomMapper;
    @Mock private CrfStudyMapper studyMapper;
    @Mock private CrfRecordMapper recordMapper;
    @Mock private NhpFieldDictionaryService dictionaryService;

    private NhpTemplateService service;

    @BeforeEach
    void setUp() {
        service = new NhpTemplateService(
                formMapper, fieldMapper, codelistMapper, sectionMapper, fieldTmplMapper,
                compositeAtomMapper, studyMapper, recordMapper, dictionaryService, new ObjectMapper());
    }

    @Test
    void createDraftVersion_softDeletedV1_reactivatesInsteadOfInsert() {
        CrfForm activeV2 = form("nhp-crf", 2L, 2, "FROZEN", true, "TEMPLATE");
        CrfForm inactiveV1 = form("nhp-crf", 1L, 1, "RETIRED", false, "TEMPLATE");
        CrfForm reactivated = form("nhp-crf", 1L, 1, "DRAFT", true, "TEMPLATE");
        reactivated.setName("NHP CRF");

        when(formMapper.findByCode("nhp-crf")).thenReturn(activeV2);
        when(formMapper.findDraftByCode("nhp-crf")).thenReturn(null);
        when(formMapper.listByCode("nhp-crf")).thenReturn(List.of(activeV2));
        when(formMapper.listActiveVersionsByCode("nhp-crf")).thenReturn(List.of(2));
        when(formMapper.findAnyByCodeAndVersion("nhp-crf", 1)).thenReturn(inactiveV1);
        when(formMapper.reactivateAndUpdate(any(CrfForm.class))).thenReturn(1);
        when(formMapper.findById(1L)).thenReturn(reactivated);
        when(sectionMapper.listByFormId(anyLong())).thenReturn(List.of());
        when(fieldTmplMapper.listByFormId(anyLong())).thenReturn(List.of());
        when(compositeAtomMapper.listByCompositeFormId(anyLong())).thenReturn(List.of());
        CrfStudy study = new CrfStudy();
        study.setId(1L);
        when(studyMapper.findByCode("NHP-XENO")).thenReturn(study);

        Result<Object> result = service.createDraftVersion("nhp-crf");

        assertTrue(Boolean.TRUE.equals(result.getSuccess()), () -> String.valueOf(result.getMessage()));
        verify(formMapper, never()).insert(any(CrfForm.class));
        ArgumentCaptor<CrfForm> cap = ArgumentCaptor.forClass(CrfForm.class);
        verify(formMapper).reactivateAndUpdate(cap.capture());
        assertEquals(1L, cap.getValue().getId());
        assertEquals("DRAFT", cap.getValue().getStatus());
        assertEquals(Boolean.TRUE, cap.getValue().getActive());
        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) result.getData();
        assertEquals(1, body.get("version"));
        assertEquals(1L, body.get("formId"));
    }

    private static CrfForm form(String code, Long id, int version, String status, boolean active, String type) {
        CrfForm f = new CrfForm();
        f.setId(id);
        f.setStudyId(1L);
        f.setCode(code);
        f.setName("NHP CRF");
        f.setFormType(type);
        f.setVersion(version);
        f.setStatus(status);
        f.setActive(active);
        return f;
    }
}

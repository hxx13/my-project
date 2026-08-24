package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfForm;
import com.example.demo.modules.nhp.entity.CrfStudy;
import com.example.demo.modules.nhp.entity.CrfSubject;
import com.example.demo.modules.nhp.mapper.*;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NhpRecordServiceTest {

    @Mock private CrfSubjectMapper subjectMapper;
    @Mock private CrfRecordMapper recordMapper;
    @Mock private CrfRecordValueMapper valueMapper;
    @Mock private CrfDataAuditLogMapper auditLogMapper;
    @Mock private CrfSignatureMapper signatureMapper;
    @Mock private CrfFieldMapper fieldMapper;
    @Mock private CrfCodelistItemMapper codelistItemMapper;
    @Mock private CrfStudyMapper studyMapper;
    @Mock private CrfFormMapper formMapper;
    @Mock private CrfCenterMapper centerMapper;
    @Mock private NhpIdService idService;
    @Mock private NhpSnapshotService snapshotService;
    @Mock private NhpEventEngine eventEngine;
    @Mock private CrfTransplantMapper transplantMapper;

    private NhpRecordService service;

    @BeforeEach
    void setUp() {
        service = new NhpRecordService(
                subjectMapper, recordMapper, valueMapper, auditLogMapper, signatureMapper,
                fieldMapper, codelistItemMapper, studyMapper, formMapper, centerMapper, idService,
                snapshotService, new ObjectMapper(), eventEngine, transplantMapper);
    }

    @Test
    void createSubject_defaultsStudyId_whenBodyOmitsIt() {
        CrfStudy study = new CrfStudy();
        study.setId(7L);
        study.setCode(NhpRecordService.DEFAULT_STUDY_CODE);
        when(studyMapper.findByCode(NhpRecordService.DEFAULT_STUDY_CODE)).thenReturn(study);
        when(subjectMapper.findBySubjectCode("MONKEY-A1")).thenReturn(null);
        when(subjectMapper.insert(any(CrfSubject.class))).thenAnswer(inv -> {
            CrfSubject s = inv.getArgument(0);
            s.setId(99L);
            return 1;
        });

        Result<CrfSubject> result = service.createSubject(Map.of(
                "subjectType", "RECIPIENT",
                "subjectCode", "MONKEY-A1"
        ));

        assertTrue(Boolean.TRUE.equals(result.getSuccess()));
        ArgumentCaptor<CrfSubject> cap = ArgumentCaptor.forClass(CrfSubject.class);
        verify(subjectMapper).insert(cap.capture());
        assertEquals(7L, cap.getValue().getStudyId());
        assertEquals("MONKEY-A1", cap.getValue().getSubjectCode());
        assertEquals(7L, result.getData().getStudyId());
        verify(idService, never()).next(any(), any(), any());
        verify(idService, never()).buildCode(any(), any(), any(), anyLong());
        verify(idService, never()).buildCode(any(), any());
    }

    @Test
    void createSubject_autoAssignsCode_whenSubjectCodeMissing() {
        CrfStudy study = new CrfStudy();
        study.setId(7L);
        study.setCode(NhpRecordService.DEFAULT_STUDY_CODE);
        when(studyMapper.findByCode(NhpRecordService.DEFAULT_STUDY_CODE)).thenReturn(study);
        when(idService.buildCode(eq("RCP"), any())).thenReturn("RCP-SJ26-001");
        when(subjectMapper.findBySubjectCode("RCP-SJ26-001")).thenReturn(null);
        when(subjectMapper.insert(any(CrfSubject.class))).thenAnswer(inv -> {
            CrfSubject s = inv.getArgument(0);
            s.setId(100L);
            return 1;
        });

        Result<CrfSubject> result = service.createSubject(Map.of(
                "subjectType", "RECIPIENT",
                "centerCode", "SJ"
        ));

        assertTrue(Boolean.TRUE.equals(result.getSuccess()));
        assertEquals("RCP-SJ26-001", result.getData().getSubjectCode());
        verify(idService).buildCode(eq("RCP"), any());
    }

    @Test
    void createSubject_returns400_whenAutoCodeContextMissing() {
        CrfStudy study = new CrfStudy();
        study.setId(7L);
        study.setCode(NhpRecordService.DEFAULT_STUDY_CODE);
        when(studyMapper.findByCode(NhpRecordService.DEFAULT_STUDY_CODE)).thenReturn(study);

        Result<CrfSubject> result = service.createSubject(Map.of("subjectType", "RECIPIENT"));

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("centerCode") || result.getMessage().contains("取号"));
        verify(subjectMapper, never()).insert(any());
    }

    @Test
    void createSubject_returns400_whenStudyCannotBeResolved() {
        when(studyMapper.findByCode(NhpRecordService.DEFAULT_STUDY_CODE)).thenReturn(null);
        when(studyMapper.list()).thenReturn(List.of());

        Result<CrfSubject> result = service.createSubject(Map.of(
                "subjectType", "DONOR",
                "subjectCode", "DON-1"
        ));

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("studyId"));
        verify(subjectMapper, never()).insert(any());
    }

    @Test
    void createSubject_rejectsUnknownExplicitStudyId() {
        when(studyMapper.findById(999L)).thenReturn(null);

        Result<CrfSubject> result = service.createSubject(Map.of(
                "subjectType", "DONOR",
                "subjectCode", "DON-1",
                "studyId", 999
        ));

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("不存在"));
        verify(subjectMapper, never()).insert(any());
    }

    @Test
    void createRecord_returns400_whenFormIdMissing() {
        CrfSubject subject = new CrfSubject();
        subject.setId(1L);
        when(subjectMapper.findById(1L)).thenReturn(subject);

        Result<?> result = service.createRecord(1L, Map.of());

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("formId"));
        verify(recordMapper, never()).insert(any());
    }

    @Test
    void createRecord_returns400_whenFormMissing() {
        CrfSubject subject = new CrfSubject();
        subject.setId(1L);
        when(subjectMapper.findById(1L)).thenReturn(subject);
        when(formMapper.findById(42L)).thenReturn(null);

        Result<?> result = service.createRecord(1L, Map.of("formId", 42));

        assertEquals(400, result.getCode());
        verify(recordMapper, never()).insert(any());
    }

    @Test
    void createRecord_returns400_whenFormNotPublished() {
        CrfSubject subject = new CrfSubject();
        subject.setId(1L);
        when(subjectMapper.findById(1L)).thenReturn(subject);
        CrfForm form = new CrfForm();
        form.setId(42L);
        form.setFormType("TEMPLATE");
        form.setStatus("DRAFT");
        when(formMapper.findById(42L)).thenReturn(form);

        Result<?> result = service.createRecord(1L, Map.of("formId", 42));

        assertEquals(400, result.getCode());
        assertTrue(result.getMessage().contains("已发布"));
        verify(recordMapper, never()).insert(any());
    }

    @Test
    void createRecord_inserts_whenFormFrozen() {
        CrfSubject subject = new CrfSubject();
        subject.setId(1L);
        when(subjectMapper.findById(1L)).thenReturn(subject);
        CrfForm form = new CrfForm();
        form.setId(42L);
        form.setFormType("TEMPLATE");
        form.setStatus("FROZEN");
        form.setVersion(3);
        when(formMapper.findById(42L)).thenReturn(form);
        when(recordMapper.insert(any())).thenAnswer(inv -> {
            inv.getArgument(0, com.example.demo.modules.nhp.entity.CrfRecord.class).setId(10L);
            return 1;
        });

        Result<?> result = service.createRecord(1L, Map.of("formId", 42));

        assertTrue(Boolean.TRUE.equals(result.getSuccess()));
        ArgumentCaptor<com.example.demo.modules.nhp.entity.CrfRecord> cap =
                ArgumentCaptor.forClass(com.example.demo.modules.nhp.entity.CrfRecord.class);
        verify(recordMapper).insert(cap.capture());
        assertEquals(3L, cap.getValue().getFormVersionId());
    }

    @Test
    void createRecord_inserts_whenPublishedAtomDomain() {
        CrfSubject subject = new CrfSubject();
        subject.setId(1L);
        when(subjectMapper.findById(1L)).thenReturn(subject);
        CrfForm form = new CrfForm();
        form.setId(7L);
        form.setCode("D1");
        form.setFormType("DOMAIN");
        form.setStatus("FROZEN");
        form.setVersion(1);
        when(formMapper.findById(7L)).thenReturn(form);
        when(recordMapper.insert(any())).thenAnswer(inv -> {
            inv.getArgument(0, com.example.demo.modules.nhp.entity.CrfRecord.class).setId(11L);
            return 1;
        });

        Result<?> result = service.createRecord(1L, Map.of("formId", 7));

        assertTrue(Boolean.TRUE.equals(result.getSuccess()));
        verify(formMapper, never()).update(any());
        verify(recordMapper).insert(any());
    }
}

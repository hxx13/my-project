package com.example.demo.modules.reportform.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionLogMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReportFormPeriodServiceTest {

    private ReportFormDefinitionMapper definitionMapper;
    private ReportFormSubmissionMapper submissionMapper;
    private ReportFillService service;

    @BeforeEach
    void setUp() {
        definitionMapper = mock(ReportFormDefinitionMapper.class);
        submissionMapper = mock(ReportFormSubmissionMapper.class);
        service = new ReportFillService(definitionMapper, submissionMapper,
                mock(ReportFormSubmissionLogMapper.class), new ObjectMapper(),
                mock(UserMapper.class), mock(UserDisplayNameService.class));
    }

    private ReportFormDefinition weeklyForm(String mode) {
        ReportFormDefinition f = new ReportFormDefinition();
        f.setId(20L);
        f.setStatus("published");
        f.setFillPolicyJson("{\"mode\":\"" + mode + "\"}");
        f.setScheduleJson("{\"period\":\"weekly\",\"dayOfWeek\":4}");
        return f;
    }

    @Test
    void 周期键_按表单配置与日期算出() {
        assertEquals("2026-W41", service.periodKeyOf(weeklyForm("shared"), LocalDate.of(2026, 10, 8)));
        assertEquals(null, service.periodKeyOf(
                new ReportFormDefinition() {{ setScheduleJson("{\"period\":\"manual\"}"); }},
                LocalDate.of(2026, 10, 8)));
    }

    @Test
    void 周期表_取当期记录_不存在则创建并带上周期键() {
        when(definitionMapper.selectById(20L)).thenReturn(weeklyForm("shared"));
        when(submissionMapper.selectByFormUserAndLabel(eq(20L), eq(0L), anyString())).thenReturn(null);
        when(submissionMapper.insert(any())).thenReturn(1);

        ReportFormSubmission sub = service.resolvePeriodSubmission(20L, 0L, LocalDate.of(2026, 10, 8));

        ArgumentCaptor<ReportFormSubmission> cap = ArgumentCaptor.forClass(ReportFormSubmission.class);
        verify(submissionMapper).insert(cap.capture());
        assertEquals("2026-W41", cap.getValue().getInstanceLabel());
        assertEquals(20L, cap.getValue().getFormId());
        assertEquals(0L, cap.getValue().getUserId());
        assertEquals("draft", cap.getValue().getStatus());
        assertNotNull(sub);
        assertEquals("2026-W41", sub.getInstanceLabel());
    }

    @Test
    void 周期表_当期已存在则不重复创建() {
        when(definitionMapper.selectById(20L)).thenReturn(weeklyForm("shared"));
        ReportFormSubmission existing = new ReportFormSubmission();
        existing.setId(99L);
        existing.setFormId(20L);
        existing.setInstanceLabel("2026-W41");
        when(submissionMapper.selectByFormUserAndLabel(20L, 0L, "2026-W41")).thenReturn(existing);

        ReportFormSubmission sub = service.resolvePeriodSubmission(20L, 0L, LocalDate.of(2026, 10, 8));

        assertEquals(99L, sub.getId());
        verify(submissionMapper, never()).insert(any());
    }

    @Test
    void 非周期表_返回null表示走旧路径() {
        ReportFormDefinition f = new ReportFormDefinition();
        f.setId(21L);
        f.setScheduleJson("{\"period\":\"manual\"}");
        when(definitionMapper.selectById(21L)).thenReturn(f);

        assertNull(service.resolvePeriodSubmission(21L, 0L, LocalDate.of(2026, 10, 8)));
    }
}

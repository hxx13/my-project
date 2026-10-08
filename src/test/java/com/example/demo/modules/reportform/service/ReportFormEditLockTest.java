package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.TwinBusinessException;
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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReportFormEditLockTest {

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

    private ReportFormDefinition form(boolean allowEditAfterSubmit) {
        ReportFormDefinition f = new ReportFormDefinition();
        f.setId(30L);
        f.setStatus("published");
        f.setCreatedBy("owner");
        f.setPublishedBy("owner");
        f.setFillPolicyJson("{\"mode\":\"shared\",\"allowEditAfterSubmit\":" + allowEditAfterSubmit + "}");
        f.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
        f.setLayoutJson("{\"cells\":[],\"fields\":{}}");
        return f;
    }

    private ReportFormSubmission submitted() {
        ReportFormSubmission s = new ReportFormSubmission();
        s.setId(300L);
        s.setFormId(30L);
        s.setUserId(0L);
        s.setInstanceLabel("");
        s.setStatus("submitted");
        s.setVersion(1);
        s.setFieldValuesJson("{\"f_a\":\"1\"}");
        return s;
    }

    private User staff() {
        User u = new User();
        u.setId("7");
        u.setUsername("u7");
        u.setRole(com.example.demo.common.enums.RoleEnum.STAFF);
        return u;
    }

    @Test
    void 关闭提交后编辑_普通用户被拒() {
        when(definitionMapper.selectById(30L)).thenReturn(form(false));
        when(submissionMapper.selectById(300L)).thenReturn(submitted());

        TwinBusinessException ex = assertThrows(TwinBusinessException.class, () ->
                service.saveSubmissionById(300L, 7L, "{\"f_a\":\"X\"}", 1, "u7", "STAFF", staff()));
        assertTrue(ex.getMessage().contains("已提交"));
        verify(submissionMapper, never()).updateWithVersion(any());
    }

    @Test
    void 关闭提交后编辑_发布者仍可改() {
        when(definitionMapper.selectById(30L)).thenReturn(form(false));
        when(submissionMapper.selectById(300L)).thenReturn(submitted());
        when(submissionMapper.updateWithVersion(any())).thenReturn(1);

        User owner = new User();
        owner.setId("owner");
        owner.setUsername("owner");
        owner.setRole(com.example.demo.common.enums.RoleEnum.STAFF);

        assertDoesNotThrow(() ->
                service.saveSubmissionById(300L, 7L, "{\"f_a\":\"X\"}", 1, "owner", "STAFF", owner));
    }

    @Test
    void 开关缺省true_提交后仍可改_零回归() {
        ReportFormDefinition f = form(true);
        f.setFillPolicyJson("{\"mode\":\"shared\"}"); // 老表单：无该键
        when(definitionMapper.selectById(30L)).thenReturn(f);
        when(submissionMapper.selectById(300L)).thenReturn(submitted());
        when(submissionMapper.updateWithVersion(any())).thenReturn(1);

        assertDoesNotThrow(() ->
                service.saveSubmissionById(300L, 7L, "{\"f_a\":\"X\"}", 1, "u7", "STAFF", staff()));
    }
}

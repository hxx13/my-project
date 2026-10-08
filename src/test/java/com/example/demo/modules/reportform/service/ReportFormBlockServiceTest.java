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
import com.example.demo.modules.reportform.util.ReportFormBlocks;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReportFormBlockServiceTest {

    private static final ObjectMapper M = new ObjectMapper();

    private ReportFormDefinitionMapper definitionMapper;
    private ReportFormSubmissionMapper submissionMapper;
    private ReportFormSubmissionLogMapper logMapper;
    private ReportFillService service;

    private User admin;

    @BeforeEach
    void setUp() {
        definitionMapper = mock(ReportFormDefinitionMapper.class);
        submissionMapper = mock(ReportFormSubmissionMapper.class);
        logMapper = mock(ReportFormSubmissionLogMapper.class);
        UserMapper userMapper = mock(UserMapper.class);
        UserDisplayNameService nameService = mock(UserDisplayNameService.class);
        service = new ReportFillService(definitionMapper, submissionMapper, logMapper,
                new ObjectMapper(), userMapper, nameService);

        admin = new User();
        admin.setId("1");
        admin.setUsername("admin");
        admin.setRole(com.example.demo.common.enums.RoleEnum.ADMIN);
    }

    /** 造一个已发布的、开了重复表格的表单 */
    private ReportFormDefinition repeatableForm() {
        ReportFormDefinition form = new ReportFormDefinition();
        form.setId(10L);
        form.setStatus("published");
        form.setCreatedBy("someone-else");
        form.setPublishedBy("someone-else");
        form.setFillPolicyJson("{\"mode\":\"shared\",\"repeatable\":true}");
        form.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
        form.setLayoutJson("{\"cells\":[],\"fields\":{\"f_a\":{\"type\":\"TEXT\",\"label\":\"甲\",\"required\":true}}}");
        return form;
    }

    private ReportFormSubmission sharedSubmission(String fieldValuesJson) {
        ReportFormSubmission sub = new ReportFormSubmission();
        sub.setId(100L);
        sub.setFormId(10L);
        sub.setUserId(0L);
        sub.setInstanceLabel("");
        sub.setStatus("draft");
        sub.setVersion(0);
        sub.setFieldValuesJson(fieldValuesJson);
        return sub;
    }

    @Test
    void 未开启重复表格_加块被拒() {
        ReportFormDefinition form = repeatableForm();
        form.setFillPolicyJson("{\"mode\":\"shared\",\"repeatable\":false}");
        when(definitionMapper.selectById(10L)).thenReturn(form);

        TwinBusinessException ex = assertThrows(TwinBusinessException.class, () ->
                service.addBlock(10L, 100L, "ADMIN", 1L, admin));
        assertTrue(ex.getMessage().contains("未开启重复表格"));
    }

    @Test
    void 加块_追加空块并落库() {
        when(definitionMapper.selectById(10L)).thenReturn(repeatableForm());
        when(submissionMapper.selectByIdForUpdate(100L)).thenReturn(sharedSubmission("{\"f_a\":\"1\"}"));
        when(submissionMapper.updateFieldValues(anyLong(), anyString(), any())).thenReturn(1);

        Map<String, Object> block = service.addBlock(10L, 100L, "ADMIN", 1L, admin);

        assertNotNull(block.get("id"));
        assertEquals(0, block.get("version"));
        assertEquals(Map.of(), block.get("values"));

        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(submissionMapper).updateFieldValues(eq(100L), json.capture(), any());
        assertEquals(2, ReportFormBlocks.blockCount(ReportFormBlocks.normalize(json.getValue())));
    }

    @Test
    void 按块保存_版本不符抛冲突() throws Exception {
        when(definitionMapper.selectById(10L)).thenReturn(repeatableForm());
        when(submissionMapper.selectByIdForUpdate(100L)).thenReturn(sharedSubmission("{\"f_a\":\"1\"}"));

        TwinBusinessException ex = assertThrows(TwinBusinessException.class, () ->
                service.saveBlock(10L, 100L, "b_default", M.readTree("{\"f_a\":\"X\"}"),
                        99, "管理员", "ADMIN", 1L, admin));
        assertTrue(ex.getMessage().contains("冲突"));
        verify(submissionMapper, never()).updateFieldValues(anyLong(), anyString(), any());
    }

    @Test
    void 按块保存_成功则落库且版本加一() throws Exception {
        when(definitionMapper.selectById(10L)).thenReturn(repeatableForm());
        when(submissionMapper.selectByIdForUpdate(100L)).thenReturn(sharedSubmission("{\"f_a\":\"1\"}"));
        when(submissionMapper.updateFieldValues(anyLong(), anyString(), any())).thenReturn(1);

        Map<String, Object> block = service.saveBlock(10L, 100L, "b_default",
                M.readTree("{\"f_a\":\"X\"}"), 0, "管理员", "ADMIN", 1L, admin);

        assertEquals("b_default", block.get("id"));
        assertEquals(1, block.get("version"));
    }

    @Test
    void 删块_非空表被非发布者拒绝() {
        when(definitionMapper.selectById(10L)).thenReturn(repeatableForm());
        when(submissionMapper.selectByIdForUpdate(100L)).thenReturn(
                sharedSubmission("{\"__blocks\":["
                        + "{\"id\":\"b_default\",\"version\":0,\"values\":{\"f_a\":\"1\"}},"
                        + "{\"id\":\"b_2\",\"version\":0,\"values\":{\"f_a\":\"2\"}}]}"));

        User normalUser = new User();
        normalUser.setId("7");
        normalUser.setUsername("u7");
        normalUser.setRole(com.example.demo.common.enums.RoleEnum.STAFF);

        TwinBusinessException ex = assertThrows(TwinBusinessException.class, () ->
                service.deleteBlock(10L, 100L, "b_2", "STAFF", 7L, normalUser));
        assertTrue(ex.getMessage().contains("空白表格"));
        verify(submissionMapper, never()).updateFieldValues(anyLong(), anyString(), any());
    }

    @Test
    void 删块_空表放行_最后一块被拒() {
        when(definitionMapper.selectById(10L)).thenReturn(repeatableForm());
        when(submissionMapper.selectByIdForUpdate(100L)).thenReturn(
                sharedSubmission("{\"__blocks\":["
                        + "{\"id\":\"b_default\",\"version\":0,\"values\":{\"f_a\":\"1\"}},"
                        + "{\"id\":\"b_2\",\"version\":0,\"values\":{}}]}"));
        when(submissionMapper.updateFieldValues(anyLong(), anyString(), any())).thenReturn(1);

        User normalUser = new User();
        normalUser.setId("7");
        normalUser.setUsername("u7");
        normalUser.setRole(com.example.demo.common.enums.RoleEnum.STAFF);

        service.deleteBlock(10L, 100L, "b_2", "STAFF", 7L, normalUser);
        verify(submissionMapper).updateFieldValues(eq(100L), anyString(), any());

        // 第二半段：只剩一块且为空 —— 先过空白守卫，才能走到「最后一块」检查
        when(submissionMapper.selectByIdForUpdate(100L)).thenReturn(sharedSubmission("{}"));
        TwinBusinessException ex = assertThrows(TwinBusinessException.class, () ->
                service.deleteBlock(10L, 100L, "b_default", "STAFF", 7L, normalUser));
        assertTrue(ex.getMessage().contains("至少要保留一张"));
    }
}

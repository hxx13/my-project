package com.example.demo.modules.reportform.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionLogMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReportFormUnboundVisibilityTest {

    private ReportFormDefinitionMapper definitionMapper;
    private ReportFillService service;

    @BeforeEach
    void setUp() {
        definitionMapper = mock(ReportFormDefinitionMapper.class);
        service = new ReportFillService(definitionMapper, mock(ReportFormSubmissionMapper.class),
                mock(ReportFormSubmissionLogMapper.class), new ObjectMapper(),
                mock(UserMapper.class), mock(UserDisplayNameService.class));
    }

    private ReportFormDefinition published(String permissionJson) {
        ReportFormDefinition f = new ReportFormDefinition();
        f.setId(40L);
        f.setName("表单");
        f.setStatus("published");
        f.setFillPolicyJson("{\"mode\":\"shared\"}");
        f.setPermissionJson(permissionJson);
        return f;
    }

    private User staff(String id, String name) {
        User u = new User();
        u.setId(id);
        u.setUsername(name);
        u.setRole(com.example.demo.common.enums.RoleEnum.STAFF);
        return u;
    }

    @Test
    void 关闭未绑定可见_名单外的人被过滤掉() {
        when(definitionMapper.selectPage()).thenReturn(List.of(published(
                "{\"visibleRoles\":[],\"visibleUserIds\":[999],\"fieldRoleBindings\":{},\"allowUnboundView\":false}")));

        var out = service.getAvailableEnriched("STAFF", 7L, staff("7", "u7"));
        assertTrue(out.isEmpty());
    }

    @Test
    void 关闭未绑定可见_名单内的人仍可见() {
        when(definitionMapper.selectPage()).thenReturn(List.of(published(
                "{\"visibleRoles\":[],\"visibleUserIds\":[7],\"fieldRoleBindings\":{},\"allowUnboundView\":false}")));

        var out = service.getAvailableEnriched("STAFF", 7L, staff("7", "u7"));
        assertEquals(1, out.size());
    }

    @Test
    void 缺省true_所有人都看得见_零回归() {
        when(definitionMapper.selectPage()).thenReturn(List.of(published(
                "{\"visibleRoles\":[],\"visibleUserIds\":[999],\"fieldRoleBindings\":{}}")));

        var out = service.getAvailableEnriched("STAFF", 7L, staff("7", "u7"));
        assertEquals(1, out.size());
    }

    @Test
    void 管理员始终可见() {
        when(definitionMapper.selectPage()).thenReturn(List.of(published(
                "{\"visibleRoles\":[],\"visibleUserIds\":[999],\"fieldRoleBindings\":{},\"allowUnboundView\":false}")));

        User admin = new User();
        admin.setId("1");
        admin.setUsername("admin");
        admin.setRole(com.example.demo.common.enums.RoleEnum.ADMIN);

        var out = service.getAvailableEnriched("ADMIN", 1L, admin);
        assertEquals(1, out.size());
    }
}

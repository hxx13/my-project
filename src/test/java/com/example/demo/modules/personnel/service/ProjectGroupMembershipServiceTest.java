package com.example.demo.modules.personnel.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.entity.ProjectGroupJoinRequest;
import com.example.demo.modules.personnel.entity.ProjectGroupMemberLog;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import com.example.demo.modules.personnel.mapper.ProjectGroupJoinRequestMapper;
import com.example.demo.modules.personnel.mapper.ProjectGroupMemberLogMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProjectGroupMembershipServiceTest {

    @Mock private PersonnelMapper personnelMapper;
    @Mock private ProjectGroupJoinRequestMapper joinRequestMapper;
    @Mock private ProjectGroupMemberLogMapper memberLogMapper;
    @Mock private PersonIdentityService personIdentityService;
    @Mock private NotificationService notificationService;
    @Mock private JdbcTemplate jdbcTemplate;

    private ProjectGroupMembershipService service() {
        return new ProjectGroupMembershipService(personnelMapper, joinRequestMapper, memberLogMapper,
                personIdentityService, notificationService, jdbcTemplate);
    }

    private static Personnel row(Long id, String name, String staffId, String aroUserId) {
        Personnel p = new Personnel();
        p.setId(id);
        p.setName(name);
        p.setStaffId(staffId);
        p.setAroUserId(aroUserId);
        return p;
    }

    // ── isPiOfGroup ──────────────────────────────────────────────

    @Test
    void isPiOfGroup_true_when_in_group_and_has_pi_tag() {
        Personnel p = row(1L, "张三", "STAFF_x", null);
        p.setProjectGroupId(10L);
        when(personnelMapper.findByStaffId("STAFF_x")).thenReturn(p);
        when(personIdentityService.isPi("STAFF_x")).thenReturn(true);

        assertTrue(service().isPiOfGroup("STAFF_x", 10L));
    }

    @Test
    void isPiOfGroup_false_when_has_pi_but_not_in_group() {
        Personnel p = row(1L, "张三", "STAFF_x", null);
        p.setProjectGroupId(99L); // 在别的组
        when(personnelMapper.findByStaffId("STAFF_x")).thenReturn(p);

        assertFalse(service().isPiOfGroup("STAFF_x", 10L));
    }

    @Test
    void isPiOfGroup_false_when_in_group_but_no_pi_tag() {
        Personnel p = row(1L, "张三", "STAFF_x", null);
        p.setProjectGroupId(10L);
        when(personnelMapper.findByStaffId("STAFF_x")).thenReturn(p);
        when(personIdentityService.isPi("STAFF_x")).thenReturn(false);

        assertFalse(service().isPiOfGroup("STAFF_x", 10L));
    }

    // ── apply ────────────────────────────────────────────────────

    @Test
    void apply_rejects_person_who_already_has_group() {
        Personnel p = row(1L, "张三", null, "19d");
        p.setProjectGroupId(5L);
        when(personnelMapper.findByStaffId("19d")).thenReturn(null);
        when(personnelMapper.findByAroUserId("19d")).thenReturn(p);

        TwinBusinessException ex = assertThrows(TwinBusinessException.class,
                () -> service().apply("19d", 10L, "我想加入"));
        assertTrue(ex.getMessage().contains("已在课题组"));
    }

    @Test
    void apply_succeeds_for_groupless_person() {
        Personnel p = row(1L, "张三", null, "19d");
        when(personnelMapper.findByStaffId("19d")).thenReturn(null);
        when(personnelMapper.findByAroUserId("19d")).thenReturn(p);
        when(jdbcTemplate.queryForList(anyString(), eq(String.class), eq(10L))).thenReturn(List.of("组A"));
        when(joinRequestMapper.selectPendingByGroupAndPersonnel(10L, 1L)).thenReturn(null);
        when(personnelMapper.listByProjectGroup(10L)).thenReturn(List.of());
        // 模拟 MyBatis @Options(useGeneratedKeys=true) 回填主键
        doAnswer(inv -> {
            inv.<ProjectGroupJoinRequest>getArgument(0).setId(500L);
            return 1;
        }).when(joinRequestMapper).insert(any(ProjectGroupJoinRequest.class));

        service().apply("19d", 10L, "我想加入");

        verify(joinRequestMapper).insert(any(ProjectGroupJoinRequest.class));
    }

    @Test
    void apply_rejects_duplicate_pending() {
        Personnel p = row(1L, "张三", null, "19d");
        when(personnelMapper.findByStaffId("19d")).thenReturn(null);
        when(personnelMapper.findByAroUserId("19d")).thenReturn(p);
        when(jdbcTemplate.queryForList(anyString(), eq(String.class), eq(10L))).thenReturn(List.of("组A"));
        when(joinRequestMapper.selectPendingByGroupAndPersonnel(10L, 1L)).thenReturn(new ProjectGroupJoinRequest());

        TwinBusinessException ex = assertThrows(TwinBusinessException.class,
                () -> service().apply("19d", 10L, "我想加入"));
        assertTrue(ex.getMessage().contains("待处理"));
    }

    // ── approve ──────────────────────────────────────────────────

    @Test
    void approve_rejects_request_not_in_my_group() {
        Personnel pi = row(2L, "李四", "STAFF_x", null);
        pi.setProjectGroupId(10L);
        when(personnelMapper.findByStaffId("STAFF_x")).thenReturn(pi);
        when(personIdentityService.isPi("STAFF_x")).thenReturn(true);

        ProjectGroupJoinRequest r = new ProjectGroupJoinRequest();
        r.setId(99L);
        r.setProjectGroupId(20L); // 不属于我的组
        r.setPersonnelId(1L);
        r.setStatus("PENDING");
        when(joinRequestMapper.selectById(99L)).thenReturn(r);

        TwinBusinessException ex = assertThrows(TwinBusinessException.class,
                () -> service().approve("STAFF_x", 99L));
        assertTrue(ex.getMessage().contains("不存在"));
    }

    @Test
    void approve_writes_personnel_and_aro_personnel_and_log() {
        Personnel pi = row(2L, "李四", "STAFF_x", null);
        pi.setProjectGroupId(10L);
        Personnel applicant = row(1L, "张三", null, "19digits");
        when(personnelMapper.findByStaffId("STAFF_x")).thenReturn(pi);
        when(personIdentityService.isPi("STAFF_x")).thenReturn(true);

        ProjectGroupJoinRequest r = new ProjectGroupJoinRequest();
        r.setId(99L);
        r.setProjectGroupId(10L);
        r.setPersonnelId(1L);
        r.setStatus("PENDING");
        when(joinRequestMapper.selectById(99L)).thenReturn(r);
        when(joinRequestMapper.updateStatus(eq(99L), eq("APPROVED"), eq(2L), isNull())).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), eq(String.class), eq(10L))).thenReturn(List.of("组A"));
        when(personnelMapper.findById(1L)).thenReturn(applicant);

        service().approve("STAFF_x", 99L);

        // personnel 归属 + 文本快照
        verify(personnelMapper).updateProjectGroupRef(1L, 10L, "组A");
        // aro_personnel（学生端个人信息页读的表）
        verify(jdbcTemplate).update(contains("aro_personnel"), eq("组A"), eq("19digits"));
        // 留痕
        verify(memberLogMapper).insert(any(ProjectGroupMemberLog.class));
    }

    // ── removeMember ─────────────────────────────────────────────

    @Test
    void removeMember_rejects_target_not_in_my_group() {
        Personnel pi = row(2L, "李四", "STAFF_x", null);
        pi.setProjectGroupId(10L);
        when(personnelMapper.findByStaffId("STAFF_x")).thenReturn(pi);
        when(personIdentityService.isPi("STAFF_x")).thenReturn(true);

        Personnel target = row(3L, "王五", null, "19d");
        target.setProjectGroupId(20L); // 不在我的组
        when(personnelMapper.findById(3L)).thenReturn(target);

        TwinBusinessException ex = assertThrows(TwinBusinessException.class,
                () -> service().removeMember("STAFF_x", 3L, "违规"));
        assertTrue(ex.getMessage().contains("不在你的课题组"));
    }

    @Test
    void removeMember_clears_project_group() {
        Personnel pi = row(2L, "李四", "STAFF_x", null);
        pi.setProjectGroupId(10L);
        when(personnelMapper.findByStaffId("STAFF_x")).thenReturn(pi);
        when(personIdentityService.isPi("STAFF_x")).thenReturn(true);

        Personnel target = row(3L, "王五", null, "19d");
        target.setProjectGroupId(10L);
        when(personnelMapper.findById(3L)).thenReturn(target);
        when(personnelMapper.clearProjectGroupRefIfInGroup(3L, 10L)).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), eq(String.class), eq(10L))).thenReturn(List.of("组A"));

        service().removeMember("STAFF_x", 3L, "违规");

        verify(personnelMapper).clearProjectGroupRefIfInGroup(3L, 10L);
        verify(jdbcTemplate).update(contains("aro_personnel"), eq("19d"));
    }
}

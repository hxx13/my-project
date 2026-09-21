package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.config.CageTransferApprovalConfigSeed;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CageReviewVetServiceTest {

    @Mock private NotificationSettingsService settingsService;
    @Mock private PersonIdentityService personIdentityService;
    @Mock private UserGroupNameResolver userGroupNameResolver;

    private CageReviewVetService service;

    @BeforeEach
    void setUp() {
        service = new CageReviewVetService(settingsService, personIdentityService, userGroupNameResolver);
        // 非 STAFF_ 账号 canonicalUserId 原样返回（与线上同口径），让名单里 A1/A2 这类假 id 保持可读
        when(userGroupNameResolver.canonicalUserId(anyString())).thenAnswer(inv -> inv.getArgument(0));
    }

    private void stubRoster(String json) {
        when(settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_REVIEW_VET_IDS,
                CageTransferApprovalConfigSeed.DEFAULT_REVIEW_VET_IDS)).thenReturn(json);
    }

    @Test
    void 名单里且仍是兽医身份_可签() {
        stubRoster("[\"A1\",\"A2\"]");
        when(personIdentityService.isVeterinarian("A1")).thenReturn(true);

        assertTrue(service.canSignAsVet("A1"));
    }

    @Test
    void 名单里但身份标签已被撤销_不可签() {
        stubRoster("[\"A1\"]");
        when(personIdentityService.isVeterinarian("A1")).thenReturn(false);

        assertFalse(service.canSignAsVet("A1"), "标签撤销后名单残留的人不能继续签");
    }

    @Test
    void STAFF账号_名单存ARO形态_折算后仍可签() {
        // 同一个人两种 id：调用方给 STAFF_*，名单按 canonical（ARO 编号）存
        // 不折算就会拿 STAFF_abc 去比 ARO 编号，合法兽医被静默拒签
        when(userGroupNameResolver.canonicalUserId("STAFF_abc")).thenReturn("1688784712455168001");
        stubRoster("[\"1688784712455168001\"]");
        when(personIdentityService.isVeterinarian("STAFF_abc")).thenReturn(true);

        assertTrue(service.canSignAsVet("STAFF_abc"));
    }

    @Test
    void 不在名单_直接不可签且不查身份() {
        stubRoster("[\"A1\"]");

        assertFalse(service.canSignAsVet("B9"));
        verify(personIdentityService, never()).isVeterinarian(any());
    }

    @Test
    void 空名单_任何人都不可签() {
        stubRoster("[]");

        assertFalse(service.canSignAsVet("A1"));
    }

    @Test
    void 保存时_逐个校验身份_有人不合格则整体拒绝且不落库() {
        when(personIdentityService.isVeterinarian("A1")).thenReturn(true);
        when(personIdentityService.isVeterinarian("B9")).thenReturn(false);

        assertThrows(IllegalArgumentException.class,
                () -> service.replace(List.of("A1", "B9"), "op-1"));
        verify(settingsService, never()).updateConfig(anyLong(), any(), any());
    }

    @Test
    void 保存时_全部合格则写JSON数组() {
        when(personIdentityService.isVeterinarian("A1")).thenReturn(true);
        when(settingsService.listConfigs(CageTransferApprovalConfigSeed.MODULE))
                .thenReturn(List.of(item(7L, CageTransferApprovalConfigSeed.KEY_REVIEW_VET_IDS)));
        // updateConfig 返回 false 会被服务层当成失败并抛异常，所以必须显式打成 true
        when(settingsService.updateConfig(anyLong(), any(), eq("op-1"))).thenReturn(true);

        service.replace(List.of("A1"), "op-1");

        ArgumentCaptor<UpdateSystemConfigRequest> cap = ArgumentCaptor.forClass(UpdateSystemConfigRequest.class);
        verify(settingsService).updateConfig(eq(7L), cap.capture(), eq("op-1"));
        assertEquals("[\"A1\"]", cap.getValue().getConfigValue());
        // remark 必须原样带回：updateConfig 会无条件写回，丢了就把配置项描述清空
        assertEquals("审核兽医名单", cap.getValue().getRemark());
    }

    @Test
    void 候选人补canonical列_STAFF折算非STAFF原样_空值不炸且不改入参() {
        when(userGroupNameResolver.canonicalUserId("STAFF_abc")).thenReturn("1688784712455168001");
        Map<String, Object> staff = new LinkedHashMap<>();
        staff.put("accountId", "STAFF_abc");
        staff.put("name", "王兽医");
        Map<String, Object> plain = new LinkedHashMap<>();
        plain.put("accountId", "A1");
        Map<String, Object> missing = new LinkedHashMap<>();
        missing.put("name", "无账号");
        List<Map<String, Object>> input = List.of(staff, plain, missing);

        List<Map<String, Object>> out = service.annotateCandidates(input);

        assertEquals(3, out.size());
        // STAFF_* 必须折成 ARO 编号，界面才能和 canonical 名单对上；非 STAFF_ 原样；accountId 缺失 -> null
        assertEquals("1688784712455168001", out.get(0).get("canonicalAccountId"));
        assertEquals("A1", out.get(1).get("canonicalAccountId"));
        assertNull(out.get(2).get("canonicalAccountId"));
        // 逐条复制，不改入参（入参里不能被塞进 canonicalAccountId）
        assertFalse(staff.containsKey("canonicalAccountId"));
        assertEquals("王兽医", out.get(0).get("name"));
    }

    private static SystemConfigItem item(Long id, String key) {
        SystemConfigItem it = new SystemConfigItem();
        it.setId(id);
        it.setModule(CageTransferApprovalConfigSeed.MODULE);
        it.setConfigKey(key);
        it.setRemark("审核兽医名单");
        return it;
    }
}

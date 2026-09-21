package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.config.CageTransferApprovalConfigSeed;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.entity.CageOwnerApprovalConfig;
import com.example.demo.modules.cageshelf.mapper.CageOwnerApprovalConfigMapper;
import com.example.demo.modules.notification.dto.UpdateSystemConfigRequest;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 回归：三个审核开关改为「按所属人」后，
 * ① 没配过的人必须默认**需要审核**（不能默默放行）；
 * ② 配过的人按自己那一行取值；
 * ③ STAFF_ 账号要先折算成 ARO 编号再查，否则同一人会存出两份互不相干的配置。
 */
@ExtendWith(MockitoExtension.class)
class CageOwnerApprovalConfigServiceTest {

    private static final String STAFF_ID = "STAFF_5dbf2e4d49c3417cb93739010636d7d4";
    private static final String ARO_ID = "1688784712455168001";

    @Mock private CageOwnerApprovalConfigMapper mapper;
    @Mock private UserDisplayNameService displayNameService;
    @Mock private UserGroupNameResolver userGroupNameResolver;
    @Mock private NotificationSettingsService settingsService;

    private CageOwnerApprovalConfigService service;

    @BeforeEach
    void setUp() {
        // 默认非强制：既有用例的语义都是「按所属人那一行取值」，不强制才成立。
        // 用 lenient 是因为并非每个用例都会走到读配置那一行。
        lenient().when(settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_TRANSFER_FORCED,
                CageTransferApprovalConfigSeed.DEFAULT_TRANSFER_FORCED)).thenReturn("false");
        service = new CageOwnerApprovalConfigService(mapper, displayNameService, userGroupNameResolver, settingsService);
    }

    private CageOwnerApprovalConfig row(boolean confirm, boolean divide, boolean transfer) {
        CageOwnerApprovalConfig r = new CageOwnerApprovalConfig();
        r.setOwnerAccountId(ARO_ID);
        r.setConfirmRequired(confirm);
        r.setDivideApprovalRequired(divide);
        r.setTransferApprovalRequired(transfer);
        return r;
    }

    @Test
    void 没配过的所属人_三个开关一律需要审核() {
        when(userGroupNameResolver.canonicalUserId(ARO_ID)).thenReturn(ARO_ID);
        when(mapper.selectByOwner(ARO_ID)).thenReturn(null);

        assertTrue(service.confirmRequiredFor(ARO_ID));
        assertTrue(service.approvalRequiredFor(ARO_ID, CageOpRequest.TYPE_DIVIDE));
        assertTrue(service.approvalRequiredFor(ARO_ID, CageOpRequest.TYPE_TRANSFER));
    }

    @Test
    void 配过的所属人_按自己那一行取值() {
        when(userGroupNameResolver.canonicalUserId(ARO_ID)).thenReturn(ARO_ID);
        when(mapper.selectByOwner(ARO_ID)).thenReturn(row(false, false, true));

        assertFalse(service.confirmRequiredFor(ARO_ID));
        assertFalse(service.approvalRequiredFor(ARO_ID, CageOpRequest.TYPE_DIVIDE));
        assertTrue(service.approvalRequiredFor(ARO_ID, CageOpRequest.TYPE_TRANSFER));
    }

    @Test
    void staff账号_折算成aro编号后再查配置() {
        when(userGroupNameResolver.canonicalUserId(STAFF_ID)).thenReturn(ARO_ID);
        when(mapper.selectByOwner(ARO_ID)).thenReturn(row(true, false, false));

        assertFalse(service.approvalRequiredFor(STAFF_ID, CageOpRequest.TYPE_DIVIDE));
        assertFalse(service.approvalRequiredFor(STAFF_ID, CageOpRequest.TYPE_TRANSFER));
        verify(mapper, org.mockito.Mockito.never()).selectByOwner(STAFF_ID);
    }

    @Test
    void 保存时_写入折算后的账号且null按需要审核落库() {
        when(userGroupNameResolver.canonicalUserId(STAFF_ID)).thenReturn(ARO_ID);

        service.save(STAFF_ID, null, false, null, "op-1");

        ArgumentCaptor<CageOwnerApprovalConfig> cap = ArgumentCaptor.forClass(CageOwnerApprovalConfig.class);
        verify(mapper).upsert(cap.capture());
        CageOwnerApprovalConfig saved = cap.getValue();
        assertEquals(ARO_ID, saved.getOwnerAccountId());
        assertTrue(saved.getConfirmRequired());
        assertFalse(saved.getDivideApprovalRequired());
        assertTrue(saved.getTransferApprovalRequired());
        assertEquals("op-1", saved.getUpdateBy());
    }

    @Test
    void 空账号_直接按默认处理且不查配置表() {
        assertNull(service.canonical(null));
        assertTrue(service.effective(null).getConfirmRequired());
        assertTrue(service.effective("  ").getConfirmRequired());
        // 空白账号折算后为空 → 不该落库查询
        verifyNoInteractions(mapper);
    }

    @Test
    void 全局强制开启时_所属人把转移审核关掉也仍然需要审核() {
        when(userGroupNameResolver.canonicalUserId(ARO_ID)).thenReturn(ARO_ID);
        when(mapper.selectByOwner(ARO_ID)).thenReturn(row(true, true, false));
        when(settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_TRANSFER_FORCED,
                CageTransferApprovalConfigSeed.DEFAULT_TRANSFER_FORCED)).thenReturn("true");

        assertTrue(service.approvalRequiredFor(ARO_ID, CageOpRequest.TYPE_TRANSFER));
        // 分笼不受强制影响
        assertTrue(service.approvalRequiredFor(ARO_ID, CageOpRequest.TYPE_DIVIDE));
    }

    @Test
    void 全局强制开启时_保存转移审核为false会被服务端改写为true() {
        when(userGroupNameResolver.canonicalUserId(ARO_ID)).thenReturn(ARO_ID);
        when(settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_TRANSFER_FORCED,
                CageTransferApprovalConfigSeed.DEFAULT_TRANSFER_FORCED)).thenReturn("true");

        service.save(ARO_ID, true, true, false, "op-1");

        ArgumentCaptor<CageOwnerApprovalConfig> cap = ArgumentCaptor.forClass(CageOwnerApprovalConfig.class);
        verify(mapper).upsert(cap.capture());
        assertTrue(cap.getValue().getTransferApprovalRequired(), "强制开启时服务端必须把 false 改写为 true");
    }

    @Test
    void 非强制时_保存false照旧落库() {
        when(userGroupNameResolver.canonicalUserId(ARO_ID)).thenReturn(ARO_ID);

        service.save(ARO_ID, true, true, false, "op-1");

        ArgumentCaptor<CageOwnerApprovalConfig> cap = ArgumentCaptor.forClass(CageOwnerApprovalConfig.class);
        verify(mapper).upsert(cap.capture());
        assertFalse(cap.getValue().getTransferApprovalRequired());
    }

    @Test
    void 强制开关的读写() {
        when(settingsService.getEffectiveValue(
                CageTransferApprovalConfigSeed.MODULE,
                CageTransferApprovalConfigSeed.KEY_TRANSFER_FORCED,
                CageTransferApprovalConfigSeed.DEFAULT_TRANSFER_FORCED)).thenReturn("true");
        // 设置中心按运行值行的 id 更新，故先要有这一行（播种已保证）。
        SystemConfigItem item = new SystemConfigItem();
        item.setId(7L);
        item.setConfigKey(CageTransferApprovalConfigSeed.KEY_TRANSFER_FORCED);
        item.setConfigValue("true");
        item.setRemark("强制开启转移审核");
        when(settingsService.listConfigs(CageTransferApprovalConfigSeed.MODULE)).thenReturn(List.of(item));
        when(settingsService.updateConfig(anyLong(), any(), eq("op-9"))).thenReturn(true);

        assertTrue(service.transferForced());

        service.setTransferForced(false, "op-9");

        ArgumentCaptor<UpdateSystemConfigRequest> cap = ArgumentCaptor.forClass(UpdateSystemConfigRequest.class);
        verify(settingsService).updateConfig(anyLong(), cap.capture(), eq("op-9"));
        assertEquals("false", cap.getValue().getConfigValue());
        // 覆盖目标行原有的说明不能被写没（updateConfig 无条件写 remark）
        assertNotNull(cap.getValue().getRemark());
    }
}

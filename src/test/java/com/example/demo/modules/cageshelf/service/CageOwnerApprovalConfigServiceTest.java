package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.entity.CageOwnerApprovalConfig;
import com.example.demo.modules.cageshelf.mapper.CageOwnerApprovalConfigMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
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

    private CageOwnerApprovalConfigService service;

    @BeforeEach
    void setUp() {
        service = new CageOwnerApprovalConfigService(mapper, displayNameService, userGroupNameResolver);
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
}

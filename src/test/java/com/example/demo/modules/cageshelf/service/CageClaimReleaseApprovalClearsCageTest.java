package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.mapper.ApprovalRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 释放审批通过必须真的腾空笼位。
 *
 * <p>只把 claim 状态翻成 released 的话，实验员/动物字段会永远留在笼位上——笼位看着没人认领却挂着人。
 * 正确做法是交给统一的归档出口（清占用/动物/状态 + 回空笼盒，保留 AUP 与课题组）。
 */
class CageClaimReleaseApprovalClearsCageTest {

    private static final String APPROVER = "STAFF_x";

    /** 只用到 claimMapper / approvalMapper / visibilityPolicy / occupancyService / userDisplayNameService，其余给 null。 */
    private static CageClaimService serviceWith(CageClaimMapper claimMapper, ApprovalRecordMapper approvalMapper,
                                                CageVisibilityPolicy visibilityPolicy,
                                                CageOccupancyService occupancyService) {
        return new CageClaimService(claimMapper, null, approvalMapper, null, null, null,
                mock(com.example.demo.modules.auth.service.UserDisplayNameService.class), null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                visibilityPolicy, null, occupancyService);
    }

    private static User approver() {
        User u = new User();
        u.setId(APPROVER);
        return u;
    }

    private static CageClaim releaseRequest(Long cageId) {
        CageClaim c = new CageClaim();
        c.setId(1L);
        c.setAnimalCageId(cageId);
        c.setClaimStatus("pending_release_approval");
        c.setClaimantName("林安顺");
        return c;
    }

    @Test
    void 释放审批通过_走归档出口腾空笼位() {
        CageClaimMapper claimMapper = mock(CageClaimMapper.class);
        CageOccupancyService occupancy = mock(CageOccupancyService.class);
        CageVisibilityPolicy policy = mock(CageVisibilityPolicy.class);
        when(policy.isGlobalViewer(org.mockito.ArgumentMatchers.any())).thenReturn(true);
        when(claimMapper.selectByIdForUpdate(1L)).thenReturn(releaseRequest(9L));

        serviceWith(claimMapper, mock(ApprovalRecordMapper.class), policy, occupancy)
                .approve(approver(), 1L, "approved", "学生毕业");

        verify(occupancy).archive(eq(9L), eq(APPROVER), contains("释放审批通过"));
    }

    @Test
    void 释放审批驳回_不动笼位() {
        CageClaimMapper claimMapper = mock(CageClaimMapper.class);
        CageOccupancyService occupancy = mock(CageOccupancyService.class);
        CageVisibilityPolicy policy = mock(CageVisibilityPolicy.class);
        when(policy.isGlobalViewer(org.mockito.ArgumentMatchers.any())).thenReturn(true);
        when(claimMapper.selectByIdForUpdate(1L)).thenReturn(releaseRequest(9L));

        serviceWith(claimMapper, mock(ApprovalRecordMapper.class), policy, occupancy)
                .approve(approver(), 1L, "rejected", "动物还在");

        verify(occupancy, never()).archive(org.mockito.ArgumentMatchers.any(), anyString(), anyString());
    }
}

package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.mapper.CageRegionGrantMapper;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 区域归属回归：
 * ① 可见范围只认 SCOPE + LEADER（REVIEWER 不算可见范围）；
 * ② 审核作用域自 2026-09-13 起改为「能力 + 区域」两段式 —— **分了区域就自带审核权**，
 *    不再只认 REVIEWER 表；迁移遗留的 REVIEWER 行仍认（它是显式授权）；
 * ③ 全局查看者的 covers() 必须恒真（拿空 scope 表达会被 contains 判成「不覆盖」，
 *    会让超管的待审列表和角标全空）。
 */
@ExtendWith(MockitoExtension.class)
class CageRegionGrantServiceTest {

    private static final String ACCOUNT = "STAFF_abc";
    private static final String PID = "42";
    private static final String LEADER_PID = "99";
    private static final String CAP = CageRegionGrantService.CAP_REVIEW_REGION;

    @Mock private CageRegionGrantMapper mapper;
    @Mock private PersonIdentityService identityService;
    @Mock private CageVisibilityPolicy visibilityPolicy;
    @Mock private CagePermissionService permissionService;
    @Mock private CageRegionCapabilityService regionCapabilityService;

    private CageRegionGrantService service;

    @BeforeEach
    void setUp() {
        service = new CageRegionGrantService(mapper, identityService, visibilityPolicy,
                permissionService, regionCapabilityService);
        // 全局查看者的用例会在解析前短路，这个桩不是每个用例都用得上
        lenient().when(identityService.resolveIdByAccount(anyString())).thenReturn(PID);
    }

    private User user() {
        User u = new User();
        u.setId(ACCOUNT);
        return u;
    }

    private CageRegionGrant grant(String type, String id, String role) {
        CageRegionGrant g = new CageRegionGrant();
        g.setRegionType(type);
        g.setRegionId(id);
        g.setUserId(PID);
        g.setGrantRole(role);
        return g;
    }

    @Test
    void visibilityScopesOnlyLookAtScopeRole() {
        when(mapper.listByUser(PID)).thenReturn(List.of(
                grant("ROOM", "r1", "SCOPE"),
                grant("FLOOR", "f1", "REVIEWER")));
        Map<String, List<String>> grouped = service.visibilityScopes(ACCOUNT);
        assertEquals(List.of("r1"), grouped.get("ROOM"));
        assertTrue(grouped.getOrDefault("FLOOR", List.of()).isEmpty(), "REVIEWER 不应进入可见范围");
    }

    /**
     * 回归：分配页自 2026-09-15 起写的是 LEADER 行，可见范围**必须**认它。
     * 只读 SCOPE 会让「给饲养组长分配区域」无效——4A 上线时就是这么错的。
     */
    @Test
    void leaderRowsCountAsVisibilityScope() {
        when(mapper.listByUser(PID)).thenReturn(List.of(grant("ROOM", "r1", "LEADER")));
        Map<String, List<String>> grouped = service.visibilityScopes(ACCOUNT);
        assertEquals(List.of("r1"), grouped.get("ROOM"), "组长负责区域必须计入可见范围");
    }

    @Test
    void reviewScopesOnlyLookAtReviewerRole() {
        when(mapper.listByUser(PID)).thenReturn(List.of(
                grant("ROOM", "r1", "SCOPE"),
                grant("FLOOR", "f1", "REVIEWER")));
        Map<String, List<String>> grouped = service.reviewScopes(ACCOUNT);
        assertEquals(List.of("f1"), grouped.get("FLOOR"));
        assertTrue(grouped.getOrDefault("ROOM", List.of()).isEmpty(), "SCOPE 不应带出审核权");
    }

    @Test
    void unresolvableAccountYieldsEmptyNotThrow() {
        when(identityService.resolveIdByAccount(anyString())).thenReturn(null);
        assertTrue(service.visibilityScopes(ACCOUNT).isEmpty());
        assertTrue(service.reviewScopes(ACCOUNT).isEmpty());
    }

    // ── 审核：能力 × 区域 两段式 ──

    /** 核心口径：**分了区域就自带审核权**，且只在自己区域内。 */
    @Test
    void leaderRegionGrantsReviewRightWithinThatRegionOnly() {
        when(permissionService.hasCapability(ACCOUNT, CAP)).thenReturn(true);
        when(mapper.listByUser(PID)).thenReturn(List.of(grant("ROOM", "r1", "LEADER")));
        CageRegionGrantService.ReviewAuthority auth = service.reviewAuthority(user());
        assertTrue(auth.covers("r1", null, null), "分到的区域必须能审");
        assertFalse(auth.covers("r2", null, null), "没分到的区域不能审");
    }

    /** 有能力但没有任何区域 → 审不了（fail-closed）。 */
    @Test
    void capabilityWithoutAnyRegionIsNotEnough() {
        when(permissionService.hasCapability(ACCOUNT, CAP)).thenReturn(true);
        when(mapper.listByUser(PID)).thenReturn(List.of());
        assertFalse(service.reviewAuthority(user()).covers("r1", null, null));
    }

    /** 迁移遗留：被直接指认过的审核人（REVIEWER 行）即使矩阵没给能力，也仍可审。 */
    @Test
    void legacyReviewerRowStillGrantsAuditRight() {
        when(permissionService.hasCapability(ACCOUNT, CAP)).thenReturn(false);
        when(mapper.listByUser(PID)).thenReturn(List.of(grant("FLOOR", "f1", "REVIEWER")));
        CageRegionGrantService.ReviewAuthority auth = service.reviewAuthority(user());
        assertTrue(auth.active(), "遗留 REVIEWER 行本身就是显式授权");
        assertTrue(auth.covers(null, "f1", null));
    }

    /** 逐人下放：组员拿到能力后，作用域 = 自己 ∪ 组长的区域（MEMBER 行靠 leader_user_id 派生）。 */
    @Test
    void memberInheritsLeadersRegionsForAudit() {
        CageRegionGrant memberRow = grant("LEADER_GROUP", LEADER_PID, "MEMBER");
        memberRow.setLeaderUserId(LEADER_PID);
        when(permissionService.hasCapability(ACCOUNT, CAP)).thenReturn(true);
        when(mapper.listByUser(PID)).thenReturn(List.of(memberRow));
        when(mapper.listByUser(LEADER_PID)).thenReturn(List.of(grant("ROOM", "r9", "LEADER")));

        assertTrue(service.reviewAuthority(user()).covers("r9", null, null), "组员应能审组长区域");
    }

    /** 回归：全局查看者没有作用域可言，covers() 必须恒真，否则超管的待审列表/角标会全空。 */
    @Test
    void globalViewerCoversEverything() {
        when(visibilityPolicy.isGlobalViewer(any())).thenReturn(true);
        CageRegionGrantService.ReviewAuthority auth = service.reviewAuthority(user());
        assertTrue(auth.covers("any-room", null, null));
        assertTrue(auth.covers(null, null, null), "连 id 都没有也算覆盖（避免列表被滤空）");
    }

    /** 既没能力、也没有遗留行 → 拒。 */
    @Test
    void noCapabilityAndNoLegacyRowIsDenied() {
        when(permissionService.hasCapability(ACCOUNT, CAP)).thenReturn(false);
        when(mapper.listByUser(PID)).thenReturn(List.of(grant("ROOM", "r1", "LEADER")));
        CageRegionGrantService.ReviewAuthority auth = service.reviewAuthority(user());
        assertFalse(auth.active());
        assertFalse(auth.covers("r1", null, null), "光有区域没有能力也不该能审");
    }

    /**
     * 一人只能属于一个饲养组长：已经在**别人**组里的人不能再被纳管，
     * 而且要整包拒绝（不能悄悄跳过那几个人、把其余人照常写进去）。
     */
    @Test
    void memberAlreadyInAnotherGroupIsRejectedWholesale() {
        when(identityService.resolveIdByAccount("STAFF_leader")).thenReturn(LEADER_PID);
        when(identityService.resolveIdByAccount("STAFF_taken")).thenReturn("7");
        when(identityService.resolveIdByAccount("STAFF_free")).thenReturn("8");
        when(mapper.listMemberOwners(eq(LEADER_PID), anyList()))
                .thenReturn(List.of(Map.of("memberName", "张三", "leaderName", "李四")));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service.replaceMembers("STAFF_leader", List.of("STAFF_free", "STAFF_taken"), "op"));
        assertTrue(ex.getMessage().contains("张三"), "报错要说清是谁被占了：" + ex.getMessage());
        assertTrue(ex.getMessage().contains("李四"), "报错要说清被谁占了：" + ex.getMessage());
        verify(mapper, never()).insert(any());
        verify(mapper, never()).deleteMembersByLeader(anyString());
    }

    /** 没被别人占的人照常入库（守卫不能把正常路径一起挡掉）。 */
    @Test
    void freeMembersAreStillWritten() {
        when(identityService.resolveIdByAccount("STAFF_leader")).thenReturn(LEADER_PID);
        when(identityService.resolveIdByAccount("STAFF_free")).thenReturn("8");
        when(mapper.listMemberOwners(eq(LEADER_PID), anyList())).thenReturn(List.of());

        service.replaceMembers("STAFF_leader", List.of("STAFF_free"), "op");

        ArgumentCaptor<CageRegionGrant> saved = ArgumentCaptor.forClass(CageRegionGrant.class);
        verify(mapper).insert(saved.capture());
        assertEquals("8", saved.getValue().getUserId());
        assertEquals(LEADER_PID, saved.getValue().getLeaderUserId());
        assertEquals(CageRegionGrant.ROLE_MEMBER, saved.getValue().getGrantRole());
    }
}

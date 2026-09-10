package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 回归：代认领/分配的目标人若是 STAFF_ 账号，必须先经 user_aro_binding 展开成 aro_user_id
 * 才能查到 aro_personnel 课题组；否则课题组为空，被判「不在该笼位的课题组范围内」。
 */
@ExtendWith(MockitoExtension.class)
class UserGroupNameResolverTest {

    private static final String STAFF_ID = "STAFF_5dbf2e4d49c3417cb93739010636d7d4";
    private static final String ARO_ID = "1688784712455168001";

    @Mock private AroPersonnelMapper aroPersonnelMapper;
    @Mock private UserAroBindingMapper userAroBindingMapper;

    private UserGroupNameResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new UserGroupNameResolver(aroPersonnelMapper, userAroBindingMapper);
    }

    private AroPersonnel personnelOf(String projectGroupNames) {
        AroPersonnel p = new AroPersonnel();
        p.setProjectGroupName(projectGroupNames);
        return p;
    }

    @Test
    void resolve_staffId_expandsViaBindingBeforeAroLookup() {
        UserAroBinding binding = new UserAroBinding();
        binding.setUserId(STAFF_ID);
        binding.setAroUserId(ARO_ID);
        when(userAroBindingMapper.selectByUserId(STAFF_ID)).thenReturn(binding);
        when(aroPersonnelMapper.findByUserId(ARO_ID)).thenReturn(personnelOf("DLAS-卢今的课题组"));

        assertEquals(List.of("DLAS-卢今的课题组"), resolver.resolve(STAFF_ID));
    }

    @Test
    void resolve_plainAroId_skipsBindingLookup() {
        when(aroPersonnelMapper.findByUserId(ARO_ID)).thenReturn(personnelOf("卢今的课题组, 张三的课题组"));

        assertEquals(List.of("卢今的课题组", "张三的课题组"), resolver.resolve(ARO_ID));
        verifyNoInteractions(userAroBindingMapper);
    }

    @Test
    void resolve_staffIdWithoutBinding_yieldsNoGroups() {
        when(userAroBindingMapper.selectByUserId(STAFF_ID)).thenReturn(null);
        when(aroPersonnelMapper.findByUserId(STAFF_ID)).thenReturn(null);

        assertEquals(List.of(), resolver.resolve(STAFF_ID));
    }

    // ══════════ 账号规范化：claimant_id 只能有一种形态 ══════════

    @Test
    void canonicalUserId_staffId_折算成Aro编号() {
        UserAroBinding binding = new UserAroBinding();
        binding.setUserId(STAFF_ID);
        binding.setAroUserId(ARO_ID);
        when(userAroBindingMapper.selectByUserId(STAFF_ID)).thenReturn(binding);

        assertEquals(ARO_ID, resolver.canonicalUserId(STAFF_ID));
    }

    @Test
    void canonicalUserId_非StaffId_原样返回且不查绑定() {
        assertEquals(ARO_ID, resolver.canonicalUserId(ARO_ID));
        verifyNoInteractions(userAroBindingMapper);
    }

    @Test
    void canonicalUserId_staffId无绑定_原样返回不丢人() {
        when(userAroBindingMapper.selectByUserId(STAFF_ID)).thenReturn(null);

        assertEquals(STAFF_ID, resolver.canonicalUserId(STAFF_ID));
    }

    @Test
    void canonicalUserId_空值安全() {
        assertNull(resolver.canonicalUserId(null));
    }
}

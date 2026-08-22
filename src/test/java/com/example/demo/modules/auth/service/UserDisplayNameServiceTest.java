package com.example.demo.modules.auth.service;

import com.example.demo.modules.aro.mapper.AroDatabaseMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserDisplayNameServiceTest {

    private static final String STAFF_ID = "STAFF_5dbf2e4d49c3417cb93739010636d7d4";
    private static final String ARO_ID = "1234567890123456789";

    @Mock private AroDatabaseMapper aroDatabaseMapper;
    @Mock private UserMapper userMapper;
    @Mock private PersonnelMapper personnelMapper;
    @Mock private UserAroBindingMapper userAroBindingMapper;

    private UserDisplayNameService service;

    @BeforeEach
    void setUp() {
        service = new UserDisplayNameService(
                aroDatabaseMapper, userMapper, personnelMapper, userAroBindingMapper);
    }

    @Test
    void resolveDisplayName_staffId_resolvesViaAroBindingAndPersonnelAroUserId() {
        UserAroBinding binding = new UserAroBinding();
        binding.setUserId(STAFF_ID);
        binding.setAroUserId(ARO_ID);
        when(userAroBindingMapper.selectByUserIds(List.of(STAFF_ID))).thenReturn(List.of(binding));

        when(personnelMapper.findByAccountIds(anyList())).thenAnswer(inv -> {
            @SuppressWarnings("unchecked")
            List<String> ids = inv.getArgument(0);
            if (!ids.contains(STAFF_ID) || !ids.contains(ARO_ID)) {
                return List.of();
            }
            Personnel p = new Personnel();
            p.setName("张三");
            p.setAroUserId(ARO_ID);
            return List.of(p);
        });

        assertEquals("张三", service.resolveDisplayName(STAFF_ID));
        verify(aroDatabaseMapper, never()).findPersonnelNameByUserId(STAFF_ID);
    }

    @Test
    void resolveDisplayName_staffId_fallsBackToSysUserName() {
        when(userAroBindingMapper.selectByUserIds(List.of(STAFF_ID))).thenReturn(List.of());
        when(personnelMapper.findByAccountIds(anyList())).thenReturn(List.of());

        User user = new User();
        user.setId(STAFF_ID);
        user.setName("李四");
        when(userMapper.findById(STAFF_ID)).thenReturn(user);

        assertEquals("李四", service.resolveDisplayName(STAFF_ID));
    }

    @Test
    void resolveDisplayNames_batchMapsStaffIdToPersonnelName() {
        UserAroBinding binding = new UserAroBinding();
        binding.setUserId(STAFF_ID);
        binding.setAroUserId(ARO_ID);
        when(userAroBindingMapper.selectByUserIds(List.of(STAFF_ID))).thenReturn(List.of(binding));

        Personnel p = new Personnel();
        p.setName("王五");
        p.setAroUserId(ARO_ID);
        when(personnelMapper.findByAccountIds(anyList())).thenReturn(List.of(p));

        Map<String, String> names = service.resolveDisplayNames(List.of(STAFF_ID));
        assertEquals("王五", names.get(STAFF_ID));
    }

    @Test
    void resolveDisplayName_directStaffIdOnPersonnel() {
        when(userAroBindingMapper.selectByUserIds(List.of(STAFF_ID))).thenReturn(List.of());

        Personnel p = new Personnel();
        p.setName("赵六");
        p.setStaffId(STAFF_ID);
        when(personnelMapper.findByAccountIds(eq(List.of(STAFF_ID)))).thenReturn(List.of(p));

        assertEquals("赵六", service.resolveDisplayName(STAFF_ID));
    }
}

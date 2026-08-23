package com.example.demo.modules.notification.push.binding;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotifyBindingServiceTest {

    @Mock private PersonnelNotifyBindingMapper bindingMapper;
    @Mock private PersonnelService personnelService;
    @Mock private UserMapper userMapper;

    private NotifyBindingService svc() {
        return new NotifyBindingService(bindingMapper, personnelService, userMapper);
    }

    @Test
    void readByChannel_resolvesPersonnel_thenFallsBackToSysUser() {
        when(personnelService.resolveIdByAccount("STAFF_0001")).thenReturn("7");
        PersonnelNotifyBinding row = new PersonnelNotifyBinding();
        row.setTargetValue("SCT123");
        when(bindingMapper.find(7L, "SERVER_CHAN")).thenReturn(row);
        assertEquals("SCT123", svc().readByChannel("STAFF_0001", "SERVER_CHAN"));
    }

    @Test
    void readByChannel_orphanAccount_readsSysUser() {
        when(personnelService.resolveIdByAccount("SYS_SUPER_ROOT")).thenReturn(null);
        when(userMapper.findSendKeyById("SYS_SUPER_ROOT")).thenReturn("SCT123");
        assertEquals("SCT123", svc().readByChannel("SYS_SUPER_ROOT", "SERVER_CHAN"));
    }

    @Test
    void writeByChannel_emptyValue_deletesRow() {
        when(personnelService.resolveIdByAccount("STAFF_0001")).thenReturn("7");
        svc().writeByChannel("STAFF_0001", "SERVER_CHAN", "");
        verify(bindingMapper).delete(7L, "SERVER_CHAN");
        verify(bindingMapper, never()).upsert(any());
    }
}

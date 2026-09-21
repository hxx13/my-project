package com.example.demo.modules.personnel.service;

import com.example.demo.common.util.StudentIdGenerator;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAuthBinding;
import com.example.demo.modules.auth.mapper.UserAuthBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import com.example.demo.modules.personnel.service.PersonnelAccountProvisioner.NewPersonSpec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersonnelAccountProvisionerTest {

    @Mock private UserMapper userMapper;
    @Mock private PersonnelMapper personnelMapper;
    @Mock private UserAuthBindingMapper userAuthBindingMapper;
    @Mock private PasswordCredentialService passwordCredentialService;
    @Mock private JdbcTemplate jdbcTemplate;

    private PersonnelAccountProvisioner service() {
        return new PersonnelAccountProvisioner(userMapper, personnelMapper, userAuthBindingMapper,
                passwordCredentialService, new StudentIdGenerator(1000L), jdbcTemplate);
    }

    @Test
    void provision_writes_all_four_tables_and_returns_19_digit_id() {
        when(userMapper.findByUsername("zhangsan")).thenReturn(null);
        when(passwordCredentialService.encodeForStorage("Passw0rd!")).thenReturn("HASH");
        when(passwordCredentialService.encryptPlaintext("Passw0rd!")).thenReturn("ENC");

        String id = service().provision(NewPersonSpec.builder()
                .username("zhangsan")
                .rawPassword("Passw0rd!")
                .accountSource("OUTSIDER")
                .name("张三")
                .idpUid("iam-uid-1")
                .build());

        assertTrue(id.matches("\\d{19}"), "id 应为 19 位纯数字，实际 " + id);
        verify(jdbcTemplate).update(contains("aro_personnel"), eq(id), eq("张三"), any(), any(), any(), any(), any());
        verify(personnelMapper).insert(any(Personnel.class));
        verify(userMapper).insertUser(any(User.class));
        verify(userAuthBindingMapper).insert(any(UserAuthBinding.class));
    }

    @Test
    void provision_writes_mobile_phone_into_sys_user_so_phone_login_works() {
        when(userMapper.findByUsername("zhangsan")).thenReturn(null);
        when(passwordCredentialService.encodeForStorage("Passw0rd!")).thenReturn("HASH");
        when(passwordCredentialService.encryptPlaintext("Passw0rd!")).thenReturn("ENC");

        String id = service().provision(NewPersonSpec.builder()
                .username("zhangsan")
                .rawPassword("Passw0rd!")
                .accountSource("OUTSIDER")
                .name("张三")
                .mobilePhone("13800138000")
                .build());

        // 手机号登录走 UserMapper.findByMobilePhone，查的是 sys_user.mobile_phone ——
        // 注册时就写进去，不能等 syncProfileToSysUser 那个定时任务
        verify(jdbcTemplate).update(contains("sys_user"), eq("13800138000"), eq(id));
    }

    @Test
    void provision_iam_path_writes_no_password_and_falls_back_name() {
        when(userMapper.findByUsername("10001")).thenReturn(null);

        String id = service().provision(NewPersonSpec.builder()
                .username("10001")
                .accountSource("IAM")
                .idpUid("iam-uid-1")
                .build());

        assertTrue(id.matches("\\d{19}"));

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insertUser(userCaptor.capture());
        assertNull(userCaptor.getValue().getPassword(), "IAM 建号不应写本地密码");
        assertEquals(AuthProfileConstants.IAM_OAUTH, userCaptor.getValue().getAuthProfile());
        verify(userMapper, never()).updatePasswordWithPlainById(anyString(), any(), any(), anyInt());

        ArgumentCaptor<Personnel> pCaptor = ArgumentCaptor.forClass(Personnel.class);
        verify(personnelMapper).insert(pCaptor.capture());
        assertEquals("10001", pCaptor.getValue().getName(), "name 空时应回落用户名");
    }

    @Test
    void provision_username_conflict_writes_nothing() {
        when(userMapper.findByUsername("taken")).thenReturn(new User());

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service().provision(NewPersonSpec.builder()
                        .username("taken")
                        .rawPassword("Passw0rd!")
                        .accountSource("OUTSIDER")
                        .build()));
        assertTrue(ex.getMessage().contains("用户名"));

        verifyNoInteractions(jdbcTemplate, personnelMapper);
        verify(userMapper, never()).insertUser(any());
        verify(userMapper, never()).updatePasswordWithPlainById(anyString(), any(), any(), anyInt());
        verify(userAuthBindingMapper, never()).insert(any());
    }

    @Test
    void provision_idpUid_already_bound_writes_nothing() {
        when(userMapper.findByUsername("zhangsan")).thenReturn(null);
        when(userAuthBindingMapper.findActiveByIdpUid("iam-uid-1")).thenReturn(new UserAuthBinding());

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service().provision(NewPersonSpec.builder()
                        .username("zhangsan")
                        .rawPassword("Passw0rd!")
                        .accountSource("OUTSIDER")
                        .idpUid("iam-uid-1")
                        .build()));
        assertTrue(ex.getMessage().contains("绑定"));

        verifyNoInteractions(jdbcTemplate, personnelMapper);
        verify(userMapper, never()).insertUser(any());
        verify(userMapper, never()).updatePasswordWithPlainById(anyString(), any(), any(), anyInt());
        verify(userAuthBindingMapper, never()).insert(any());
    }

    @Test
    void provision_rejects_weak_password() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service().provision(NewPersonSpec.builder()
                        .username("zhangsan")
                        .rawPassword("12345678")
                        .accountSource("OUTSIDER")
                        .build()));
        assertTrue(ex.getMessage().contains("密码"));

        verifyNoInteractions(jdbcTemplate, personnelMapper, userAuthBindingMapper);
        verify(userMapper, never()).insertUser(any());
    }
}

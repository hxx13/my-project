package com.example.demo.modules.student.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.AuthService;
import com.example.demo.modules.personnel.service.PersonnelAccountProvisioner;
import com.example.demo.modules.personnel.service.PersonnelAccountProvisioner.NewPersonSpec;
import com.example.demo.modules.student.dto.NewUserRegisterRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NewUserRegistrationServiceTest {

    @Mock private PersonnelAccountProvisioner provisioner;
    @Mock private AuthService authService;
    @Mock private UserMapper userMapper;

    private NewUserRegistrationService service(boolean open) {
        return new NewUserRegistrationService(open, provisioner, authService, userMapper);
    }

    private NewUserRegisterRequest fullRequest() {
        NewUserRegisterRequest req = new NewUserRegisterRequest();
        req.setUsername("zhangsan");
        req.setName("张三");
        req.setMobilePhone("13800138000");
        req.setGender(1);
        req.setPassword("Passw0rd!");
        return req;
    }

    @Test
    void switch_closed_returns_error_and_does_not_provision() {
        Result<?> result = service(false).register(fullRequest());

        assertNotNull(result);
        assertFalse(result.getSuccess());
        verifyNoInteractions(provisioner);
    }

    @Test
    void open_and_complete_provisions_outsider_with_username_mobile() {
        when(provisioner.provision(any(NewPersonSpec.class))).thenReturn("1000000000000000001");
        when(userMapper.findById(anyString())).thenReturn(new User());

        service(true).register(fullRequest());

        ArgumentCaptor<NewPersonSpec> captor = ArgumentCaptor.forClass(NewPersonSpec.class);
        verify(provisioner).provision(captor.capture());
        assertEquals("OUTSIDER", captor.getValue().getAccountSource());
        // 账号名是独立字段，不再取手机号
        assertEquals("zhangsan", captor.getValue().getUsername());
        // 手机号照样落到自己的字段上（它只是「也可以用来登录」，不是登录名）
        assertEquals("13800138000", captor.getValue().getMobilePhone());
    }

    @Test
    void duplicate_mobile_phone_rejected_and_does_not_provision() {
        // 手机号也是登录入口，已被别的账号绑定就不能再用来注册
        when(userMapper.findAllByMobilePhone("13800138000")).thenReturn(List.of(new User()));

        Result<?> result = service(true).register(fullRequest());

        assertFalse(result.getSuccess());
        assertTrue(result.getMessage().contains("手机号"), "错误文案应提到手机号，实际: " + result.getMessage());
        verifyNoInteractions(provisioner);
    }

    @Test
    void missing_username_errors_and_does_not_provision() {
        NewUserRegisterRequest req = fullRequest();
        req.setUsername(null);

        Result<?> result = service(true).register(req);

        assertFalse(result.getSuccess());
        verifyNoInteractions(provisioner);
    }

    @Test
    void missing_mobile_errors_and_does_not_provision() {
        NewUserRegisterRequest req = fullRequest();
        req.setMobilePhone(null);

        Result<?> result = service(true).register(req);

        assertFalse(result.getSuccess());
        verifyNoInteractions(provisioner);
    }

    @Test
    void idpUid_passed_through_to_provisioner() {
        when(provisioner.provision(any(NewPersonSpec.class))).thenReturn("1000000000000000001");
        when(userMapper.findById(anyString())).thenReturn(new User());
        NewUserRegisterRequest req = fullRequest();
        req.setIdpUid("iam-uid-1");

        service(true).register(req);

        ArgumentCaptor<NewPersonSpec> captor = ArgumentCaptor.forClass(NewPersonSpec.class);
        verify(provisioner).provision(captor.capture());
        assertEquals("iam-uid-1", captor.getValue().getIdpUid());
    }
}

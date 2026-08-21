package com.example.demo.modules.auth.iam;

import org.springframework.stereotype.Service;

/**
 * 统一认证自助注册占位实现。
 * <p>
 * TODO(iam-registration): app.iam.oauth.registration.enabled 当前为 false，
 * 登录链路不会调用本类；开启前勿挂前端注册页。
 */
@Service
public class IamRegistrationServiceStub implements IamRegistrationService {

    @Override
    public String registerFromIam(IamOAuthUserInfo iamUser) {
        throw new UnsupportedOperationException(
                "IAM 自助注册未启用（app.iam.oauth.registration.enabled=false）");
    }
}

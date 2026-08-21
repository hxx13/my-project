package com.example.demo.modules.auth.iam;

/**
 * 统一认证自助注册预留。
 * <p>
 * TODO(iam-registration): registration.enabled=false 时禁止进入本服务；
 * 开启后应在人员库未命中时落库 aro_personnel + sys_user 并写绑定。勿接前端入口。
 */
public interface IamRegistrationService {

    /**
     * @return 新建或激活后的本地 userId；当前实现恒抛不支持。
     */
    String registerFromIam(IamOAuthUserInfo iamUser);
}

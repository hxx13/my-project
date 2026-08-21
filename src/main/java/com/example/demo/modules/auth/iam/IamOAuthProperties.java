package com.example.demo.modules.auth.iam;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 上海交大医学院 IAM OAuth2（auth.shsmu.edu.cn）接入配置。
 * client-secret 仅服务端；勿写入前端/小程序/公开文档全文。
 */
@Data
@ConfigurationProperties(prefix = "app.iam.oauth")
public class IamOAuthProperties {

    /** 认证中心基址，默认 https://auth.shsmu.edu.cn */
    private String authBase = "https://auth.shsmu.edu.cn";

    private String clientId = "LADTWS";

    /** 仅环境变量 / 服务端配置注入，禁止进前端 */
    private String clientSecret = "";

    /** 须与 IAM 侧注册一致；生产为 https://aroultra.shsmu.edu.cn/（无 #） */
    private String redirectUri = "https://aroultra.shsmu.edu.cn/";

    /**
     * 统一认证自助注册（人员库无命中时自动建号）。
     * 当前关闭：enabled=false，禁止进入注册分支；仅预留架构。
     */
    private Registration registration = new Registration();

    @Data
    public static class Registration {
        /** 统一认证自助注册当前关闭，勿接前端 */
        private boolean enabled = false;
    }

    public String normalizedAuthBase() {
        String base = authBase == null ? "" : authBase.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base;
    }

    public String authorizeUrl() {
        return normalizedAuthBase() + "/idp/authCenter/authenticate";
    }

    public String tokenUrl() {
        return normalizedAuthBase() + "/idp/api/v3/oauth2/token";
    }

    public String userInfoUrl() {
        return normalizedAuthBase() + "/idp/api/v3/oauth2/userInfo";
    }

    public String oidcUserInfoUrl() {
        return normalizedAuthBase() + "/idp/oidc/getUserInfo";
    }

    public String gloUrl() {
        return normalizedAuthBase() + "/idp/authCenter/GLO";
    }
}

package com.example.demo.modules.aro.dto;

import lombok.Data;

/**
 * CAS 换回的 ARO JWT Token 信息。
 * Token 来自 ARO 的 loginAuth 接口，JWT payload 中携带用户身份。
 */
@Data
public class CasTokenInfo {
    /** 完整的 JWT Token 字符串 */
    private String token;

    /** CAS 账号名，如 "YF0408" */
    private String account;

    /** ARO 系统中的 userId（19位数字字符串），来自 JWT claim "userId" */
    private String aroUserId;

    /** 人员真实姓名，来自 JWT claim "userKey" */
    private String userKey;

    /** 角色名称，来自 JWT claim "roleNames" */
    private String roleNames;

    /** Token 过期时间（Unix 秒），来自 JWT claim "exp" */
    private long exp;
}

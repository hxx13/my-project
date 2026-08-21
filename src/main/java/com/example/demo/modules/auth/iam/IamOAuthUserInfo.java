package com.example.demo.modules.auth.iam;

import lombok.Data;

/**
 * IAM 换票后解析出的身份摘要（字段以 SSO 映射为准，本类取对接所需最小集）。
 */
@Data
public class IamOAuthUserInfo {
    /** IAM 稳定唯一标识（OIDC uid / sub），绑定主键 */
    private String idpUid;
    /** 登录账号 / 工号类字段（通常 = userName） */
    private String jobNumber;
    /** IAM userName 原文 */
    private String userName;
}

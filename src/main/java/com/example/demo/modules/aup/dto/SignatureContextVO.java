package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 签名资格上下文（§3.8 / §5.6 signature-context）。
 */
@Data
public class SignatureContextVO {

    private String email;
    /** 邮箱是否命中可信域（@shsmu.edu.cn 等） */
    private boolean domainTrusted;
    /** 是否强制要求手写签名 */
    private boolean signatureRequired;
}

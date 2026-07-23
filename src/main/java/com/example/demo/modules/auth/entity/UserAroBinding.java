package com.example.demo.modules.auth.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserAroBinding {
    private Long id;
    private String userId;
    private String aroUserId;
    private LocalDateTime createdAt;

    /** CAS换来的JWT(AES-256加密) */
    private String casToken;
    /** Token过期Unix秒 */
    private Long casTokenExp;
    /** CASTGC Cookie值(AES-256加密) */
    private String casTgc;
    /** CAS账号名 */
    private String casAccount;
}

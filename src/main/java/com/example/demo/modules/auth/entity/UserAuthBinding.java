package com.example.demo.modules.auth.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserAuthBinding {
    private Long id;
    private String userId;
    private String idpUid;
    private String idpUserName;
    private LocalDateTime boundAt;
    private LocalDateTime unboundAt;
}

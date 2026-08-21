package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 电子签名。 */
@Data
public class CrfSignature {
    private Long id;
    private Long recordId;
    private String signerId;
    private String signerRole;
    /** 录入人/复核人/监察员 */
    private String meaning;
    private String signatureHash;
    private LocalDateTime signedAt;
}

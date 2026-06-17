package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class SpecialChannelLoginRequest {
    private String userId;
    private String pin;
    /** 弹窗内人脸验证通过后为 true，与 pin 二选一 */
    private Boolean faceVerified;
}

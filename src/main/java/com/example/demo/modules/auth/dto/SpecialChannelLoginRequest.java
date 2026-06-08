package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class SpecialChannelLoginRequest {
    private String userId;
    private String pin;
}

package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class SetPinRequest {
    private String userId;
    private String pin;
}

package com.example.demo.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CasLoginRequest {
    @NotBlank
    private String ticket;  // ST-xxx from CAS callback
}

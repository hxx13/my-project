package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class BindEmailRequest {
    private String email;
    private String code;
}

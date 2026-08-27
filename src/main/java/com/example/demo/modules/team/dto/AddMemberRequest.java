package com.example.demo.modules.team.dto;

import lombok.Data;

@Data
public class AddMemberRequest {
    private Long personnelId;
    private String roleCode;
}

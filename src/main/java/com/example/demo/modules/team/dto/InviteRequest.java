package com.example.demo.modules.team.dto;

import lombok.Data;

import java.util.List;

@Data
public class InviteRequest {
    private List<Long> personnelIds;
    private String message;
}

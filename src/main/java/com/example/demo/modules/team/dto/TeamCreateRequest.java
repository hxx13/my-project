package com.example.demo.modules.team.dto;

import lombok.Data;

@Data
public class TeamCreateRequest {
    private String name;
    private String description;
    private String visibility;
    private Integer maxMembers;
}

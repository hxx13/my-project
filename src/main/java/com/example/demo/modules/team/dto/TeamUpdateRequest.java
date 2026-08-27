package com.example.demo.modules.team.dto;

import lombok.Data;

@Data
public class TeamUpdateRequest {
    private String name;
    private String description;
    private String visibility;
    private String avatar;
}

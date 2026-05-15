package com.example.demo.modules.roommapping.dto;

import lombok.Data;

/**
 * 管理员手动维护 {@code room_mapping_room.official_permission_level}；
 * {@code null} 表示清空为未配置。
 */
@Data
public class OfficialPermissionLevelPatchRequest {
    private Integer officialPermissionLevel;
}

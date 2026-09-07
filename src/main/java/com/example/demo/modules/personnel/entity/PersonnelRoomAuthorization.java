package com.example.demo.modules.personnel.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class PersonnelRoomAuthorization {
    private String aroUserId;
    private String roomId;
    private LocalDateTime updatedAt;
    private String updatedBy;
}

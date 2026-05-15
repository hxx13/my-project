package com.example.demo.modules.pagepermission.dto;

import lombok.Data;

import java.util.List;

@Data
public class BatchUpdatePagePermissionRequest {
    private List<Item> items;

    @Data
    public static class Item {
        private String nodeKey;
        private String minRole;
        private Integer enabled;
    }
}


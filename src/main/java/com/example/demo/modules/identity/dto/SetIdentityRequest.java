package com.example.demo.modules.identity.dto;

import lombok.Data;

import java.util.List;

/** 全量写入某人员身份标签的请求体。 */
@Data
public class SetIdentityRequest {
    private List<Long> tagIds;
}

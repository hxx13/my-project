package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 新建草稿请求。templateVersion 可空，后端取当前 PUBLISHED 模板。
 */
@Data
public class AupCreateRequest {

    private String templateVersion;
}

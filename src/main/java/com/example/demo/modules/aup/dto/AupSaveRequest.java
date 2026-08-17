package com.example.demo.modules.aup.dto;

import lombok.Data;

/**
 * 保存/自动保存草稿请求。expectedVersion 为 aup_data.version（乐观锁）。
 */
@Data
public class AupSaveRequest {

    private String dataJson;
    private Long expectedVersion;
}

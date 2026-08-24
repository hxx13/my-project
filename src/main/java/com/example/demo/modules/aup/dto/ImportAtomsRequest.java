package com.example.demo.modules.aup.dto;

import lombok.Data;

import java.util.List;

/** 把若干原子域字段整段插入当前草稿请求（POST /api/aup-template/{id}/import-atoms）。 */
@Data
public class ImportAtomsRequest {
    private List<Long> atomTemplateIds;
}

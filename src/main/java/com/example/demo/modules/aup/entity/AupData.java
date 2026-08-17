package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 当前草稿数据（aup_data，与 aup_record 1:1）。
 * data 为整表填报内容 JSON；version 为草稿保存 CAS 用乐观锁。
 */
@Data
public class AupData {

    private Long id;
    private Long aupId;
    /** 当前草稿 JSON（整表填报内容） */
    private String data;
    /** 乐观锁（草稿保存 CAS 用） */
    private Long version;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

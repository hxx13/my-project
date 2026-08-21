package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefCartView {
    private Long id;
    private String groupId;
    private Long refDataId;
    private Long aupRecordId;
    private Object specSelections;
    private Integer quantity;
    private String remark;
    private String packageStatus;
    private String packageRemark;
    private String addedBy;
    /** 加购人展示名（人员库/账号名；缺省时与 addedBy 相同） */
    private String addedByName;
    /** 参考数据展示名（fieldData.title 等），便于购物车刷新后仍可读 */
    private String refDataLabel;
    private LocalDateTime addedAt;
}

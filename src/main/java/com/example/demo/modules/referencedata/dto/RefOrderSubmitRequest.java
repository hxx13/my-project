package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.List;

@Data
public class RefOrderSubmitRequest {
    private String groupId;
    private String submitterId;
    private String submitterName;
    private String projectGroupName;
    /** 订单头展示用 AUP（多 AUP 时可空；合规以行级为准） */
    private Long aupRecordId;
    private String submitRemark;
    /** 下单校区：浦东 | 浦西，为空回退浦东（兼容旧客户端） */
    private String campus;
    /** 显式行集合；为空则从共享车取 READY 行（或 cartIds） */
    private List<RefCartUpsertRequest> lines;
    /** 指定提交的购物车行 id；为空且无 lines 时默认全部 READY 行 */
    private List<Long> cartIds;
}

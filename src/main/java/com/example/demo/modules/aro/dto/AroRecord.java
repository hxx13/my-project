package com.example.demo.modules.aro.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true) // 依然保留防弹衣：如果 ARO 以后偷偷加了字段，我们也不会报错崩溃
public class AroRecord {

    // 核心溯源字段
    private String id;                  // 唯一流水ID (如: 2034525746445213697)
    private Integer accessType;              // 核心状态: 0=在内未出, 1=离开, 2=进入
    private String createTime;          // 刷卡时间 (如: 2026-03-19 15:01:52)

    // 人员身份画像
    private String userId;              // 用户ID
    private String name;                // 姓名 (如: 林安顺)
    private String email;               // 邮箱
    private String mobilePhone;         // 手机号
    private String officePhone;         // 办公电话
    private String userTypeNames;       // 人员类型 (如: 实验员,IACUC秘书...)

    // 组织架构画像
    private String departmentId;        // 部门ID
    private String projectGroupId;      // 课题组ID
    private String projectGroupNames;   // 课题组名称 (如: 卢今的课题组)

    // 物理空间画像
    private String areaId;              // 区域ID
    private String areaName;            // 区域名称 (如: 浦东)
    private String floorId;             // 楼层ID
    private String floorName;           // 楼层名称 (如: 浦东 4F)
    private String roomId;              // 房间ID
    private String roomName;            // 房间名称 (如: 401)

    // 💥 新增本地特权标记字段
    private Integer isSharedCard = 0;
    private Integer isKeepCard = 0;
    private Integer isBorrowedCard = 0;

    /** 瀑布流溯源：来源码，如 WEB_SCAN、ARO_OFFICIAL */
    private String feedSource;
    private String feedSummaryZh;
    private String feedDetailZh;
    private String deviceDisplayName;
}
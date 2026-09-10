package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.util.List;

/**
 * 订单审核页的全字段筛选条件。
 *
 * <p>行级字段（供应商/品系/领用人/房间/备注）走 EXISTS 子查询过滤，
 * 而不是查完再在内存里筛——列表是分页的，先截断再过滤会漏数据。
 */
@Data
public class RefOrderQuery {
    /** 浦东 | 浦西 */
    private String campus;
    /** PENDING / APPROVED / REJECTED / COMPLETED / CANCELLED */
    private String status;
    /** 排除某状态（「已完成」页签 = 排除 PENDING），与 status 二选一 */
    private String statusNot;
    /** LOCAL | ARO */
    private String source;
    /** ARO 订单号模糊 */
    private String sn;
    /** AUP 编号模糊（register_no） */
    private String aup;
    /** 课题组名模糊 */
    private String projectGroup;
    /**
     * 课题组名精确匹配（可多个）——学生端按本人课题组定界用。
     * 不能用 projectGroup 的 LIKE：组名互为子串时会跨组泄露。
     * 多课题组账号需按全部组名定界，否则用第二个组下的单在自己列表里看不到。
     */
    private List<String> groupIn;
    /** 行级：供应商模糊 */
    private String supplier;
    /** 行级：品系模糊 */
    private String strain;
    /** 行级：领用人模糊 */
    private String collector;
    /** 行级：领用方式/房间模糊 */
    private String room;
    /** 整单备注或行备注模糊 */
    private String remark;
    /** 提交/下单时间起止（yyyy-MM-dd） */
    private String from;
    private String to;
    /** 仅导出用：保留的小计层级（total,lv1,lv2,lv3 逗号子集；空=全保留，none=都不保留） */
    private String levels;
    /** 仅导出用：排除小计的板块 key（课题组名，逗号分隔） */
    private String excludeBlocks;
}

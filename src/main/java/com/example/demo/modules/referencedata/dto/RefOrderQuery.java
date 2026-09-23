package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDate;
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
    /**
     * 学生端专用：本人持有的账号 id（STAFF_ 与它的 aro_user_id 一对）。
     * 与 {@link #groupIn} 是「或」关系——自己提交的单必须看得见：课题组名解析不出的账号
     * 照样能下单（提交侧的组校验在解析为空时会跳过），列表侧再按组名硬筛就把自己刚提交的单吞了。
     */
    private List<String> submitterIn;
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
    /**
     * 预约单筛选：1 = 只看预约单，0 = 排除预约单。
     * is_preorder 是**永久标记**（含已完成单），记录「下单当时是提前订的」，
     * 不能靠 estimated_delivery_date 推断——那只是「哪天到货」。
     */
    private Integer isPreorder;
    /** 仅导出用：只导本周期订单（delivery_cycle = 当前周期 且排除预约单）。服务端据此解析 {@link #cycles}。 */
    private Boolean currentCycleOnly;
    /** 服务端解析出的「当前周期」日期们（按校区各一个）；客户端不传，交给 EXISTS 过滤行级 delivery_cycle。 */
    private List<LocalDate> cycles;
}

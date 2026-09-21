package com.example.demo.modules.cageshelf.service;

import lombok.Data;

/**
 * 转移三签里的一条签字记录。
 *
 * <p>落 {@code cage_op_request.signatures} 的 JSON 数组，逐条也往 approval_records 里留痕。
 */
@Data
public class CageOpSignature {

    /** 归属地审核人（覆盖源笼位位置）。 */
    public static final String ROLE_ORIGIN = "ORIGIN";
    /** 目的地审核人（覆盖目标笼位位置）。 */
    public static final String ROLE_DEST = "DEST";
    /** 兽医（在全局审核兽医名单里）。 */
    public static final String ROLE_VET = "VET";

    /** 复核意见：同意。 */
    public static final String DECISION_APPROVED = "approved";
    /** 复核意见：暂缓 —— 不终止单据，签的人可以稍后改判。 */
    public static final String DECISION_HELD = "held";
    /** 复核意见：不同意 —— 终局。 */
    public static final String DECISION_REJECTED = "rejected";

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_APPROVED = "approved";
    public static final String STATUS_REJECTED = "rejected";

    private String role;
    private String reviewerId;
    private String reviewerName;
    private String at;
    /**
     * 复核意见，三种取值：
     *
     * <ul>
     *   <li>{@link #DECISION_APPROVED} 同意 —— 本关通过。</li>
     *   <li>{@link #DECISION_HELD} 暂缓 —— 单据**不**终止，仍是待签；同一角色可再次签署改判（暂缓改同意是可以的）。</li>
     *   <li>{@link #DECISION_REJECTED} 不同意 —— 终局，单据作废，不再需要其他角色签署。</li>
     * </ul>
     */
    private String decision;
    private String reason;
}

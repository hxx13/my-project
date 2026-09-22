package com.example.demo.modules.cageshelf.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 渲染器入参：把「学生填的」与「系统自动取的」合成一份扁平数据。
 *
 * <p>渲染器不查库、不做取值判断，只按行/列往模板格子里写 —— 这样渲染逻辑能脱离数据库单测。
 */
@Data
public class TransferFormRenderInput {

    /**
     * 单号：拟转移日期 + 实验员姓名 + 当天第几单，如 {@code 20260920-位亚磊-1}。
     *
     * <p>**只是给人看的名字**，数据库主键仍是 {@code cage_op_request.id}。打印在表格第一行，
     * 下载的文件名也用它 —— 一份单从屏幕到纸面到文件都能对得上。
     */
    private String docNo;
    private String unitName;
    /** 负责人 / 负责人（PI签字）：同一个值，模板上出现两次。 */
    private String piName;
    /** 实验人员 / 实验人员签字：同一个值，模板上出现两次。 */
    private String experimenterName;
    private String phone;
    /** 拟定的转移日期，学生填什么就印什么（通常是 {@code 2026-09-23}）。 */
    private String transferDate;
    /** 申请方提交这张单的日期（{@code 2026-09-22}）；取不到就只印标签、值留空。 */
    private String submitDate;
    /** 转出地点，精确到笼位。 */
    private String fromLocation;
    /** 接收地点，精确到笼位；多目标时按行拼接。 */
    private String toLocation;
    /** 转出地点负责人（签字）；未通过审核时为空。 */
    private String originReviewerName;
    /** 接收地点负责人（签字）；未通过审核时为空。 */
    private String destReviewerName;
    /** 复核意见中文（同意 / 暂缓 / 不同意）；未签时为空。 */
    private String vetOutcome;
    /** 暂缓或不同意的原因；同意或未签时为空。 */
    private String vetReason;
    /** 复核人（签字）—— 兽医姓名；未签时为空。 */
    private String vetReviewerName;
    /**
     * 电子签名图（PNG dataUrl）。有图就打印图、**不再打印姓名文字**；为空则退回姓名文字。
     *
     * <p>四支都对应一个能查到人的账号：三签各自的 reviewerId、以及申请人。模板上还有第五个
     * 签位「负责人（PI签字）」，那里的值只是笼位表单里填的名字串（没有账号），所以只能打名字。
     */
    private String originReviewerSignature;
    private String destReviewerSignature;
    private String vetReviewerSignature;
    private String experimenterSignature;
    /** 每个目标笼位一行，行数 = 本次转移的笼位数。 */
    private List<Row> rows = new ArrayList<>();

    @Data
    public static class Row {
        private String strain;
        private Integer female;
        private Integer male;
    }
}

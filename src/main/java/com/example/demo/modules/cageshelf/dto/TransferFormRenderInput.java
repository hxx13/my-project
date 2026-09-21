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
    private String transferDate;
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
    /** 每个目标笼位一行，行数 = 本次转移的笼位数。 */
    private List<Row> rows = new ArrayList<>();

    @Data
    public static class Row {
        private String strain;
        private Integer female;
        private Integer male;
    }
}

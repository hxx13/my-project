package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.List;

/**
 * 扫码 analyze 返回：当前人员生效中的违规通告（供弹窗覆盖层与进房按钮锁定）。
 */
@Data
public class ScanStudentViolationNoticeDTO {
    private Long id;
    private String violationText;
    private List<String> imageUrls;
    /** 是否每次扫码都展示通告（否则前端可「已知悉」后本会话收起文案区，仍保留进房限制逻辑） */
    private Boolean showNoticeEveryScan;
    /** 综合 forbid_enter 与进入次数上限后的进房禁止 */
    private Boolean enterLocked;
    /** 剩余允许成功进入次数；null 表示未配置上限 */
    private Integer remainingEnterAllowance;
}

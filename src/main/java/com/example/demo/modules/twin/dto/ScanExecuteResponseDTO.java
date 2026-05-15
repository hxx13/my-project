package com.example.demo.modules.twin.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScanExecuteResponseDTO {
    private boolean success;
    private String message;
    private Integer expAdded;
    /** 门禁规则需下发大华权限，但 twin_card_mapping 无绑定或缺 dahuaSeq */
    private boolean unboundForDahuaRule;
    /** 前端可展示的短提示（不阻断 ARO 成功） */
    private String dahuaHint;
    /** 调试阶段用于回显门禁规则派发细节 */
    private String accessRuleDebug;
    /** Web 扫码离开：大华回收与冻结已延后执行的秒数；null 或 0 表示未延后 */
    private Integer deferredDahuaSeconds;
}

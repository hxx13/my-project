package com.example.demo.modules.twin.scan.dto;

import lombok.Data;
import java.util.List;

@Data
public class ExemptStatusDTO {
    /** none / pending_review / approved_active / approved_expired / rejected */
    private String phase;

    /** TIME / COUNT / BOTH / null */
    private String mode;

    /** yyyy-MM-dd HH:mm:ss，到期时间 */
    private String expireAt;

    /** 前端实时计算的剩余时长文本，后端给空字符串 */
    private String remainingText;

    /** 授权房间名称列表 */
    private List<String> roomNames;

    /** 总次数（COUNT/BOTH 模式） */
    private Integer maxCount;

    /** 已用次数 */
    private int usedCount;

    /** 申请单号（pending/rejected 时填充） */
    private Long requestId;

    /** 延长至 HH:mm（pending_review 时展示用） */
    private String extendUntilTime;
}

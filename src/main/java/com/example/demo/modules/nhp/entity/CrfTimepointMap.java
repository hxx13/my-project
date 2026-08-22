package com.example.demo.modules.nhp.entity;

import lombok.Data;

/**
 * NHP 时点归一化映射：字典原始 timepoint → (event_anchor × frequency × tp_code)。
 * 对齐 22 §2.1 / V20260821025。
 */
@Data
public class CrfTimepointMap {
    private Long id;
    /** 字典原始 timepoint 文本 */
    private String rawValue;
    /** ENROLL/PRE_TX/DAY0/POST_TX/… */
    private String eventAnchor;
    /** ONCE/PER_TP/Q3H/… */
    private String frequency;
    /** 标准 TP 码 TP01~TP12（无横线），可空 */
    private String tpCode;
    /** 数据域 D1~D10 */
    private String domain;
}

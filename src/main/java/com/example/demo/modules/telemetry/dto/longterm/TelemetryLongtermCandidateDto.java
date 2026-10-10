package com.example.demo.modules.telemetry.dto.longterm;

import lombok.Data;

/** 候选变量：来自变量目录，未选中的也在里面（前端勾选即可入选）。 */
@Data
public class TelemetryLongtermCandidateDto {
    private String winccVariableName;
    private String displayLabel;
    private String floorCode;
    private String roomCanonical;
    private String metricKindCode;
    private String metricKindLabel;
    private boolean enabledInCatalog;
    private boolean selected;
    /** 所属分区 code（变量目录里的导入分区，供「先选分区再列变量」用） */
    private String bundleCode;
    /** 所属分区显示名 */
    private String bundleDisplayName;
}

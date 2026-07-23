package com.example.demo.modules.telemetry.dto;

import lombok.Data;

/**
 * WinCC 单点写入请求（手册 PUT .../tagManagement/Value/&lt;VariableName&gt;）。
 */
@Data
public class WinCcTagWriteRequestDto {
    /** WinCC 变量名 */
    private String variableName;
    /** JSON：布尔、数字或字符串；开关仅允许 0/1 */
    private Object value;
}

package com.example.demo.modules.smartsheet.enums;

public enum SmartsheetErrorCode {
    SMARTSHEET_NOT_FOUND(1_006_001, "表格不存在"),
    SMARTSHEET_COLUMN_INVALID(1_006_002, "列定义不合法"),
    SMARTSHEET_TOO_MANY_COLUMNS(1_006_003, "超过最大列数限制(100)"),
    SMARTSHEET_TOO_MANY_ROWS(1_006_004, "超过最大行数限制"),
    SMARTSHEET_VERSION_CONFLICT(1_006_005, "数据已被他人修改，请刷新"),
    SMARTSHEET_IMPORT_FORMAT(1_006_006, "不支持的文件格式，仅接受 .xlsx/.xls/.csv"),
    SMARTSHEET_ROW_NOT_FOUND(1_006_007, "数据行不存在"),
    SMARTSHEET_COLUMN_TYPE_CONFLICT(1_006_008, "列类型变更将清空已有数据"),
    SMARTSHEET_TEMPLATE_NOT_FOUND(1_006_009, "模板不存在"),
    SMARTSHEET_COLUMN_NOT_FOUND(1_006_010, "列不存在"),
    SMARTSHEET_PERMISSION_DENIED(1_006_011, "无权限操作此表格"),
    SMARTSHEET_IMPORT_PARSE_ERROR(1_006_012, "导入文件解析失败");

    private final int code;
    private final String message;

    SmartsheetErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int getCode() { return code; }
    public String getMessage() { return message; }
}

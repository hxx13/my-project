package com.example.demo.modules.print.entity;

/** 打印工位 —— 一台电脑 + 一台打印机 + 一个专用账号。 */
public class PrintStation {
    private String id;
    private String name;
    private String userId;
    private String pageSize;
    /** 支持的文件类型分组，逗号分隔：pdf/image/word/excel/ppt。null 或空 = 全支持 */
    private String supportedTypes;
    private boolean enabled;
    private String createdBy;
    private String createdAt;

    public String getId() { return id; }
    public void setId(String v) { this.id = v; }

    public String getName() { return name; }
    public void setName(String v) { this.name = v; }

    public String getUserId() { return userId; }
    public void setUserId(String v) { this.userId = v; }

    public String getPageSize() { return pageSize; }
    public void setPageSize(String v) { this.pageSize = v; }

    public String getSupportedTypes() { return supportedTypes; }
    public void setSupportedTypes(String v) { this.supportedTypes = v; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean v) { this.enabled = v; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}

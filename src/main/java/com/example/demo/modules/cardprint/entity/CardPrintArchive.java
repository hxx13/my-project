package com.example.demo.modules.cardprint.entity;

/**
 * 卡牌打印归档 — card_print_archive 的实体。
 * 记录每次生成 PDF 时的模板快照、包含笼位与落盘文件信息。
 */
public class CardPrintArchive {
    private Long id;
    private Long templateId;            // 模板 id
    private String templateName;        // 模板名快照
    private String specSnapshotJson;    // 生成时 CardSpec 快照
    private String slotsSnapshotJson;   // 生成时 Slot[] 快照
    private String cageIdsJson;         // 本次包含的 animalCageId 列表
    private Integer pageCount;          // 页数
    private String fileName;            // 下载文件名
    private String storedPath;          // 落盘相对路径
    private Long fileSize;              // 字节数
    private String createdBy;
    private String createdAt;           // DATETIME

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }

    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long v) { this.templateId = v; }

    public String getTemplateName() { return templateName; }
    public void setTemplateName(String v) { this.templateName = v; }

    public String getSpecSnapshotJson() { return specSnapshotJson; }
    public void setSpecSnapshotJson(String v) { this.specSnapshotJson = v; }

    public String getSlotsSnapshotJson() { return slotsSnapshotJson; }
    public void setSlotsSnapshotJson(String v) { this.slotsSnapshotJson = v; }

    public String getCageIdsJson() { return cageIdsJson; }
    public void setCageIdsJson(String v) { this.cageIdsJson = v; }

    public Integer getPageCount() { return pageCount; }
    public void setPageCount(Integer v) { this.pageCount = v; }

    public String getFileName() { return fileName; }
    public void setFileName(String v) { this.fileName = v; }

    public String getStoredPath() { return storedPath; }
    public void setStoredPath(String v) { this.storedPath = v; }

    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long v) { this.fileSize = v; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String v) { this.createdBy = v; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
}

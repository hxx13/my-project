package com.example.demo.modules.cageshelf.entity;

/**
 * 笼位实验记录台账（追加式）—— 一条记录一个时间戳，提交后只读、不可编辑不可删除。
 *
 * <p>替代原 {@code cage_info_value.experiment_desc / images_json}：那套是「一格一份、随时被覆盖」，
 * 既不保时间戳，也会被表单重写/同步冲掉。这里按 {@code animal_cage_id} 存，
 * 所以**跟随笼位**——转移、分笼、表单重写都不影响已有记录。
 *
 * <p>状态：{@code DRAFT}（本人草稿，同人同笼位同时最多一条）→ {@code SUBMITTED}（台账正卷）；
 * 占用者变更/笼位归档时批量置 {@code ARCHIVED}，退出台账、只在「记录模式」留痕可查。
 */
public class CageExperimentRecord {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_SUBMITTED = "SUBMITTED";
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    private Long id;
    private Long animalCageId;
    private String authorId;
    private String authorName;
    private String content;
    private String imagesJson;
    private String status;
    private String submittedAt;
    private String archivedAt;
    private String createdAt;
    private String updatedAt;

    public Long getId() { return id; }
    public void setId(Long v) { this.id = v; }
    public Long getAnimalCageId() { return animalCageId; }
    public void setAnimalCageId(Long v) { this.animalCageId = v; }
    public String getAuthorId() { return authorId; }
    public void setAuthorId(String v) { this.authorId = v; }
    public String getAuthorName() { return authorName; }
    public void setAuthorName(String v) { this.authorName = v; }
    public String getContent() { return content; }
    public void setContent(String v) { this.content = v; }
    public String getImagesJson() { return imagesJson; }
    public void setImagesJson(String v) { this.imagesJson = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(String v) { this.submittedAt = v; }
    public String getArchivedAt() { return archivedAt; }
    public void setArchivedAt(String v) { this.archivedAt = v; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String v) { this.createdAt = v; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String v) { this.updatedAt = v; }
}

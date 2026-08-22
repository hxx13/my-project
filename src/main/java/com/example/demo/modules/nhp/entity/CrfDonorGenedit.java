package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_donor_genedit`. */
@Data
public class CrfDonorGenedit {
    private Long id;
    private Long donorSubjectId;
    private String editComboCode;
    private String koLoci;
    private String kiLoci;
    private String editVerifyStatus;
    private String offtargetResult;
    private Integer transgeneCopyNum;
    private Integer generation;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

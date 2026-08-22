package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** NHP 研究对象（供体/受体，非账号）。 */
@Data
public class CrfSubject {
    private Long id;
    private Long studyId;
    /** DONOR/RECIPIENT */
    private String subjectType;
    /** DON-XXX / RCP-XXX */
    private String subjectCode;
    private Long centerId;
    private Long dagId;
    private String basicJson;
    /** 身份标识：性别 M/F */
    private String sex;
    private LocalDate birthDate;
    /** 物种（受体） */
    private String species;
    /** 品种/品系（供体） */
    private String breed;
    private BigDecimal weightKg;
    private BigDecimal ageYears;
    /** 院内/基地原编号 */
    private String externalId;
    /** 芯片号 */
    private String microchipId;
    /** 基地编码（供体） */
    private String farmCode;
    /** 来源与检疫摘要 */
    private String originNote;
    /** SPF/DPF 等 */
    private String biocontainmentLevel;
    /** 谱系 */
    private String pedigree;
    /** ACTIVE/RETIRED */
    private String status;
    /** SCREENING/MATCHING/POST_TX/ENDPOINT（V38） */
    private String lifecycleStage;
    /** 研究分组 HEART/LIVER（非独立研究，V38） */
    private String armCode;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

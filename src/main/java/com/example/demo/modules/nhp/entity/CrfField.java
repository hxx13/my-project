package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 字段定义（ItemDef，含版本+冻结+CDISC 映射）。 */
@Data
public class CrfField {
    private Long id;
    /** FK→crf_field_dictionary.id（字段归属哪一套字典） */
    private Long dictionaryId;
    /** 字典追溯码 D1.02.003 */
    private String fieldCode;
    /** 字段英文名=DB 列名 snake_case，如 donor_id */
    private String nameEn;
    private String nameCn;
    /** STRING/TEXT/INTEGER/DECIMAL/DATE/DATETIME/BOOLEAN/ENUM/ENUM_MULTI/CALC/FILE */
    private String dataType;
    private String unit;
    /** YES/NO/CONDITIONAL */
    private String required;
    /** FK→crf_codelist.id */
    private Long codelistId;
    private String description;
    /** CALC 字段表达式（版本化） */
    private String calcExpression;
    /** SEND 域，如 DM/VS/LB/EX */
    private String cdiscDomain;
    private String cdiscVariable;
    private String cdiscTestCode;
    /** 概念/指标库码（多 field → 1 concept，V20260821026） */
    private String conceptCode;
    /** PK 字段编码规则类型 DON/RCP/XM/TX/…（V40） */
    private String idRuleType;
    /** 字段性质 DATA/FK/PK/DERIVED（决定进不进题目，V40） */
    private String nature;
    /** 校对四态 CONFIRM/MODIFY/DELETE/QUESTION（V36） */
    private String verdict;
    /** PI 校对意见 */
    private String verdictNote;
    /** 校对轮次，默认 1 */
    private Integer reviewRound = 1;
    /** DRAFT/PENDING_REVIEW/FROZEN/RETIRED */
    private String status;
    private Integer version;
    private LocalDateTime frozenAt;
    private String frozenBy;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

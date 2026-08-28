package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfField;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 字段定义 mapper。 */
@Mapper
public interface CrfFieldMapper {

    @Insert("INSERT INTO crf_field (dictionary_id, field_code, name_en, name_cn, data_type, unit, required, codelist_id, " +
            "description, calc_expression, cdisc_domain, cdisc_variable, cdisc_test_code, concept_code, " +
            "id_rule_type, nature, verdict, verdict_note, review_round, status, version, active) " +
            "VALUES (#{dictionaryId}, #{fieldCode}, #{nameEn}, #{nameCn}, #{dataType}, #{unit}, #{required}, #{codelistId}, " +
            "#{description}, #{calcExpression}, #{cdiscDomain}, #{cdiscVariable}, #{cdiscTestCode}, #{conceptCode}, " +
            "#{idRuleType}, #{nature}, #{verdict}, #{verdictNote}, #{reviewRound}, #{status}, #{version}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfField row);

    @Select("SELECT * FROM crf_field WHERE id = #{id}")
    CrfField findById(Long id);

    @Select("SELECT * FROM crf_field WHERE field_code = #{fieldCode} AND active = 1 " +
            "AND (dictionary_id = #{dictionaryId} OR (#{dictionaryId} IS NULL AND dictionary_id IS NULL)) ORDER BY version DESC LIMIT 1")
    CrfField findByFieldCodeInDict(@Param("dictionaryId") Long dictionaryId, @Param("fieldCode") String fieldCode);

    /** 同码全部活跃版本（version DESC，头=最新）。 */
    @Select("SELECT * FROM crf_field WHERE field_code = #{fieldCode} AND active = 1 " +
            "AND (dictionary_id = #{dictionaryId} OR (#{dictionaryId} IS NULL AND dictionary_id IS NULL)) ORDER BY version DESC")
    List<CrfField> listByFieldCodeInDict(@Param("dictionaryId") Long dictionaryId, @Param("fieldCode") String fieldCode);

    @Select("SELECT * FROM crf_field WHERE field_code = #{fieldCode} AND version = #{version} AND active = 1 " +
            "AND (dictionary_id = #{dictionaryId} OR (#{dictionaryId} IS NULL AND dictionary_id IS NULL)) LIMIT 1")
    CrfField findByFieldCodeAndVersionInDict(@Param("dictionaryId") Long dictionaryId,
                                             @Param("fieldCode") String fieldCode,
                                             @Param("version") int version);

    @Select("SELECT COALESCE(MAX(version), 0) FROM crf_field WHERE field_code = #{fieldCode} " +
            "AND (dictionary_id = #{dictionaryId} OR (#{dictionaryId} IS NULL AND dictionary_id IS NULL))")
    int findMaxVersionInDict(@Param("dictionaryId") Long dictionaryId, @Param("fieldCode") String fieldCode);

    /** 兼容旧调用：优先猪字典，否则任意活跃 */
    @Select("SELECT f.* FROM crf_field f " +
            "LEFT JOIN crf_field_dictionary d ON d.id = f.dictionary_id " +
            "WHERE f.field_code = #{fieldCode} AND f.active = 1 " +
            "ORDER BY CASE WHEN d.dict_key = 'pig' THEN 0 ELSE 1 END, f.id LIMIT 1")
    CrfField findByFieldCode(String fieldCode);

    /** 含软删：重导入猪字典时用于复活同码字段，避免唯一键冲突。 */
    @Select("SELECT f.* FROM crf_field f " +
            "WHERE f.field_code = #{fieldCode} AND f.dictionary_id = #{dictionaryId} " +
            "ORDER BY f.id DESC LIMIT 1")
    CrfField findAnyByFieldCodeInDict(@Param("dictionaryId") Long dictionaryId,
                                      @Param("fieldCode") String fieldCode);

    @Update("UPDATE crf_field SET active = 1, status = #{status}, name_en = #{nameEn}, name_cn = #{nameCn}, " +
            "data_type = #{dataType}, unit = #{unit}, required = #{required}, codelist_id = #{codelistId}, " +
            "description = #{description}, concept_code = #{conceptCode} WHERE id = #{id}")
    int reactivateAndUpdate(CrfField row);

    @Select("SELECT * FROM crf_field WHERE active = 1 ORDER BY field_code, version DESC")
    List<CrfField> list();

    @Select("SELECT * FROM crf_field WHERE active = 1 AND dictionary_id = #{dictionaryId} ORDER BY field_code, version DESC")
    List<CrfField> listByDictionary(@Param("dictionaryId") Long dictionaryId);

    /** 按数据域查字段（field_code 形如 D1.02.003，前缀 D1 即域）。 */
    @Select("SELECT * FROM crf_field WHERE active = 1 AND field_code LIKE CONCAT(#{domain}, '.%') ORDER BY field_code")
    List<CrfField> listByDomain(String domain);

    @Select("SELECT * FROM crf_field WHERE active = 1 AND dictionary_id = #{dictionaryId} " +
            "AND field_code LIKE CONCAT(#{domain}, '.%') ORDER BY field_code")
    List<CrfField> listByDictionaryAndDomain(@Param("dictionaryId") Long dictionaryId,
                                             @Param("domain") String domain);

    /** 引用某码表的字段（反查）。排序由 Service 层按 D 编码数值序整理。 */
    @Select("SELECT * FROM crf_field WHERE active = 1 AND codelist_id = #{codelistId} ORDER BY field_code, version DESC")
    List<CrfField> listByCodelistId(@Param("codelistId") Long codelistId);

    @Select("SELECT COUNT(1) FROM crf_field WHERE active = 1 AND codelist_id = #{codelistId}")
    int countByCodelistId(@Param("codelistId") Long codelistId);

    @Select("SELECT COUNT(1) FROM crf_field WHERE active = 1 AND dictionary_id = #{dictionaryId}")
    int countByDictionary(@Param("dictionaryId") Long dictionaryId);

    /** 各码表被引用字段数（列表角标）。 */
    @Select("SELECT codelist_id AS codelistId, COUNT(1) AS cnt FROM crf_field " +
            "WHERE active = 1 AND codelist_id IS NOT NULL GROUP BY codelist_id")
    List<java.util.Map<String, Object>> countRefsGrouped();

    @Update("UPDATE crf_field SET name_cn = #{nameCn}, data_type = #{dataType}, unit = #{unit}, " +
            "required = #{required}, codelist_id = #{codelistId}, description = #{description}, " +
            "calc_expression = #{calcExpression}, cdisc_domain = #{cdiscDomain}, cdisc_variable = #{cdiscVariable}, " +
            "cdisc_test_code = #{cdiscTestCode}, concept_code = #{conceptCode}, id_rule_type = #{idRuleType}, nature = #{nature}, " +
            "verdict = #{verdict}, verdict_note = #{verdictNote}, review_round = #{reviewRound} WHERE id = #{id}")
    int update(CrfField row);

    /** 按概念码列出字段（跨域复用）。 */
    @Select("SELECT * FROM crf_field WHERE active = 1 AND concept_code = #{conceptCode} ORDER BY field_code")
    List<CrfField> listByConceptCode(String conceptCode);

    @Update("UPDATE crf_field SET concept_code = #{conceptCode} WHERE id = #{id}")
    int updateConceptCode(@Param("id") Long id, @Param("conceptCode") String conceptCode);

    @Update("UPDATE crf_field SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    /** 软删字段（退役）。 */
    @Update("UPDATE crf_field SET active = 0, status = 'RETIRED' WHERE id = #{id}")
    int softDelete(Long id);

    /** 校对通过并冻结。 */
    @Update("UPDATE crf_field SET status = #{status}, frozen_at = #{frozenAt}, frozen_by = #{frozenBy} WHERE id = #{id}")
    int updateFreeze(@Param("id") Long id,
                     @Param("status") String status,
                     @Param("frozenAt") java.time.LocalDateTime frozenAt,
                     @Param("frozenBy") String frozenBy);

    /** 驳回校对：回草稿并清空冻结元数据。 */
    @Update("UPDATE crf_field SET status = #{status}, frozen_at = NULL, frozen_by = NULL WHERE id = #{id}")
    int clearFreeze(@Param("id") Long id, @Param("status") String status);
}

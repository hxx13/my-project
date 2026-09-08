package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.QualificationItemConfig;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface QualificationItemConfigMapper {

    @Select("""
            SELECT item_key AS itemKey, form_id AS formId, word_template_id AS wordTemplateId
            FROM qualification_item_config WHERE form_id = #{formId} LIMIT 1
            """)
    QualificationItemConfig findByFormId(@Param("formId") Long formId);

    @Select("""
            SELECT item_key AS itemKey, form_id AS formId, word_template_id AS wordTemplateId
            FROM qualification_item_config WHERE item_key = #{itemKey} LIMIT 1
            """)
    QualificationItemConfig findByItemKey(@Param("itemKey") String itemKey);

    @Insert("""
            INSERT INTO qualification_item_config (item_key, form_id, word_template_id, updated_at)
            VALUES (#{itemKey}, #{formId}, #{wordTemplateId}, NOW())
            ON DUPLICATE KEY UPDATE form_id = #{formId}, word_template_id = #{wordTemplateId}, updated_at = NOW()
            """)
    int upsert(QualificationItemConfig cfg);
}

package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.FormTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface FormTemplateMapper {
    int insert(FormTemplate row);
    int update(FormTemplate row);
    FormTemplate findById(@Param("id") Long id);
    List<FormTemplate> listAll();
    List<FormTemplate> listByFormKey(@Param("formKey") String formKey);
    /** 当前 PUBLISHED 版本（同 formKey 至多一条）。 */
    FormTemplate findPublishedByFormKey(@Param("formKey") String formKey);
    /** 该 formKey 最大 version，无则 0。 */
    int findMaxVersionByFormKey(@Param("formKey") String formKey);
    /** 该 formKey 最新一行（无 PUBLISHED 时的深拷贝源）。 */
    FormTemplate findLatestByFormKey(@Param("formKey") String formKey);
    /** 将同 formKey 的其它 PUBLISHED 置为 ARCHIVED（历史保留不删）。 */
    int archivePublished(@Param("formKey") String formKey, @Param("excludeId") Long excludeId);
    /** 发布：本版本置 PUBLISHED + published_at。 */
    int publish(@Param("id") Long id, @Param("publishedAt") LocalDateTime publishedAt);
    /** 归档：本版本置 ARCHIVED。 */
    int archive(@Param("id") Long id);
    /** 删除模板行（服务层校验状态）。 */
    int deleteById(@Param("id") Long id);
}

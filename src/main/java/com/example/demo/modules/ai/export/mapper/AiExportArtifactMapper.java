package com.example.demo.modules.ai.export.mapper;

import com.example.demo.modules.ai.export.entity.AiExportArtifact;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AiExportArtifactMapper {

    int insert(AiExportArtifact row);

    /** 元数据（**不带 content**）——列表与详情都用它。 */
    AiExportArtifact selectById(@Param("id") Long id);

    List<AiExportArtifact> selectListBySession(@Param("sessionId") Long sessionId);

    /** 本会话最近一份（`ORDER BY id DESC LIMIT 1` = 最近产出的那份，不是最近下载的那份）。 */
    AiExportArtifact selectLatestBySession(@Param("sessionId") Long sessionId);

    /** 归档字节：用户下过之后回填。重复归档按最后一次覆盖（同一份产物只会被同一轮下载）。 */
    int updateContent(@Param("id") Long id,
                      @Param("content") byte[] content,
                      @Param("contentType") String contentType,
                      @Param("contentSize") long contentSize);

    /**
     * 只取字节（列表查询不碰这一列）。
     *
     * <p>返回的是**持有对象**而不是 byte[]：MyBatis 会把「方法返回 byte[]」当成
     * 「返回一个数组结果」去解析，最后抛 argument type mismatch。
     */
    AiExportArtifact selectContent(@Param("id") Long id);
}

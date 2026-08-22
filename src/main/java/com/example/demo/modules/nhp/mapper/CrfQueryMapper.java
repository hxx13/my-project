package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfQuery;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 数据质疑 mapper。 */
@Mapper
public interface CrfQueryMapper {

    @Insert("INSERT INTO crf_query (record_id, field_id, query_text, status, opened_by) " +
            "VALUES (#{recordId}, #{fieldId}, #{queryText}, #{status}, #{openedBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfQuery row);

    @Select("SELECT * FROM crf_query WHERE id = #{id}")
    CrfQuery findById(Long id);

    @Select("SELECT * FROM crf_query WHERE record_id = #{recordId} ORDER BY id DESC")
    List<CrfQuery> listByRecordId(Long recordId);

    @Select("SELECT * FROM crf_query WHERE status IN ('OPEN','ANSWERED') ORDER BY id DESC LIMIT #{limit}")
    List<CrfQuery> listOpenRecent(@Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM crf_query WHERE status IN ('OPEN','ANSWERED')")
    int countOpen();

    @Update("UPDATE crf_query SET status = #{status}, answered_by = #{answeredBy}, answered_at = #{answeredAt}, " +
            "answer_text = #{answerText} WHERE id = #{id}")
    int updateAnswer(CrfQuery row);

    @Update("UPDATE crf_query SET status = 'CLOSED' WHERE id = #{id} AND status IN ('OPEN','ANSWERED')")
    int close(Long id);
}

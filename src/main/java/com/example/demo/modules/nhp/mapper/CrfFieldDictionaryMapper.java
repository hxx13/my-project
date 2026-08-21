package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfFieldDictionary;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 字段字典套 mapper。 */
@Mapper
public interface CrfFieldDictionaryMapper {

    @Insert("INSERT INTO crf_field_dictionary (dict_key, name, species, description, structure_json, version, status, active) " +
            "VALUES (#{dictKey}, #{name}, #{species}, #{description}, #{structureJson}, #{version}, #{status}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfFieldDictionary row);

    @Select("SELECT * FROM crf_field_dictionary WHERE id = #{id}")
    CrfFieldDictionary findById(Long id);

    @Select("SELECT * FROM crf_field_dictionary WHERE dict_key = #{dictKey}")
    CrfFieldDictionary findByDictKey(String dictKey);

    @Select("SELECT d.*, " +
            "(SELECT COUNT(1) FROM crf_field f WHERE f.active = 1 AND f.dictionary_id = d.id) AS fieldCount " +
            "FROM crf_field_dictionary d WHERE d.active = 1 ORDER BY d.id")
    List<CrfFieldDictionary> listActive();

    @Update("UPDATE crf_field_dictionary SET name = #{name}, species = #{species}, description = #{description}, " +
            "structure_json = #{structureJson}, status = #{status}, version = #{version} WHERE id = #{id}")
    int update(CrfFieldDictionary row);

    @Update("UPDATE crf_field_dictionary SET active = 0, status = 'ARCHIVED' WHERE id = #{id}")
    int softDelete(Long id);

    /** 重导入时复活已软删的字典套壳。 */
    @Update("UPDATE crf_field_dictionary SET active = 1, status = 'ACTIVE' WHERE id = #{id}")
    int reactivate(Long id);
}

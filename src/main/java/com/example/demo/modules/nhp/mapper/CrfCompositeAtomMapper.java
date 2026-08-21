package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfCompositeAtom;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** 组合模板 ↔ 原子模板钉版本引用。 */
@Mapper
public interface CrfCompositeAtomMapper {

    @Insert("INSERT INTO crf_composite_atom (composite_form_id, atom_code, atom_form_id, sort_order) " +
            "VALUES (#{compositeFormId}, #{atomCode}, #{atomFormId}, #{sortOrder})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfCompositeAtom row);

    @Select("SELECT * FROM crf_composite_atom WHERE composite_form_id = #{compositeFormId} ORDER BY sort_order, id")
    List<CrfCompositeAtom> listByCompositeFormId(Long compositeFormId);

    /** 反向：哪些组合版本钉住了该原子版本行。 */
    @Select("SELECT * FROM crf_composite_atom WHERE atom_form_id = #{atomFormId} ORDER BY id")
    List<CrfCompositeAtom> listByAtomFormId(Long atomFormId);

    @Delete("DELETE FROM crf_composite_atom WHERE composite_form_id = #{compositeFormId}")
    int deleteByCompositeFormId(Long compositeFormId);
}

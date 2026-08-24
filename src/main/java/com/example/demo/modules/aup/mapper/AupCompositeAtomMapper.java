package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupCompositeAtom;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AupCompositeAtomMapper {
    int insert(AupCompositeAtom row);
    List<AupCompositeAtom> listByCompositeTemplateId(@Param("compositeTemplateId") Long compositeTemplateId);
    int deleteByCompositeTemplateId(@Param("compositeTemplateId") Long compositeTemplateId);
    /** 反查：该原子域版本被哪些组合域钉住（解冻/删除校验）。 */
    int countByAtomTemplateId(@Param("atomTemplateId") Long atomTemplateId);
    List<AupCompositeAtom> listByAtomTemplateId(@Param("atomTemplateId") Long atomTemplateId);
}

package com.example.demo.modules.animalorder.mapper;

import com.example.demo.modules.animalorder.entity.AnimalOrderCycle;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

@Mapper
public interface AnimalOrderCycleMapper {
    /** 该校区全部清单行，按日期升序。空 = 还没采纳过，调用方回落到推算。 */
    List<AnimalOrderCycle> listByCampus(@Param("campus") String campus);

    /** 该校区从 from 起（含）的清单日期，升序。 */
    List<LocalDate> listDatesFrom(@Param("campus") String campus, @Param("from") LocalDate from);

    int deleteByCampus(@Param("campus") String campus);

    int insert(AnimalOrderCycle row);
}

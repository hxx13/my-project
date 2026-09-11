package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.dto.RefOrderQuery;
import com.example.demo.modules.referencedata.entity.RefOrder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefOrderMapper {

    int insert(RefOrder row);

    int updateStatus(@Param("id") Long id,
                     @Param("status") String status,
                     @Param("submittedAt") java.time.LocalDateTime submittedAt);

    RefOrder findById(@Param("id") Long id);

    List<RefOrder> listByGroupId(@Param("groupId") String groupId);

    List<RefOrder> listByStatus(@Param("status") String status,
                                @Param("limit") int limit,
                                @Param("offset") int offset);

    int countByStatus(@Param("status") String status);

    /** ARO 导入幂等键：同一 (source, sn) 只应有一单 */
    RefOrder findBySourceAndSn(@Param("source") String source, @Param("sn") String sn);

    /** ARO 导入重跑时刷新头部（状态可能已变） */
    int updateAroOrder(RefOrder row);

    List<RefOrder> listAll(@Param("q") RefOrderQuery query,
                           @Param("limit") int limit,
                           @Param("offset") int offset);

    int countAll(@Param("q") RefOrderQuery query);

    /** 筛选下拉用的去重值（行级：供应商/品系/领用人/房间） */
    List<String> distinctLineValues(@Param("column") String column);

    /** 筛选下拉用的去重值（订单级：课题组/AUP 编号） */
    List<String> distinctOrderValues(@Param("column") String column);

    /** 学生端候选：限定在「本人课题组 ∪ 本人提交」内去重（行级） */
    List<String> distinctLineValuesInGroup(@Param("column") String column,
                                          @Param("groups") List<String> groups,
                                          @Param("submitters") List<String> submitters);

    /** 学生端候选：限定在「本人课题组 ∪ 本人提交」内去重（订单级） */
    List<String> distinctOrderValuesInGroup(@Param("column") String column,
                                           @Param("groups") List<String> groups,
                                           @Param("submitters") List<String> submitters);
}

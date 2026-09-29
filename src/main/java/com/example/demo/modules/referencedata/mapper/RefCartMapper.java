package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.RefCart;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefCartMapper {

    int insert(RefCart row);

    int update(RefCart row);

    int updatePackageStatus(@Param("id") Long id,
                            @Param("packageStatus") String packageStatus,
                            @Param("packageRemark") String packageRemark);

    int deleteById(@Param("id") Long id);

    int deleteByGroupId(@Param("groupId") String groupId);

    int deleteByIds(@Param("ids") List<Long> ids);

    RefCart findById(@Param("id") Long id);

    List<RefCart> listByGroupId(@Param("groupId") String groupId);

    List<RefCart> listByIds(@Param("ids") List<Long> ids);

    /** 编辑在途：回填自该订单的购物车行 */
    List<RefCart> listByEditingOrderId(@Param("orderId") Long orderId);

    /** 编辑在途：清掉回填行（放弃编辑 / 重入编辑 / 保存后收尾） */
    int deleteByEditingOrderId(@Param("orderId") Long orderId);
}

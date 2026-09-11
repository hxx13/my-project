package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 笼位预定 Mapper（由 @MapperScan 扫描）。 */
public interface CageOrderReservationMapper {

    /** 插入即抢占笼位：撞 uk_reservation_active 唯一键说明该笼位已被他人锁定。 */
    int insert(CageOrderReservation row);

    CageOrderReservation findById(@Param("id") Long id);

    /** 活跃预定（status=LOCKED），用于「该笼位被谁锁了」的判定与渲染。 */
    List<CageOrderReservation> listActiveByCageIds(@Param("cageIds") List<Long> cageIds);

    /** 按购物车行反查活跃预定（删购物车行时释放并撤销预填）。 */
    List<CageOrderReservation> listActiveByCartIds(@Param("cartIds") List<Long> cartIds);

    /** 我的活跃预定（同一人可能锁了多个笼位）。 */
    List<CageOrderReservation> listActiveByReserver(@Param("reserverId") String reserverId);

    /** 全部活跃预定：笼架网格打「已被订单预定」标记用，量小。 */
    List<CageOrderReservation> listAllActive();

    /** 某张订单下的活跃预定：订单通过/驳回时落定笼位。 */
    List<CageOrderReservation> listActiveByOrderId(@Param("orderId") Long orderId);

    /** 订单通过：预定转「已转占用」，并放掉竞态闸门（笼位已饲养中，不再可预定）。 */
    int markConsumed(@Param("id") Long id);

    /** 订单驳回/取消：释放该单下所有预定，笼位回到可重新预定的空笼位。 */
    int releaseByOrderId(@Param("orderId") Long orderId, @Param("reason") String reason);

    /** 挂上购物车行（加购成功后回填，便于删除购物车行时反查释放）。 */
    int bindCart(@Param("id") Long id, @Param("cartId") Long cartId);

    /**
     * 加购时补齐预定量与笼位表单内容。
     *
     * <p>「先点笼位、后选规格」是正常顺序，预定那一刻还不知道订的是什么，品系/来源取不到；
     * 走到加购这里才拿到 refDataId，所以品系（strain_name）也在这时补上。
     * 传 null 时不覆盖原值（COALESCE），别把已有的品系写成空。
     */
    int updateSpecQuantityWritten(@Param("id") Long id,
                                 @Param("specKey") String specKey,
                                 @Param("sex") String sex,
                                 @Param("quantity") Integer quantity,
                                 @Param("strainName") String strainName,
                                 @Param("writtenJson") String writtenJson);

    /** 释放：status→RELEASED 且 active_cage_id 置空，放掉竞态闸门。 */
    int releaseById(@Param("id") Long id, @Param("reason") String reason);

    int releaseByCartIds(@Param("cartIds") List<Long> cartIds, @Param("reason") String reason);

    /** 下单：把该批购物车行的预定点到订单上。 */
    int bindOrderByCartIds(@Param("cartIds") List<Long> cartIds, @Param("orderId") Long orderId);

    /** 清理孤儿预定：购物车行没了也没挂订单的 LOCKED 行（进程崩溃等残留）。 */
    int releaseOrphans(@Param("reason") String reason);
}

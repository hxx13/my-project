package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.dto.SupplyInventoryMovementRowView;
import com.example.demo.modules.supplies.dto.SupplyApplicantConsumptionView;
import com.example.demo.modules.supplies.dto.SupplyItemConsumptionView;
import com.example.demo.modules.supplies.entity.SupplyInventoryMovement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface SupplyInventoryMovementMapper {
    int insert(SupplyInventoryMovement row);

    int countByItemId(@Param("itemId") long itemId);

    List<SupplyInventoryMovementRowView> listRowsByItemId(
            @Param("itemId") long itemId,
            @Param("limit") int limit,
            @Param("offset") int offset);

    List<SupplyInventoryMovement> listByClaimId(@Param("claimId") String claimId);

    /**
     * 按物资汇总某时间窗口内的出入库量（「谁消耗快 / 谁该补货」用）。
     *
     * <p>一次聚合查询出结果，**不在 Java 里把流水全捞出来再算** —— 流水表只会越写越长。
     * 只返回窗口内**有进出**的物资；一件都没动过的不在这里（要按存量找货有别的路）。
     *
     * @param from       窗口起点（含）
     * @param categoryId 只看某个分类；传 0 = 全部
     */
    List<SupplyItemConsumptionView> aggregateConsumption(
            @Param("from") LocalDateTime from,
            @Param("categoryId") long categoryId,
            @Param("limit") int limit);

    /**
     * 按**领取人**汇总某时间窗口内的领用量（「谁领得多 / 谁最近在领」用）。
     *
     * <p>同一张流水表按 {@code applicant_user_id} 聚合；名字由 Service 补（这一层只认 id）。
     */
    List<SupplyApplicantConsumptionView> aggregateConsumptionByApplicant(
            @Param("from") LocalDateTime from,
            @Param("limit") int limit);
}

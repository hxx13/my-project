package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageOpRequestMapper;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import com.example.demo.modules.referencedata.mapper.CageOrderReservationMapper;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

/**
 * 笼位「中间态」判定：这个笼位是不是正被某个进行中的流程占着。
 *
 * <p>算中间态的几种：
 * <ul>
 *   <li>划分态：已经划给本课题组某些人（{@code cage_division} 有名单）</li>
 *   <li>订购预定：还没加购（某人已锁）、已进购物车（PI 未提交）、已随订单提交（待审核）——都还是
 *       {@code LOCKED} 的 {@code cage_order_reservation}</li>
 *   <li>分笼/转移在审（{@code cage_op_request} 的源或目标）</li>
 *   <li>认领在审（待审批/锁定/已确认/待释放审批）</li>
 * </ul>
 *
 * <p><b>为什么要有这个统一入口：</b>前端三端（Web / H5 / 小程序）各自写的拦截条件不一样，
 * 加一个模式或改一处判定就会漏掉其中一端——「这个空笼位还能不能动」的口径只能收在服务端，
 * 谁要往笼位上写占用信息，先问这里。
 *
 * <p>只用于**新占用**方向：清标记、释放预定、驳回这类「减占用」的动作不受它限制，
 * 否则一旦占上就再也退不回来。
 */
@Service
public class CageIntermediateStateService {

    private final CageOrderReservationMapper reservationMapper;
    private final CageOpRequestMapper opRequestMapper;
    private final CageClaimMapper claimMapper;
    private final CageDivisionService divisionService;

    public CageIntermediateStateService(CageOrderReservationMapper reservationMapper,
                                        CageOpRequestMapper opRequestMapper,
                                        CageClaimMapper claimMapper,
                                        CageDivisionService divisionService) {
        this.reservationMapper = reservationMapper;
        this.opRequestMapper = opRequestMapper;
        this.claimMapper = claimMapper;
        this.divisionService = divisionService;
    }

    /** 全量判定：划分 / 预定（含已下单待审）/ 分笼转移在审 / 认领在审。 */
    public String busyReason(Long animalCageId) {
        if (animalCageId == null) return null;

        if (!divisionService.rowsByCages(List.of(animalCageId)).isEmpty()) {
            return "该笼位已划分给本课题组人员";
        }
        String reservation = reservationReason(animalCageId);
        if (reservation != null) return reservation;
        String op = pendingOpReason(animalCageId);
        if (op != null) return op;
        String claim = pendingClaimReason(animalCageId);
        if (claim != null) return claim;
        return null;
    }

    /**
     * 只判「订购侧」：预定中 / 已加购未提交 / 已下单待审核。
     *
     * <p>分笼/转移的目标校验要的是这一支——它自己已经有带排除项的「在审」判定
     * （改请求时得把自己那条排除掉），这里再拦一遍会把重提误伤。
     */
    public String reservationReason(Long animalCageId) {
        if (animalCageId == null) return null;
        List<CageOrderReservation> active = reservationMapper.listActiveByCageIds(List.of(animalCageId));
        if (active.isEmpty()) return null;
        // 挂在订单上 = 已随单提交、等审核；只挂购物车 = 有人正在选购/已加购未提交
        return active.get(0).getOrderId() != null
                ? "该笼位已被订单预定（待审核）"
                : "该笼位已被预定（还在购物车里）";
    }

    /** 只判「分笼/转移在审」。 */
    public String pendingOpReason(Long animalCageId) {
        if (animalCageId == null) return null;
        Set<Long> pendingOp = CageOperationService.pendingOccupiedCages(
                opRequestMapper.selectByStatus(CageOpRequest.STATUS_PENDING, null), null);
        return pendingOp.contains(animalCageId) ? "该笼位有分笼/转移在审" : null;
    }

    /** 只判「认领在审」。 */
    public String pendingClaimReason(Long animalCageId) {
        if (animalCageId == null) return null;
        return claimMapper.selectCageIdsWithActiveClaim(List.of(animalCageId)).isEmpty()
                ? null : "该笼位有认领申请在处理中";
    }
}

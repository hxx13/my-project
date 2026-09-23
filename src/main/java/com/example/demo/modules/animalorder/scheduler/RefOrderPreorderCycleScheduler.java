package com.example.demo.modules.animalorder.scheduler;

import com.example.demo.modules.animalorder.service.CageOrderReservationService;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 预约单周期推进：每天扫一遍「已通过但笼位还没转饲养中」的预约单（{@code is_preorder=1} +
 * 状态 APPROVED + 到货周期已到），把其名下仍 LOCKED 的笼位正式转「饲养中」（2→3 + 写使用时间），
 * 并给下单人推一条「预约单已进入本周期」。
 *
 * <p><b>幂等是结构性的，不靠标记</b>：扫的只是 status='LOCKED' 的预定；转饲养中会把预定
 * {@code markConsumed}（LOCKED→CONSUMED），所以同一笼位本轮转一次，下轮扫描自然不再命中。
 * 一天跑两遍，每笼也只推进一次。
 *
 * <p>收件人 = 预约单下单人（{@code ref_order.submitter_id}），复用 {@link PushService} 内部的
 * {@code PushRecipientResolver} 做「同人三种 id 形态」归并，不另写一套接收人解析。
 */
@Component
public class RefOrderPreorderCycleScheduler {

    private static final Logger log = LoggerFactory.getLogger(RefOrderPreorderCycleScheduler.class);

    private static final String SOURCE_PREORDER_CYCLE = "REF_ORDER_PREORDER_CYCLE";
    /** 定时任务推进，留痕用固定身份。 */
    private static final String OPERATOR = "SYSTEM";

    private final JdbcTemplate jdbcTemplate;
    private final CageOrderReservationService cageOrderReservationService;
    private final PushService pushService;

    public RefOrderPreorderCycleScheduler(JdbcTemplate jdbcTemplate,
                                          CageOrderReservationService cageOrderReservationService,
                                          PushService pushService) {
        this.jdbcTemplate = jdbcTemplate;
        this.cageOrderReservationService = cageOrderReservationService;
        this.pushService = pushService;
    }

    /** 每天凌晨 1:00（JVM 默认时区 = Asia/Shanghai，见 TwinSystemApplication）。 */
    @Scheduled(cron = "0 0 1 * * ?")
    public void advanceCycles() {
        List<DueReservation> due;
        try {
            due = scanDue(LocalDate.now());
        } catch (Exception e) {
            log.error("[preorder-cycle] 扫描到期预约单失败: {}", e.getMessage(), e);
            return;
        }
        if (due.isEmpty()) return;

        // 按订单分组：一单只推一条，但一单名下可能有多个笼位。
        Map<Long, OrderGroup> byOrder = new LinkedHashMap<>();
        for (DueReservation d : due) {
            OrderGroup g = byOrder.computeIfAbsent(d.orderId(),
                    k -> new OrderGroup(d.orderId(), d.submitterId(), d.projectGroupName(), d.deliveryDate()));
            g.reservations.add(toReservation(d));
        }

        int promoted = 0;
        for (OrderGroup g : byOrder.values()) {
            for (CageOrderReservation r : g.reservations) {
                try {
                    cageOrderReservationService.promote(r, OPERATOR);
                    promoted++;
                } catch (Exception e) {
                    log.error("[preorder-cycle] 预约单 {} 笼位 {} 转饲养中失败: {}",
                            g.orderId(), r.getAnimalCageId(), e.getMessage(), e);
                }
            }
            push(g);
        }
        log.info("[preorder-cycle] 本轮推进 {} 个预约单、{} 个笼位转饲养中", byOrder.size(), promoted);
    }

    /** 到期预约单名下仍 LOCKED 的预定。JdbcTemplate 直查，不进 mapper（避免和审核页那套 mapper 抢文件）。 */
    List<DueReservation> scanDue(LocalDate today) {
        return jdbcTemplate.query("""
                        SELECT o.id AS order_id, o.submitter_id, o.project_group_name, o.estimated_delivery_date,
                               r.id AS reservation_id, r.animal_cage_id, r.written_json
                        FROM cage_order_reservation r
                        JOIN ref_order o ON o.id = r.order_id
                        WHERE r.status = 'LOCKED'
                          AND o.is_preorder = 1
                          AND o.status = 'APPROVED'
                          AND o.estimated_delivery_date <= ?
                        """,
                (rs, i) -> new DueReservation(
                        rs.getLong("order_id"),
                        rs.getString("submitter_id"),
                        rs.getString("project_group_name"),
                        rs.getDate("estimated_delivery_date") == null ? null
                                : rs.getDate("estimated_delivery_date").toLocalDate(),
                        rs.getLong("reservation_id"),
                        rs.getLong("animal_cage_id"),
                        rs.getString("written_json")),
                today);
    }

    private void push(OrderGroup g) {
        if (g.submitterId() == null || g.submitterId().isBlank()) return;
        try {
            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("orderId", String.valueOf(g.orderId()));
            vars.put("projectGroupName", g.projectGroupName() == null ? "" : g.projectGroupName());
            vars.put("deliveryDate", g.deliveryDate() == null ? "" : g.deliveryDate().toString());
            pushService.send(SOURCE_PREORDER_CYCLE, vars, Set.of(g.submitterId()));
        } catch (Exception e) {
            log.warn("[preorder-cycle] 预约单 {} 推送失败: {}", g.orderId(), e.getMessage());
        }
    }

    private static CageOrderReservation toReservation(DueReservation d) {
        CageOrderReservation r = new CageOrderReservation();
        r.setId(d.reservationId());
        r.setAnimalCageId(d.animalCageId());
        r.setWrittenJson(d.writtenJson());
        return r;
    }

    record DueReservation(Long orderId, String submitterId, String projectGroupName,
                          LocalDate deliveryDate, Long reservationId, Long animalCageId,
                          String writtenJson) {
    }

    private static final class OrderGroup {
        final Long orderId;
        final String submitterId;
        final String projectGroupName;
        final LocalDate deliveryDate;
        final List<CageOrderReservation> reservations = new ArrayList<>();

        OrderGroup(Long orderId, String submitterId, String projectGroupName, LocalDate deliveryDate) {
            this.orderId = orderId;
            this.submitterId = submitterId;
            this.projectGroupName = projectGroupName;
            this.deliveryDate = deliveryDate;
        }

        Long orderId() { return orderId; }
        String submitterId() { return submitterId; }
        String projectGroupName() { return projectGroupName; }
        LocalDate deliveryDate() { return deliveryDate; }
    }
}

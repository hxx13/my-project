package com.example.demo.modules.animalorder.config;

import com.example.demo.modules.animalorder.service.CageOrderReservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 启动清一次孤儿笼位预定：购物车行已经不存在、也没挂到订单上的 LOCKED 行
 * （进程崩溃、早期版本漏释放等残留）。不扫就会永久占住笼位，别人再也选不到。
 * 按 cart_id 索引扫，量小，秒过。
 */
@Component
@Order(135)
public class CageOrderReservationCleanup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageOrderReservationCleanup.class);
    private final CageOrderReservationService service;

    public CageOrderReservationCleanup(CageOrderReservationService service) {
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int released = service.releaseOrphans();
            if (released > 0) {
                log.info("[cage-reservation] 启动清理孤儿预定 {} 条", released);
            }
        } catch (Exception e) {
            log.warn("[cage-reservation] 孤儿预定清理跳过: {}", e.getMessage());
        }
    }
}

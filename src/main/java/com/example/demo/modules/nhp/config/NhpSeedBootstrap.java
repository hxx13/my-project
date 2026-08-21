package com.example.demo.modules.nhp.config;

import com.example.demo.modules.nhp.service.NhpSeedService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * NHP 种子数据启动加载：应用启动后幂等灌入配置表 + 码表 + 联动。
 * 幂等，重复启动无副作用；也可经 {@code POST /api/nhp/seed} 手动触发。
 */
@Component
public class NhpSeedBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NhpSeedBootstrap.class);

    private final NhpSeedService seedService;

    public NhpSeedBootstrap(NhpSeedService seedService) {
        this.seedService = seedService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            seedService.seedAll();
        } catch (Exception e) {
            log.warn("[nhp-seed] 启动种子加载跳过: {}", e.getMessage());
        }
    }
}

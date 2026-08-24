package com.example.demo.modules.aup.config;

import com.example.demo.modules.aup.service.AupSeedService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * AUP 种子数据启动加载：应用启动后幂等灌入码表 + 字段字典 + 原子域 + 组合域。
 * 幂等，重复启动无副作用；也可经 {@code POST /api/aup-seed/seed} 手动触发。
 */
@Component
public class AupSeedBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AupSeedBootstrap.class);

    private final AupSeedService seedService;

    public AupSeedBootstrap(AupSeedService seedService) {
        this.seedService = seedService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            seedService.seedAll();
        } catch (Exception e) {
            log.warn("[aup-seed] 启动种子加载跳过: {}", e.getMessage());
        }
    }
}

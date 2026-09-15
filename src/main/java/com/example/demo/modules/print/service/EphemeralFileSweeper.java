package com.example.demo.modules.print.service;

import com.example.demo.modules.adminfile.AdminFileTemplateService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 过期一次性文件的兜底清理。
 *
 * 主路径是「打印成功后立刻删」（{@link PrintSourceCleaner}），但那条路走不到的情况不少：
 * 任务失败后没人管、工位压根没来取、服务端在中途重启。文件就这么一直躺着 —— 那就留痕了。
 *
 * 所以这里按时间兜底：超过 TTL 的一次性文件一律清掉，
 * 但**跳过还停在 PENDING/SENT 的任务**，免得把工位正要来取的文件删了。
 */
@Component
public class EphemeralFileSweeper {

    private static final Logger log = LoggerFactory.getLogger(EphemeralFileSweeper.class);

    private final AdminFileTemplateService adminFileTemplateService;
    private final int ttlMinutes;

    public EphemeralFileSweeper(
            AdminFileTemplateService adminFileTemplateService,
            @Value("${app.print.ephemeral-ttl-minutes:30}") int ttlMinutes) {
        this.adminFileTemplateService = adminFileTemplateService;
        this.ttlMinutes = Math.max(1, ttlMinutes);
    }

    @Scheduled(fixedDelayString = "${app.print.ephemeral-sweep-ms:300000}")
    public void sweep() {
        try {
            int n = adminFileTemplateService.purgeExpiredEphemeral(ttlMinutes);
            if (n > 0) {
                log.info("[print] 清理了 {} 个过期一次性文件（TTL {} 分钟）", n, ttlMinutes);
            }
        } catch (Exception e) {
            log.warn("[print] 一次性文件清理失败: {}", e.getMessage());
        }
    }
}

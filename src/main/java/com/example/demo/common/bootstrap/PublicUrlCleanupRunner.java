package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 启动时自动将数据库中残留的 IP 绝对 URL 替换为相对路径。
 * 配合 app.public-base-url 留空，彻底消除 runtime-config 中的后端 IP 泄露。
 */
@Component
@Order(106)
public class PublicUrlCleanupRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PublicUrlCleanupRunner.class);
    private static final String IP_PREFIX = "http://47.101.61.184:8080";

    private final JdbcTemplate jdbc;

    public PublicUrlCleanupRunner(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        int total = 0;
        // sys_system_config — 核心：公告内容 notice_body 等
        total += replaceInTable("sys_system_config", "config_value",
                "config_value LIKE '%47.101.61.184%'");

        // 业务表中含图片 URL 的列
        total += replaceInTable("supply_item", "cover_url",
                "cover_url LIKE '%47.101.61.184%'");
        total += replaceInTable("twin_student_violation", "image_urls",
                "image_urls LIKE '%47.101.61.184%'");
        total += replaceInTable("asset_transfer_request", "photo_url",
                "photo_url LIKE '%47.101.61.184%'");
        total += replaceInTable("asset_transfer_request", "photo_urls_before",
                "photo_urls_before LIKE '%47.101.61.184%'");
        total += replaceInTable("asset_transfer_request", "photo_urls_after",
                "photo_urls_after LIKE '%47.101.61.184%'");
        total += replaceInTable("repair_order", "request_images_json",
                "request_images_json LIKE '%47.101.61.184%'");
        total += replaceInTable("repair_order", "result_images_json",
                "result_images_json LIKE '%47.101.61.184%'");

        if (total > 0) {
            log.info("PublicUrlCleanup: 已将 {} 处 IP 绝对 URL 替换为相对路径", total);
        }
    }

    private int replaceInTable(String table, String column, String whereClause) {
        try {
            return jdbc.update(
                    "UPDATE " + table + " SET " + column + " = REPLACE(" + column + ", '" + IP_PREFIX + "', '') WHERE " + whereClause);
        } catch (Exception e) {
            log.debug("PublicUrlCleanup: 跳过 {}.{} ({})", table, column, e.getMessage());
            return 0;
        }
    }
}

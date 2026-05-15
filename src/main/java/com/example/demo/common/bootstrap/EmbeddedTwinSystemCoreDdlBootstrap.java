package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * 在 {@code spring.sql.init.mode=never} 时，于应用启动阶段在库内执行与 {@code scripts/*.ddl.sql} 同源的 classpath SQL，
 * 避免无法在库外手工跑脚本时出现缺表。需数据源账号具备 CREATE TABLE 等权限。
 * <p>
 * 关闭方式：{@code app.schema.auto-ensure-embedded-core-ddl=false}（生产由 DBA 独占 DDL 时可关）。
 */
@Component
@Order(2)
@ConditionalOnProperty(
        prefix = "app.schema",
        name = "auto-ensure-embedded-core-ddl",
        havingValue = "true",
        matchIfMissing = true
)
public class EmbeddedTwinSystemCoreDdlBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(EmbeddedTwinSystemCoreDdlBootstrap.class);

    private final DataSource dataSource;

    public EmbeddedTwinSystemCoreDdlBootstrap(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) {
        runScript("db/bootstrap-login-branding-invite-chat.sql", "登录轮播/推荐码/站内信等核心表");
        runScript("db/bootstrap-admin-file-template.sql", "admin_file_template（文件模板下载）");
    }

    private void runScript(String classpath, String label) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.addScript(new ClassPathResource(classpath));
            populator.setSeparator(";");
            populator.setContinueOnError(false);
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("[embedded-ddl] 已执行 classpath:{}（{}）", classpath, label);
        } catch (Exception ex) {
            log.warn(
                    "[embedded-ddl] 执行 {} 失败（{}）。请确认 spring.datasource 用户具备 DDL 权限，或改由 DBA 执行 scripts 下等价脚本：{}",
                    classpath,
                    label,
                    ex.getMessage()
            );
        }
    }
}

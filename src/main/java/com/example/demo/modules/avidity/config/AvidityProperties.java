package com.example.demo.modules.avidity.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 安维迪(云组态)对接配置。对方是 ABP/.NET 的 SCADA 平台，本模块只取
 * 「运营仪表盘」那一路数据：通道（Dashboard）+ 报警统计表 + 当前报警。
 *
 * <p>口令在 application-local.properties，与 dahua / wincc 同一处。
 */
@Data
@ConfigurationProperties(prefix = "app.avidity")
public class AvidityProperties {

    /** 关闭后既不登录也不拉数，查询接口返回库里的存量。 */
    private boolean enabled = true;

    /** API 主机，形如 https://avidity.yunzutai.com:22744；不含路径。 */
    private String baseUrl = "";

    private String username = "";
    private String password = "";

    private int connectTimeoutMs = 8000;
    private int readTimeoutMs = 30000;

    /** 实时长连接是否启用。关掉后平面图只按「今日报过」上色，不再标实时报警。 */
    private boolean liveEnabled = true;

    /**
     * 实时长连接地址（SignalR Hub）。**主机和 API 主机不是同一台**：
     * 取自平台 /assets/appconfig.json 里的 communicationServiceBaseUrl。
     */
    private String liveHubUrl = "wss://api.yunzutai.com:12233/signalr-hub";

    /** 断线重连间隔（毫秒）。 */
    private long liveReconnectMs = 10_000L;

    /** 同步间隔（毫秒）。 */
    private long syncIntervalMs = 300_000L;
    private long syncInitialDelayMs = 60_000L;
}

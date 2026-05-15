package com.example.demo.modules.telemetry.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * WinCC REST 只读（tagManagement/Values）配置。测点列表为空时使用 {@link #defaultWatchlist()}。
 */
@Data
@ConfigurationProperties(prefix = "app.wincc")
public class WinCcProperties {

    /** 为 false 时不调 WinCC，接口返回占位说明（开发机无 WinCC 时不超时）。 */
    private boolean enabled = false;

    /** 例如 https://CLIENT-01:8080，不含路径。 */
    private String baseUrl = "";

    private String username = "";
    private String password = "";

    /**
     * 仅内网联调：对 WinCC 自签证书信任所有（不修改 JVM 全局默认 SSL，仅本模块 RestTemplate 使用）。
     */
    private boolean sslInsecure = false;

    private int connectTimeoutMs = 8000;
    /** 单次 POST /Values 读超时；分片后每批仍受此限制。现场 WinCC 偶发慢响应时可调到 120000 以上。 */
    private int readTimeoutMs = 120000;

    /**
     * 每次 POST body 中 variableNames 的最大条数。WinCC 与网络对超大 JSON 易超时，建议 80～200。
     */
    private int valuesChunkSize = 150;

    /** 后台定时从 WinCC 拉取快照的间隔（毫秒）。 */
    private long refreshIntervalMs = 15000L;

    /**
     * 滑动时间窗（毫秒）：窗内最早有效样本为「开盘」、当前值为「收盘」，用于 {@code valueTrend}；默认 5 分钟以减轻短时噪声。
     */
    private long trendWindowMs = 300_000L;

    /** 趋势死区绝对值；与 {@link #trendDeadbandRel} 合成后与 |close-open| 比较，小于则视为无趋势（null）。略大以减少短时波动箭头。 */
    private double trendDeadbandAbs = 0.52d;

    /** 趋势死区相对 max(|open|,|close|) 的比例。 */
    private double trendDeadbandRel = 0.0045d;

    /**
     * Spring Resource 位置，UTF-8 CSV；置空则不读 classpath（推荐大表用后台一键导入 + database，或 file: 外置路径）。
     */
    private String watchlistCsv = "";

    /**
     * classpath：使用 watchlistCsv 资源；database：合并 MySQL 中各分区已启用变量（需先执行 db/telemetry-watchlist-schema.sql）。
     */
    private String watchlistSource = "classpath";

    /**
     * 为 true 时，在 {@code watchlist-source} 非 database 时仍允许快照刷新走 {@link com.example.demo.modules.telemetry.config.TelemetryWatchlistLoader#resolveTagNames()}；
     * 默认 false，避免定时/程序坞拉数误用 classpath 或 variable-names。
     */
    private boolean allowNonDatabaseSnapshotPull = false;

    /** 非空时优先于 CSV 与内置列表（适合临时覆盖或环境注入）。 */
    private List<String> variableNames = new ArrayList<>();

    /**
     * 无 CSV、无 {@link #variableNames} 时的内置回退点名（顺序诊断取前 5 个与当前 watchlist 对照）。
     * 现场应配置 CSV 或 database；此处仅避免空清单导致链路无法探测。
     */
    public static List<String> defaultWatchlist() {
        return List.of(
                "WinCC_System_Info.ChannelStates.ChannelState[1]",
                "WinCC_System_Info.ChannelStates.ChannelState[2]",
                "WinCC_System_Info.ChannelStates.ChannelState[3]",
                "WinCC_System_Info.ChannelStates.ChannelState[4]",
                "WinCC_System_Info.ChannelStates.ChannelState[5]");
    }

    /**
     * @deprecated 请使用 {@link TelemetryWatchlistLoader#resolveTagNames()}，本方法仅保留兼容。
     */
    @Deprecated
    public List<String> resolvedVariableNames() {
        if (variableNames != null && !variableNames.isEmpty()) {
            return variableNames.stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        }
        return defaultWatchlist();
    }

}

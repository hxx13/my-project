package com.example.demo.modules.telemetry.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import com.example.demo.modules.telemetry.service.TelemetryWatchlistDbService;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 解析 WinCC POST /Values 的变量名列表。
 * <p><strong>database 源优先</strong>：{@code app.wincc.watchlist-source=database} 时<strong>仅</strong>合并库中各分区
 * 「已启用 + 参与拉数」的变量；若无任何行则返回空列表，<strong>不回退</strong> CSV 或内置默认点。</p>
 * <p>非 database：{@code app.wincc.variable-names} 非空优先；否则读 CSV；CSV 无有效行则用 {@link WinCcProperties#defaultWatchlist()}。</p>
 */
@Component
public class TelemetryWatchlistLoader {

    private static final Logger log = LoggerFactory.getLogger(TelemetryWatchlistLoader.class);

    private static final String[] HEADER_FIRST_CELL = {"tagname", "名称", "wincc_tag", "variable"};

    private final WinCcProperties properties;
    private final ResourceLoader resourceLoader;
    private final TelemetryWatchlistDbService watchlistDbService;

    public TelemetryWatchlistLoader(WinCcProperties properties,
                                    ResourceLoader resourceLoader,
                                    TelemetryWatchlistDbService watchlistDbService) {
        this.properties = properties;
        this.resourceLoader = resourceLoader;
        this.watchlistDbService = watchlistDbService;
    }

    /**
     * 当前生效的 WinCC 变量名列表（用于 POST Values）。
     */
    public List<String> resolveTagNames() {
        if (watchlistDbService.useDatabaseSource()) {
            List<String> fromDb = watchlistDbService.loadMergedWinccVariableNamesFromDb();
            log.info("[WinCC遥测] watchlist-source=database：使用库中已启用且参与拉数的变量，共 {} 条", fromDb.size());
            if (fromDb.isEmpty()) {
                log.warn("[WinCC遥测] 数据库中无可用变量（请检查分区「参与 WinCC 拉数」与各行的「启用」）；不累加 CSV/内置默认点");
            }
            return fromDb;
        }
        if (properties.getVariableNames() != null && !properties.getVariableNames().isEmpty()) {
            List<String> fromProps = properties.getVariableNames().stream()
                    .map(String::trim)
                    .filter(StringUtils::hasText)
                    .toList();
            log.info("[WinCC遥测] 使用 application 中的 variable-names，共 {} 条", fromProps.size());
            return fromProps;
        }
        List<String> fromCsv = loadFromCsv();
        if (!fromCsv.isEmpty()) {
            log.info("[WinCC遥测] 使用 CSV 测点清单，共 {} 条，resource={}", fromCsv.size(), properties.getWatchlistCsv());
            return fromCsv;
        }
        List<String> fallback = WinCcProperties.defaultWatchlist();
        log.info("[WinCC遥测] CSV 无有效行或未配置资源，使用内置默认测点 {} 条", fallback.size());
        return fallback;
    }

    private List<String> loadFromCsv() {
        String location = properties.getWatchlistCsv();
        if (!StringUtils.hasText(location)) {
            return List.of();
        }
        Resource resource = resourceLoader.getResource(location.trim());
        if (!resource.exists()) {
            log.warn("[WinCC遥测] watchlist CSV 不存在或不可读: {}", location);
            return List.of();
        }
        List<String> out = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            int lineNo = 0;
            boolean firstDataLine = true;
            while ((line = reader.readLine()) != null) {
                lineNo++;
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                String cell = firstCsvCell(trimmed);
                if (firstDataLine && isHeaderRow(cell)) {
                    firstDataLine = false;
                    continue;
                }
                firstDataLine = false;
                if (StringUtils.hasText(cell) && !isHeaderRow(cell)) {
                    out.add(cell);
                }
            }
        } catch (Exception e) {
            log.warn("[WinCC遥测] 读取 watchlist CSV 失败: {} — {}", location, e.getMessage());
            return List.of();
        }
        return out;
    }

    private static String firstCsvCell(String line) {
        int comma = line.indexOf(',');
        if (comma < 0) {
            return line.trim();
        }
        return line.substring(0, comma).trim().replace("\"", "");
    }

    private static boolean isHeaderRow(String cell) {
        String lower = cell.toLowerCase(Locale.ROOT);
        for (String h : HEADER_FIRST_CELL) {
            if (lower.equals(h.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }
}

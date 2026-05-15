package com.example.demo.modules.telemetry.client;

import com.example.demo.modules.telemetry.config.WinCcProperties;
import com.example.demo.modules.telemetry.service.TelemetryWatchlistDbService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * WinCC REST：POST {@code .../tagManagement/Values} 批量读；PUT {@code .../tagManagement/Value/&lt;VariableName&gt;} 单点写（手册 10.5.10）。
 */
@Component
public class WinCcRestTagClient {

    private static final Logger log = LoggerFactory.getLogger(WinCcRestTagClient.class);

    private final WinCcProperties properties;
    private final ObjectMapper objectMapper;

    public WinCcRestTagClient(WinCcProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /**
     * 批量读当前值；点名过多时自动按 {@link WinCcProperties#getValuesChunkSize()} 分片多次 POST 并合并结果。
     * 成功路径仅 DEBUG；失败打 WARN（含 HTTP 非 2xx、网络异常、解析失败）。
     */
    public List<Map<String, Object>> readValues(List<String> variableNames) {
        if (!properties.isEnabled()) {
            throw new IllegalStateException("WinCC 未启用");
        }
        if (!StringUtils.hasText(properties.getBaseUrl())) {
            throw new IllegalStateException("未配置 app.wincc.base-url");
        }
        if (variableNames == null || variableNames.isEmpty()) {
            return List.of();
        }

        int chunkSize = Math.max(1, properties.getValuesChunkSize());
        if (variableNames.size() <= chunkSize) {
            return readValuesOneRequest(variableNames);
        }

        RestTemplate rt = buildRestTemplate();
        String url = trimSlash(properties.getBaseUrl()) + "/WinCCRestService/tagManagement/Values";
        HttpHeaders headers = buildHeaders();

        int total = variableNames.size();
        int batches = (total + chunkSize - 1) / chunkSize;
        if (log.isDebugEnabled()) {
            log.debug("[WinCC遥测] POST Values 分批：共 {} 条，每批 {}，共 {} 次", total, chunkSize, batches);
        }

        List<Map<String, Object>> merged = new ArrayList<>(total);
        for (int from = 0; from < total; from += chunkSize) {
            int to = Math.min(from + chunkSize, total);
            List<String> slice = variableNames.subList(from, to);
            int batchIndex = from / chunkSize + 1;
            if (log.isDebugEnabled()) {
                log.debug("[WinCC遥测] POST Values 分片 {}/{} 条数={}", batchIndex, batches, slice.size());
            }
            List<Map<String, Object>> part = readValuesOneRequest(rt, url, headers, slice);
            merged.addAll(part);
        }
        return merged;
    }

    /**
     * 同步写入单个变量（手册 10.5.10：PUT，JSON {@code {"value": ...}}）。
     *
     * @throws RestClientException HTTP 非 2xx、响应体无效或 {@code errorcode != 0}
     */
    public Map<String, Object> writeTagValue(String variableName, Object value) {
        if (!properties.isEnabled()) {
            throw new IllegalStateException("WinCC 未启用");
        }
        if (!StringUtils.hasText(properties.getBaseUrl())) {
            throw new IllegalStateException("未配置 app.wincc.base-url");
        }
        if (!StringUtils.hasText(variableName)) {
            throw new IllegalArgumentException("variableName 不能为空");
        }
        RestTemplate rt = buildRestTemplate();
        String enc = UriUtils.encodePath(variableName.trim(), StandardCharsets.UTF_8);
        String url = trimSlash(properties.getBaseUrl()) + "/WinCCRestService/tagManagement/Value/" + enc;
        HttpHeaders headers = buildHeaders();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("value", value);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        if (log.isDebugEnabled()) {
            log.debug("[WinCC遥测] PUT {} variable={} sslInsecure={}", url, abbrev(variableName.trim(), 48),
                    properties.isSslInsecure());
        }
        ResponseEntity<String> response = rt.exchange(url, HttpMethod.PUT, entity, String.class);
        String raw = response.getBody();
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new RestClientException("WinCC 写入 HTTP " + response.getStatusCode().value());
        }
        if (raw == null || raw.isBlank()) {
            throw new RestClientException("WinCC 写入响应体为空");
        }
        try {
            JsonNode root = objectMapper.readTree(raw);
            if (!root.isObject()) {
                throw new RestClientException("WinCC 写入响应不是 JSON 对象");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> out = objectMapper.convertValue(root, Map.class);
            Object ec = out.get("errorcode");
            if (ec instanceof Number n && n.intValue() != 0) {
                throw new RestClientException("WinCC 写入失败 errorcode=" + ec);
            }
            return out;
        } catch (RestClientException e) {
            throw e;
        } catch (Exception e) {
            throw new RestClientException("解析 WinCC 写入响应失败: " + e.getMessage(), e);
        }
    }

    private List<Map<String, Object>> readValuesOneRequest(List<String> variableNames) {
        RestTemplate rt = buildRestTemplate();
        String url = trimSlash(properties.getBaseUrl()) + "/WinCCRestService/tagManagement/Values";
        return readValuesOneRequest(rt, url, buildHeaders(), variableNames);
    }

    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        if (StringUtils.hasText(properties.getUsername())) {
            String token = properties.getUsername() + ":" + properties.getPassword();
            String basic = Base64.getEncoder().encodeToString(token.getBytes(StandardCharsets.UTF_8));
            headers.set(HttpHeaders.AUTHORIZATION, "Basic " + basic);
        }
        return headers;
    }

    private List<Map<String, Object>> readValuesOneRequest(RestTemplate rt, String url, HttpHeaders headers,
                                                           List<String> variableNames) {
        List<String> toPost = normalizeAndLogVariableNames(variableNames);
        if (toPost.isEmpty()) {
            log.warn("[WinCC遥测] POST /Values 跳过：规范化后点名全部为空，原始条数={}", variableNames == null ? 0 : variableNames.size());
            return List.of();
        }

        Map<String, Object> body = Map.of("variableNames", toPost);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        String firstTag = toPost.isEmpty() ? "—" : abbrev(toPost.get(0), 48);
        if (log.isDebugEnabled()) {
            log.debug("[WinCC遥测] POST {} variableNames={} firstTag={} sslInsecure={} hasBasicAuth={}",
                    url, toPost.size(), firstTag, properties.isSslInsecure(), headers.containsKey(HttpHeaders.AUTHORIZATION));
        }
        // 调试时可设 logging.level...WinCcRestTagClient=DEBUG 查看每次 POST 的点名列表
        log.debug("[WinCC遥测][POST Values 调试] requestBody.variableNames={}", toPost);

        ResponseEntity<String> response;
        try {
            response = rt.postForEntity(url, entity, String.class);
        } catch (RestClientException e) {
            log.warn("[WinCC遥测] POST /Values 请求异常: {} · url={} · 规范化后点名={}", e.getMessage(), url, toPost, e);
            throw e;
        }
        String raw = response.getBody();
        int bodyLen = raw == null ? 0 : raw.length();
        if (log.isDebugEnabled()) {
            log.debug("[WinCC遥测] 响应 HTTP {} bodyLength={}", response.getStatusCode().value(), bodyLen);
        }
        if (!response.getStatusCode().is2xxSuccessful()) {
            log.warn("[WinCC遥测] POST /Values 非成功 HTTP {} bodyLength={}", response.getStatusCode().value(), bodyLen);
        }
        if (log.isDebugEnabled() && raw != null && !raw.isBlank()) {
            String preview = raw.length() > 400 ? raw.substring(0, 400) + "…" : raw;
            log.debug("[WinCC遥测] 响应正文预览: {}", preview);
        }
        if (raw == null || raw.isBlank()) {
            log.warn("[WinCC遥测] WinCC 返回**空响应体**（HTTP {}）。常见原因：①点名含 BOM/不可见字符（已尝试规范化）；②变量在 WinCC 中不存在/未发布；③REST 服务过滤未知点名；④网关截断。本次规范化后点名={}",
                    response.getStatusCode().value(), toPost);
            return List.of();
        }
        List<Map<String, Object>> parsed = parseValuesPayload(raw);
        if (parsed.isEmpty()) {
            String preview = raw.length() > 800 ? raw.substring(0, 800) + "…" : raw;
            log.warn("[WinCC遥测] JSON 解析后行数为 0。请核对 WinCC 返回是否为数组、或 {{\"values\":[...]}}。正文预览: {}", preview);
        } else {
            log.debug("[WinCC遥测][POST Values 调试] 解析得到 {} 行", parsed.size());
        }
        return parsed;
    }

    /**
     * NFKC + 去 BOM/零宽字符 + 去重；若与原始字符串不同则打 WARN 便于对照控制台。
     */
    private List<String> normalizeAndLogVariableNames(List<String> variableNames) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        if (variableNames == null) {
            return List.of();
        }
        for (String vn : variableNames) {
            if (!StringUtils.hasText(vn)) {
                continue;
            }
            String trimmed = vn.trim();
            String norm = TelemetryWatchlistDbService.normalizeWinCcVariableKey(vn);
            if (!StringUtils.hasText(norm)) {
                continue;
            }
            if (!trimmed.contentEquals(norm) && log.isWarnEnabled()) {
                char c0 = trimmed.isEmpty() ? ' ' : trimmed.charAt(0);
                char n0 = norm.isEmpty() ? ' ' : norm.charAt(0);
                log.warn("[WinCC遥测] 点名规范化（去除 BOM/全角点等）: rawU+{} normU+{} raw={} norm={}",
                        String.format("%04X", (int) c0), String.format("%04X", (int) n0),
                        abbrev(trimmed, 96), abbrev(norm, 96));
            }
            seen.add(norm);
        }
        return new ArrayList<>(seen);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseValuesPayload(String raw) throws RestClientException {
        try {
            JsonNode root = objectMapper.readTree(raw);
            if (root.isArray()) {
                return objectMapper.convertValue(root, List.class);
            }
            if (root.isObject() && root.has("values") && root.get("values").isArray()) {
                return objectMapper.convertValue(root.get("values"), List.class);
            }
            if (root.isObject()) {
                Iterator<String> it = root.fieldNames();
                while (it.hasNext()) {
                    String name = it.next();
                    JsonNode n = root.get(name);
                    if (n != null && n.isArray()) {
                        List<Map<String, Object>> out = new ArrayList<>();
                        for (JsonNode el : n) {
                            if (el.isObject()) {
                                out.add(objectMapper.convertValue(el, Map.class));
                            }
                        }
                        if (!out.isEmpty()) {
                            return out;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[WinCC遥测] 解析 WinCC 响应 JSON 失败: {}", e.getMessage());
            throw new RestClientException("解析 WinCC 响应失败: " + e.getMessage(), e);
        }
        log.warn("[WinCC遥测] WinCC JSON 根节点无法映射为对象数组（既不是顶层数组，也无 values 数组）。root sample: {}",
                abbrev(raw, 600));
        return List.of();
    }

    private RestTemplate buildRestTemplate() {
        ClientHttpRequestFactory factory;
        if (properties.isSslInsecure()) {
            factory = new WinCcSslRequestFactory(true, properties.getConnectTimeoutMs(), properties.getReadTimeoutMs());
        } else {
            SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
            f.setConnectTimeout(properties.getConnectTimeoutMs());
            f.setReadTimeout(properties.getReadTimeoutMs());
            factory = f;
        }
        return new RestTemplate(factory);
    }

    private static String abbrev(String s, int max) {
        if (s == null) {
            return "—";
        }
        if (s.length() <= max) {
            return s;
        }
        return s.substring(0, max) + "…";
    }

    private static String trimSlash(String base) {
        String s = base.trim();
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        return s;
    }
}

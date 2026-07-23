package com.example.demo.modules.aro.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.dto.AroNewsDetailDto;
import com.example.demo.modules.aro.dto.AroNewsListPayloadDto;
import com.example.demo.modules.aro.dto.AroNewsSummaryDto;
import com.example.demo.modules.aro.support.AroNewsResponseParser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 服务端代理 ARO JTU 新闻接口：使用 {@link AroService} 全局 Token，不向小程序暴露 JTU 域名与 Token。
 */
@Service
public class AroNewsProxyService {

    private static final Logger log = LoggerFactory.getLogger(AroNewsProxyService.class);

    private final RestTemplate restTemplate;
    private final AroService aroService;
    private final String jtuBaseUrl;

    public AroNewsProxyService(RestTemplate restTemplate,
                               AroService aroService,
                               @Value("${app.aro.jtu-api-base-url:https://aro.shsmu.edu.cn/jtu/api}") String jtuBaseUrl) {
        this.restTemplate = restTemplate;
        this.aroService = aroService;
        this.jtuBaseUrl = jtuBaseUrl == null ? "" : jtuBaseUrl.replaceAll("/+$", "");
    }

    public AroNewsListPayloadDto fetchNewsList() {
        String url = jtuBaseUrl + "/news?_t=" + System.currentTimeMillis();
        String json = exchangeGetWithTokenRetry(url);
        Map<String, Object> root = JSON.parseObject(json, Map.class);
        if (root == null) {
            return AroNewsListPayloadDto.builder().list(List.of()).build();
        }
        List<Map<String, Object>> rawMaps = AroNewsResponseParser.extractListMaps(root);
        if (rawMaps.isEmpty()) {
            log.warn("[ARO新闻] 列表解析为空，请核对 JTU 响应结构是否变更。顶层 keys={}", root.keySet());
        }
        List<AroNewsSummaryDto> out = new ArrayList<>(rawMaps.size());
        for (Map<String, Object> m : rawMaps) {
            out.add(toSummary(m));
        }
        return AroNewsListPayloadDto.builder().list(out).build();
    }

    public AroNewsDetailDto fetchNewsDetail(String id) {
        String sid = id == null ? "" : id.trim();
        if (sid.isEmpty()) {
            throw new IllegalArgumentException("缺少新闻 id");
        }
        String enc = UriUtils.encodePathSegment(sid, StandardCharsets.UTF_8);
        String url = jtuBaseUrl + "/news/" + enc + "?_t=" + System.currentTimeMillis();
        String json = exchangeGetWithTokenRetry(url);
        Map<String, Object> root = JSON.parseObject(json, Map.class);
        if (root == null) {
            throw new IllegalStateException("ARO 新闻详情返回为空");
        }
        Map<String, Object> dataMap = AroNewsResponseParser.extractDetailMap(root, sid);
        if (dataMap.isEmpty()) {
            log.warn("[ARO新闻] 详情解析为空 id={} 顶层 keys={}", sid, root.keySet());
            throw new IllegalStateException("ARO 新闻详情缺少 data");
        }
        AroNewsDetailDto detail = toDetail(dataMap, sid);
        if (detail.getNewsContent() == null || detail.getNewsContent().isBlank()) {
            log.warn("[ARO新闻] 详情正文为空 id={} item keys={}", sid, dataMap.keySet());
        }
        return detail;
    }

    private String exchangeGetWithTokenRetry(String urlString) {
        java.net.URI uri = java.net.URI.create(urlString);
        HttpClientErrorException unauthorized = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            String token = aroService.requireJtuApiToken();
            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", token);
            HttpEntity<Void> entity = new HttpEntity<>(headers);
            try {
                ResponseEntity<String> response = restTemplate.exchange(uri, HttpMethod.GET, entity, String.class);
                String body = response.getBody();
                return body == null ? "{}" : body;
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode() == HttpStatus.UNAUTHORIZED && attempt == 0) {
                    log.warn("[ARO新闻] Token 失效，重新登录后重试: {}", e.getMessage());
                    unauthorized = e;
                    aroService.clearJtuCachedToken();
                    continue;
                }
                log.warn("[ARO新闻] HTTP {} {}", e.getStatusCode(), e.getMessage());
                throw new IllegalStateException("拉取 ARO 新闻失败: HTTP " + e.getStatusCode().value(), e);
            }
        }
        throw new IllegalStateException("拉取 ARO 新闻失败: 登录重试后仍 401", unauthorized);
    }

    private static AroNewsSummaryDto toSummary(Map<String, Object> m) {
        return AroNewsSummaryDto.builder()
                .id(AroNewsResponseParser.pickId(m, ""))
                .newsName(AroNewsResponseParser.pickTitle(m))
                .createTime(AroNewsResponseParser.pickCreateTime(m))
                .build();
    }

    private static AroNewsDetailDto toDetail(Map<String, Object> m, String fallbackId) {
        return AroNewsDetailDto.builder()
                .id(AroNewsResponseParser.pickId(m, fallbackId))
                .newsName(AroNewsResponseParser.pickTitle(m))
                .createTime(AroNewsResponseParser.pickCreateTime(m))
                .newsContent(AroNewsResponseParser.pickNewsContent(m))
                .build();
    }
}

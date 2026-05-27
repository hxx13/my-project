package com.example.demo.config;

import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.core5.util.TimeValue;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.util.List;

/**
 * ARO 官方出站专用 RestTemplate：连接池 + keep-alive，避免每次 analyze 并行双 GET 各付一次 TLS 冷启动。
 */
@Configuration
public class AroRestTemplateConfig {

  private static final String USER_AGENT = "TwinSystem-ARO-Client/1.0 (Java; connection-pool)";

  @Bean(destroyMethod = "close")
  public CloseableHttpClient aroHttpClient(
      @Value("${app.aro.http.connect-timeout-ms:10000}") int connectTimeoutMs,
      @Value("${app.aro.http.read-timeout-ms:45000}") int readTimeoutMs,
      @Value("${app.aro.http.pool.max-total:32}") int maxTotal,
      @Value("${app.aro.http.pool.max-per-route:16}") int maxPerRoute) {
    int connectMs = Math.max(1000, connectTimeoutMs);
    int readMs = Math.max(3000, readTimeoutMs);

    ConnectionConfig connectionConfig = ConnectionConfig.custom()
        .setConnectTimeout(Timeout.ofMilliseconds(connectMs))
        .setSocketTimeout(Timeout.ofMilliseconds(readMs))
        .setTimeToLive(TimeValue.ofMinutes(5))
        .build();

    PoolingHttpClientConnectionManager connectionManager = new PoolingHttpClientConnectionManager();
    connectionManager.setMaxTotal(Math.max(8, maxTotal));
    connectionManager.setDefaultMaxPerRoute(Math.max(4, maxPerRoute));
    connectionManager.setDefaultConnectionConfig(connectionConfig);

    RequestConfig requestConfig = RequestConfig.custom()
        .setConnectionRequestTimeout(Timeout.ofMilliseconds(connectMs))
        .setResponseTimeout(Timeout.ofMilliseconds(readMs))
        .build();

    return HttpClients.custom()
        .setConnectionManager(connectionManager)
        .setDefaultRequestConfig(requestConfig)
        .evictExpiredConnections()
        .evictIdleConnections(TimeValue.ofSeconds(60))
        .build();
  }

  @Bean("aroRestTemplate")
  public RestTemplate aroRestTemplate(CloseableHttpClient aroHttpClient) {
    HttpComponentsClientHttpRequestFactory factory = new HttpComponentsClientHttpRequestFactory(aroHttpClient);
    RestTemplate restTemplate = new RestTemplate(factory);
    restTemplate.setInterceptors(List.of((request, body, execution) -> {
      request.getHeaders().set(HttpHeaders.USER_AGENT, USER_AGENT);
      return execution.execute(request, body);
    }));
    return restTemplate;
  }
}

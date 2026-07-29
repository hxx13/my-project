package com.example.demo.modules.agv.service;

import com.example.demo.modules.agv.dto.AgvRobotStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * 调用 AGV 上位机 /agv/statusall 接口。
 * 单台不可达时返回 null（不抛异常），由采集线程处理。
 */
@Service
public class AgvProxyService {

    private static final Logger log = LoggerFactory.getLogger(AgvProxyService.class);

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public AgvProxyService(
            @Qualifier("agvRestTemplate") RestTemplate restTemplate,
            @Value("${app.agv.base-url:http://192.168.1.100:1234}") String baseUrl) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl;
    }

    /**
     * 查询单台 AGV 状态。失败返回 null。
     */
    public AgvRobotStatus fetchStatus(String robotIp) {
        String url = baseUrl + "/agv/statusall?ip=" + robotIp;
        try {
            AgvRobotStatus status = restTemplate.getForObject(url, AgvRobotStatus.class);
            if (status == null || status.getRetCode() != 0) {
                log.debug("AGV {} 返回空或 ret_code != 0: {}", robotIp,
                        status != null ? status.getRetCode() : "null");
                return null;
            }
            return status;
        } catch (RestClientException e) {
            log.debug("AGV {} 不可达: {}", robotIp, e.getMessage());
            return null;
        }
    }
}

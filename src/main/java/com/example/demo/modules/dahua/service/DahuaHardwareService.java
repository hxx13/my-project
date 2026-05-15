package com.example.demo.modules.dahua.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaHardwareService {

    private static final Logger log = LoggerFactory.getLogger(DahuaHardwareService.class);

    @Autowired
    private DahuaAuthService authService;

    /**
     * 与 {@link com.example.demo.modules.dahua.service.DahuaOpenApiService#isSuccess} 对齐的 BRM 调用成功判定。
     */
    static boolean isBrmSuccess(Map<String, Object> resp) {
        if (resp == null) {
            return false;
        }
        if (Boolean.TRUE.equals(resp.get("success"))) {
            return true;
        }
        Object code = resp.get("code");
        if (code == null) {
            return false;
        }
        String c = String.valueOf(code).trim();
        if ("0".equals(c) || "200".equals(c)) {
            return true;
        }
        if (code instanceof Number n && n.intValue() == 0) {
            return true;
        }
        return false;
    }

    /**
     * 🚀 物理人员冻结/解冻核心接口
     * @param dahuaPersonIds 大华人员主键 id（与 twin_card_mapping.dahua_seq 一致，JSON 用长整型避免溢出）
     * @param status 1：解冻， 2：冻结
     * @return true=成功, false=失败
     */
    public boolean setPersonStatus(List<Long> dahuaPersonIds, int status) {
        if (dahuaPersonIds == null || dahuaPersonIds.isEmpty()) {
            return true; // 空转保护
        }

        String token = authService.getValidToken();
        String url = authService.getBaseUrl() + "/evo-apigw/evo-brm/1.0.0/person/freeze";

        // 严格按照大华文档组装 Payload
        Map<String, Object> payload = new HashMap<>();
        payload.put("ids", dahuaPersonIds);
        payload.put("status", status);

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "bearer " + token);
        headers.setContentType(MediaType.APPLICATION_JSON);

        try {
            log.info("[dahua-hw] 下发门禁人员状态 ids={} {}", dahuaPersonIds, status == 1 ? "解冻" : "冻结");
            @SuppressWarnings("unchecked")
            Map<String, Object> response = authService.getRestTemplate().postForObject(
                    url, new HttpEntity<>(payload, headers), Map.class
            );

            if (isBrmSuccess(response)) {
                log.info("[dahua-hw] 大华已确认 personFreeze");
                return true;
            }
            log.warn("[dahua-hw] 大华拒绝 personFreeze code={} errMsg={} body={}",
                    response != null ? response.get("code") : null,
                    response != null ? response.get("errMsg") : null,
                    response);
            return false;
        } catch (Exception e) {
            log.warn("[dahua-hw] 请求异常 err={}", e.getMessage(), e);
            // 如果报 401 权限错误，触发 Token 强制刷新，防止卡死
            if (e.getMessage() != null && e.getMessage().contains("401")) {
                authService.forceRefreshToken();
            }
            return false;
        }
    }
}
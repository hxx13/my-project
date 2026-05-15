package com.example.demo.modules.dahua.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class DahuaOpenApiService {
    private static final Logger log = LoggerFactory.getLogger(DahuaOpenApiService.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final DahuaAuthService authService;

    public DahuaOpenApiService(DahuaAuthService authService) {
        this.authService = authService;
    }

    public List<Map<String, Object>> fetchAllDepartments() {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        int totalPage = 1;
        while (pageNum <= totalPage) {
            Map<String, Object> body = new HashMap<>();
            body.put("pageNum", pageNum);
            body.put("pageSize", 200);
            Map<String, Object> resp = post("/evo-apigw/evo-brm/1.2.0/department/page", body);
            Map<String, Object> data = asMap(resp.get("data"));
            totalPage = parseInt(data.get("totalPage"), totalPage);
            all.addAll(asListOfMap(data.get("pageData")));
            pageNum++;
        }
        return all;
    }

    public List<Map<String, Object>> fetchAllDoorGroups() {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        int totalPage = 1;
        while (pageNum <= totalPage) {
            Map<String, Object> body = new HashMap<>();
            body.put("pageNum", pageNum);
            body.put("pageSize", 200);
            Map<String, Object> resp = post("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/doorGroup/bycondition/combined", body);
            Map<String, Object> data = asMap(resp.get("data"));
            totalPage = parseInt(data.get("totalPage"), totalPage);
            all.addAll(asListOfMap(data.get("pageData")));
            pageNum++;
        }
        return all;
    }

    /**
     * 分页拉取设备通道列表（设备大类 + 设备小类过滤见文档）。
     * pageSize 最大 1000。
     */
    public List<Map<String, Object>> fetchAllDeviceChannels(int deviceCategory, int deviceType) {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        int totalPage = 1;
        while (pageNum <= totalPage) {
            Map<String, Object> body = new HashMap<>();
            body.put("pageNum", pageNum);
            body.put("pageSize", 1000);
            body.put("sort", "channelSn");
            body.put("sortType", "ASC");
            body.put("deviceCategory", deviceCategory);
            body.put("deviceType", deviceType);
            body.put("includeSubOwnerCodeFlag", true);
            Map<String, Object> resp = post("/evo-apigw/evo-brm/1.2.0/device/channel/subsystem/page", body);
            Map<String, Object> data = asMap(resp.get("data"));
            totalPage = parseInt(data.get("totalPage"), totalPage);
            List<Map<String, Object>> pageData = asListOfMap(data.get("pageData"));
            all.addAll(pageData);
            if (pageData.isEmpty()) {
                break;
            }
            pageNum++;
        }
        return all;
    }

    public Long generatePersonId() {
        Map<String, Object> resp = get("/evo-apigw/evo-brm/1.0.0/person/generate-id");
        Map<String, Object> data = asMap(resp.get("data"));
        return parseLong(data.get("id"));
    }

    public Map<String, Object> addPerson(Map<String, Object> body) {
        return post("/evo-apigw/evo-brm/1.2.0/person/subsystem/add", body);
    }

    public Map<String, Object> batchAuthority(Map<String, Object> body) {
        return post("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/batchAuthority", body);
    }

    /**
     * 大华门禁刷卡记录分页查询（接口不保证总页数/总行数可用，调用方需自行按 pageData 为空停止）。
     */
    public Map<String, Object> fetchSwingCardRecordByConditionCombined(Map<String, Object> body) {
        if (body == null) {
            body = new HashMap<>();
        }
        Object pageNum = body.get("pageNum");
        Object pageSize = body.get("pageSize");
        if (parseInt(pageNum, 0) <= 0) {
            throw new IllegalArgumentException("pageNum 必须为正整数");
        }
        if (parseInt(pageSize, 0) <= 0) {
            throw new IllegalArgumentException("pageSize 必须为正整数");
        }
        Object startSwingTime = body.get("startSwingTime");
        Object endSwingTime = body.get("endSwingTime");
        if (startSwingTime == null || String.valueOf(startSwingTime).isBlank()) {
            throw new IllegalArgumentException("startSwingTime 不能为空");
        }
        if (endSwingTime == null || String.valueOf(endSwingTime).isBlank()) {
            throw new IllegalArgumentException("endSwingTime 不能为空");
        }
        Map<String, Object> resp = post(
                "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/swingCardRecord/bycondition/combined",
                body
        );
        Map<String, Object> data = asMap(resp.get("data"));
        if (!data.containsKey("pageData")) {
            data.put("pageData", new ArrayList<>());
        }
        resp.put("data", data);
        return resp;
    }

    public Map<String, Object> deleteSinglePrivilege(Map<String, Object> body) {
        return post("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/personAuthority/deleteSinglePrivilege", body);
    }

    public Map<String, Object> activateCard(Map<String, Object> body) {
        return exchange("/evo-apigw/evo-brm/1.0.0/card/active", HttpMethod.PUT, body);
    }

    public Map<String, Object> controlDoor(String mode, List<String> channelCodeList) {
        if (channelCodeList == null || channelCodeList.isEmpty()) {
            throw new IllegalArgumentException("channelCodeList 不能为空");
        }
        String path = switch (String.valueOf(mode).toUpperCase()) {
            case "OPEN" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/openDoor";
            case "CLOSE" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/closeDoor";
            case "STAY_OPEN" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/stayOpen";
            case "STAY_CLOSE" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/stayClose";
            case "NORMAL" -> "/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/normal";
            default -> throw new IllegalArgumentException("不支持的门禁控制模式: " + mode);
        };
        Map<String, Object> body = new HashMap<>();
        body.put("channelCodeList", channelCodeList);
        return postRaw(path, body);
    }

    public Map<String, Object> queryDoorStatus(String channelCode, List<String> channelCodes, Long doorGroupId) {
        Map<String, Object> body = new HashMap<>();
        if (channelCode != null && !channelCode.isBlank()) {
            body.put("channelCode", channelCode);
        } else if (channelCodes != null && !channelCodes.isEmpty()) {
            body.put("channelCodes", channelCodes);
        } else if (doorGroupId != null) {
            body.put("doorGroupId", doorGroupId);
        } else {
            throw new IllegalArgumentException("channelCode/channelCodes/doorGroupId 至少传一个");
        }
        body.put("allowSmartLock", false);
        return postRaw("/evo-apigw/evo-accesscontrol/1.0.0/card/accessControl/channelControl/channels", body);
    }

    public static String formatDateTime(LocalDateTime dateTime) {
        return dateTime.format(DT);
    }

    public static int parseInt(Object value, int defaultValue) {
        if (value == null) return defaultValue;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return defaultValue;
        }
    }

    public static Long parseLong(Object value) {
        if (value == null) return null;
        if (value instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    public static Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> m) {
            Map<String, Object> out = new HashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                out.put(String.valueOf(e.getKey()), e.getValue());
            }
            return out;
        }
        return new HashMap<>();
    }

    public static List<Map<String, Object>> asListOfMap(Object value) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object it : list) {
                out.add(asMap(it));
            }
        }
        return out;
    }

    private Map<String, Object> get(String path) {
        return exchange(path, HttpMethod.GET, null);
    }

    private Map<String, Object> post(String path, Map<String, Object> body) {
        return exchange(path, HttpMethod.POST, body);
    }

    public Map<String, Object> postRaw(String path, Map<String, Object> body) {
        return rawExchange(path, HttpMethod.POST, body);
    }

    public Map<String, Object> putRaw(String path, Map<String, Object> body) {
        return rawExchange(path, HttpMethod.PUT, body);
    }

    public Map<String, Object> getRaw(String path) {
        return rawExchange(path, HttpMethod.GET, null);
    }

    public boolean isSuccess(Map<String, Object> resp) {
        if (resp == null) return false;
        Object success = resp.get("success");
        String code = String.valueOf(resp.getOrDefault("code", ""));
        return Boolean.TRUE.equals(success) || "0".equals(code);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> exchange(String path, HttpMethod method, Map<String, Object> body) {
        Map<String, Object> resp = rawExchange(path, method, body);
        assertSuccess(resp, path);
        return resp;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> rawExchange(String path, HttpMethod method, Map<String, Object> body) {
        boolean retried = false;
        while (true) {
            String url = authService.getBaseUrl() + path;
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + authService.getValidToken());
            headers.setContentType(MediaType.APPLICATION_JSON);
            try {
                Object payload = body == null ? null : body;
                Map<String, Object> resp = authService.getRestTemplate()
                        .exchange(url, method, new HttpEntity<>(payload, headers), Map.class)
                        .getBody();
                if (!retried && isTokenInvalidResp(resp)) {
                    retried = true;
                    authService.forceRefreshToken();
                    continue;
                }
                return resp;
            } catch (HttpStatusCodeException ex) {
                if (!retried && ex.getStatusCode().value() == 401) {
                    retried = true;
                    authService.forceRefreshToken();
                    continue;
                }
                String msg = "调用大华接口失败: " + path + ", " + ex.getMessage();
                log.error("[dahua-openapi] {}", msg);
                throw new RuntimeException(msg, ex);
            } catch (Exception ex) {
                String msg = "调用大华接口失败: " + path + ", " + ex.getMessage();
                log.error("[dahua-openapi] {}", msg);
                throw new RuntimeException(msg, ex);
            }
        }
    }

    private boolean isTokenInvalidResp(Map<String, Object> resp) {
        if (resp == null) {
            return false;
        }
        String code = String.valueOf(resp.getOrDefault("code", ""));
        String errMsg = String.valueOf(resp.getOrDefault("errMsg", ""));
        return "27001007".equals(code) || errMsg.toLowerCase().contains("invalid access_token");
    }

    private void assertSuccess(Map<String, Object> resp, String path) {
        if (resp == null) {
            throw new RuntimeException("大华接口返回为空: " + path);
        }
        Object success = resp.get("success");
        String code = String.valueOf(resp.getOrDefault("code", ""));
        if (Boolean.TRUE.equals(success) || "0".equals(code)) {
            return;
        }
        String errMsg = String.valueOf(resp.getOrDefault("errMsg", "unknown error"));
        throw new RuntimeException("大华接口失败(" + path + "), code=" + code + ", errMsg=" + errMsg);
    }
}

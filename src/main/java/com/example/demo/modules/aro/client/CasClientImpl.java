package com.example.demo.modules.aro.client;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.dto.CasUserInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * CAS 协议客户端实现。
 * <p>
 * 使用 casRestTemplate（禁用 302 跟随）处理 CAS 认证流程，
 * 使用 aroRestTemplate 调用 ARO 业务 API。
 */
@Service
public class CasClientImpl implements CasClient {

    private static final Logger log = LoggerFactory.getLogger(CasClientImpl.class);

    private static final String ARO_LOGIN_AUTH_URL = "https://aro.shsmu.edu.cn/jtu/api/loginAuth";
    private static final String CAS_SERVICE_VALIDATE_URL = "https://auth2.shsmu.edu.cn/cas/serviceValidate";
    private static final String CAS_LOGIN_URL = "https://auth2.shsmu.edu.cn/cas/login";
    private static final String CAS_LOGOUT_URL = "https://auth2.shsmu.edu.cn/cas/logout";

    private final RestTemplate aroRestTemplate;
    private final RestTemplate casRestTemplate;

    public CasClientImpl(
            @Qualifier("aroRestTemplate") RestTemplate aroRestTemplate,
            @Qualifier("casRestTemplate") RestTemplate casRestTemplate) {
        this.aroRestTemplate = aroRestTemplate;
        this.casRestTemplate = casRestTemplate;
    }

    @Override
    public CasTokenInfo parseToken(String aroJwt) {
        if (aroJwt == null || aroJwt.isBlank()) {
            log.error("[CAS] parseToken: token 为空");
            return null;
        }

        JSONObject payload = parseJwtPayload(aroJwt);
        if (payload == null) {
            log.error("[CAS] parseToken: JWT payload 解析失败");
            return null;
        }

        CasTokenInfo info = new CasTokenInfo();
        info.setToken(aroJwt);
        info.setAccount(payload.getString("account"));
        info.setAroUserId(toString(payload, "userId"));
        info.setUserKey(payload.getString("userKey"));
        info.setRoleNames(payload.getString("roleNames"));
        Long exp = payload.getLong("exp");
        info.setExp(exp != null ? exp : 0);

        log.info("[CAS] parseToken 成功: account={}, userId={}, userKey={}",
                info.getAccount(), info.getAroUserId(), info.getUserKey());
        return info;
    }

    /**
     * 将 JSON 中的数字/字符串字段统一转为字符串（userId 在 JWT 中可能是数字）。
     */
    private String toString(JSONObject payload, String key) {
        Object val = payload.get(key);
        if (val == null) return null;
        return val.toString();
    }

    @Override
    public CasTokenInfo refreshToken(String oldToken) {
        if (oldToken == null || oldToken.isBlank()) {
            log.error("[CAS] refreshToken: oldToken 为空");
            return null;
        }

        String url = ARO_LOGIN_AUTH_URL + "?loginAuthType=CAS";
        log.info("[CAS] 正在使用旧 Token 换取新 Token...");

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.ACCEPT, "application/json");
            headers.set(HttpHeaders.REFERER, "https://aro.shsmu.edu.cn/");
            headers.set("token", oldToken);
            HttpEntity<String> entity = new HttpEntity<>(headers);

            ResponseEntity<Map> response = aroRestTemplate.exchange(url, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
                log.error("[CAS] refreshToken 返回异常: status={}", response.getStatusCode());
                return null;
            }

            Object dataObj = response.getBody().get("data");
            if (!(dataObj instanceof Map<?, ?> dataMap)) {
                log.error("[CAS] refreshToken 返回体缺少 data 字段");
                return null;
            }

            Object tokenObj = dataMap.get("token");
            if (!(tokenObj instanceof String token) || token.isBlank()) {
                log.error("[CAS] refreshToken 返回体缺少 token");
                return null;
            }

            CasTokenInfo info = buildTokenInfo(token);
            log.info("[CAS] refreshToken 成功: account={}", info != null ? info.getAccount() : "?");
            return info;
        } catch (Exception e) {
            log.error("[CAS] refreshToken 调用失败", e);
            return null;
        }
    }

    @Override
    public CasTokenInfo getTokenBySession(String jsessionid) {
        if (jsessionid == null || jsessionid.isBlank()) {
            log.error("[CAS] getTokenBySession: JSESSIONID 为空");
            return null;
        }

        String url = ARO_LOGIN_AUTH_URL + "?loginAuthType=CAS";
        log.info("[CAS] 正在通过已有会话获取 ARO Token...");

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.ACCEPT, "application/json");
            headers.set(HttpHeaders.REFERER, "https://aro.shsmu.edu.cn/");
            headers.set(HttpHeaders.COOKIE, "JSESSIONID=" + jsessionid);
            HttpEntity<String> entity = new HttpEntity<>(headers);

            ResponseEntity<Map> response = aroRestTemplate.exchange(url, HttpMethod.GET, entity, Map.class);

            if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
                log.error("[CAS] getTokenBySession 返回异常: status={}", response.getStatusCode());
                return null;
            }

            Object dataObj = response.getBody().get("data");
            // ARO 可能在未认证时返回 CAS 重定向 URL 而不是 token 对象
            if (dataObj instanceof String redirectUrl) {
                log.warn("[CAS] getTokenBySession 返回了 CAS 重定向 URL（session 可能已过期）: {}", redirectUrl);
                return null;
            }
            if (!(dataObj instanceof Map<?, ?> dataMap)) {
                log.error("[CAS] getTokenBySession 返回体缺少 data 字段");
                return null;
            }

            Object tokenObj = dataMap.get("token");
            if (!(tokenObj instanceof String token) || token.isBlank()) {
                log.error("[CAS] getTokenBySession 返回体缺少 token");
                return null;
            }

            return buildTokenInfo(token);
        } catch (Exception e) {
            log.error("[CAS] getTokenBySession 调用失败", e);
            return null;
        }
    }

    /** 从 JWT 字符串构建 CasTokenInfo，复用解析逻辑 */
    private CasTokenInfo buildTokenInfo(String token) {
        JSONObject payload = parseJwtPayload(token);
        if (payload == null) return null;

        CasTokenInfo info = new CasTokenInfo();
        info.setToken(token);
        info.setAccount(payload.getString("account"));
        info.setAroUserId(toString(payload, "userId"));
        info.setUserKey(payload.getString("userKey"));
        info.setRoleNames(payload.getString("roleNames"));
        Long exp = payload.getLong("exp");
        info.setExp(exp != null ? exp : 0);

        log.info("[CAS] Token 解析成功: account={}, userId={}, userKey={}",
                info.getAccount(), info.getAroUserId(), info.getUserKey());
        return info;
    }

    @Override
    public CasTokenInfo loginWithCredentials(String account, String password) {
        if (account == null || account.isBlank() || password == null || password.isBlank()) {
            log.error("[CAS] loginWithCredentials: account/password 为空");
            return null;
        }

        String url = "https://aro.shsmu.edu.cn/jtu/api/login";
        log.info("[CAS] 正在用账号密码登录: account={}", account);

        try {
            Map<String, String> body = new java.util.HashMap<>();
            body.put("account", account);
            body.put("password", password);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = aroRestTemplate.postForEntity(url, request, Map.class);

            if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
                log.error("[CAS] loginWithCredentials 返回异常: status={}", response.getStatusCode());
                return null;
            }

            Object dataObj = response.getBody().get("data");
            if (!(dataObj instanceof Map<?, ?> dataMap)) {
                log.error("[CAS] loginWithCredentials 返回体缺少 data 字段");
                return null;
            }

            Object tokenObj = dataMap.get("token");
            if (!(tokenObj instanceof String token) || token.isBlank()) {
                log.error("[CAS] loginWithCredentials 返回体缺少 token");
                return null;
            }

            CasTokenInfo info = buildTokenInfo(token);
            log.info("[CAS] loginWithCredentials 成功: account={}", info != null ? info.getAccount() : "?");
            return info;
        } catch (Exception e) {
            log.error("[CAS] loginWithCredentials 失败: account={}, error={}", account, e.getMessage());
            return null;
        }
    }

    @Override
    @Deprecated
    public CasTokenInfo exchangeTicket(String ticket) {
        String url = ARO_LOGIN_AUTH_URL + "?ticket=" + URLEncoder.encode(ticket, StandardCharsets.UTF_8);
        log.info("[CAS] 正在用 ticket 换取 ARO JWT Token...");

        ResponseEntity<Map> response = aroRestTemplate.getForEntity(url, Map.class);

        if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
            log.error("[CAS] loginAuth 返回异常: status={}", response.getStatusCode());
            return null;
        }

        Object dataObj = response.getBody().get("data");
        if (!(dataObj instanceof Map<?, ?> dataMap)) {
            log.error("[CAS] loginAuth 返回体缺少 data 字段");
            return null;
        }

        Object tokenObj = dataMap.get("token");
        if (!(tokenObj instanceof String token) || token.isBlank()) {
            log.error("[CAS] loginAuth 返回体缺少 token");
            return null;
        }

        return buildTokenInfo(token);
    }

    @Override
    public CasUserInfo validateTicket(String ticket, String serviceUrl) {
        String url = CAS_SERVICE_VALIDATE_URL + "?service=" + URLEncoder.encode(serviceUrl, StandardCharsets.UTF_8)
                + "&ticket=" + URLEncoder.encode(ticket, StandardCharsets.UTF_8);
        log.info("[CAS] 正在验证 ticket: service={}", serviceUrl);

        try {
            java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                    .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
                    .build();
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .GET()
                    .build();
            java.net.http.HttpResponse<String> response = client.send(request,
                    java.net.http.HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

            if (response.statusCode() != 200 || response.body() == null) {
                log.error("[CAS] serviceValidate 返回异常: status={}", response.statusCode());
                return null;
            }

            String xmlBody = response.body();
            log.debug("[CAS] serviceValidate 响应: {}", xmlBody);
            return parseCasXml(xmlBody);
        } catch (Exception e) {
            log.error("[CAS] serviceValidate 调用失败", e);
            return null;
        }
    }

    @Override
    public String getServiceTicket(String tgc, String serviceUrl) {
        String url = CAS_LOGIN_URL + "?service=" + URLEncoder.encode(serviceUrl, StandardCharsets.UTF_8);
        log.info("[CAS] 正在用 TGC 获取 service ticket...");

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.COOKIE, "CASTGC=" + tgc);
        HttpEntity<String> entity = new HttpEntity<>(headers);

        try {
            // casRestTemplate 不跟随 302，所以 302 会作为正常响应返回
            ResponseEntity<String> response = casRestTemplate.exchange(url, HttpMethod.GET, entity, String.class);

            // 如果返回 302，从 Location 头提取 ticket
            if (response.getStatusCode() == HttpStatus.FOUND || response.getStatusCode().is3xxRedirection()) {
                java.net.URI location = response.getHeaders().getLocation();
                if (location != null) {
                    String ticket = extractTicketFromUrl(location.toString());
                    if (ticket != null) {
                        log.info("[CAS] 成功获取 service ticket: {}", ticket);
                        return ticket;
                    }
                }
            }

            log.warn("[CAS] 未从 TGC 获取到 ticket，status={}", response.getStatusCode());
            return null;
        } catch (HttpClientErrorException e) {
            // casRestTemplate 不跟随 302 时，某些 Spring 版本可能把 3xx 当错误抛
            if (e.getStatusCode().is3xxRedirection()) {
                java.net.URI location = e.getResponseHeaders().getLocation();
                if (location != null) {
                    String ticket = extractTicketFromUrl(location.toString());
                    if (ticket != null) {
                        log.info("[CAS] 成功获取 service ticket (via exception): {}", ticket);
                        return ticket;
                    }
                }
            }
            log.error("[CAS] 获取 service ticket 失败: status={}", e.getStatusCode());
            return null;
        }
    }

    @Override
    public void logout() {
        try {
            casRestTemplate.getForEntity(CAS_LOGOUT_URL, String.class);
            log.info("[CAS] 登出完成");
        } catch (Exception e) {
            log.warn("[CAS] 登出请求异常（已忽略）: {}", e.getMessage());
        }
    }

    // ==================== 内部工具方法 ====================

    /**
     * 手动解析 JWT payload（base64 decode 中间段），不验证签名。
     */
    private JSONObject parseJwtPayload(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) {
                return null;
            }
            // Base64url decode: 补齐 padding，替换 URL-safe 字符
            String payload = parts[1];
            payload = payload.replace('-', '+').replace('_', '/');
            while (payload.length() % 4 != 0) {
                payload += "=";
            }
            byte[] decoded = Base64.getDecoder().decode(payload);
            String json = new String(decoded, StandardCharsets.UTF_8);
            return JSON.parseObject(json);
        } catch (Exception e) {
            log.error("[CAS] JWT payload 解析失败", e);
            return null;
        }
    }

    /**
     * 解析 CAS serviceValidate 返回的 XML。
     */
    private CasUserInfo parseCasXml(String xmlBody) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setNamespaceAware(true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new ByteArrayInputStream(xmlBody.getBytes(StandardCharsets.UTF_8)));

            // 检查是否认证成功
            NodeList successNodes = doc.getElementsByTagNameNS("*", "authenticationSuccess");
            if (successNodes.getLength() == 0) {
                log.warn("[CAS] serviceValidate 未返回 authenticationSuccess");
                return null;
            }

            CasUserInfo info = new CasUserInfo();
            info.setUser(getCasXmlValue(doc, "user"));
            info.setUsername(getCasXmlValue(doc, "username"));
            info.setAccount(getCasXmlValue(doc, "account"));
            info.setId(getCasXmlValue(doc, "id"));
            info.setEmail(getCasXmlValue(doc, "email"));
            info.setPhone(getCasXmlValue(doc, "phone"));
            info.setSex(getCasXmlValue(doc, "sex"));
            info.setUsertype(getCasXmlValue(doc, "usertype"));
            info.setEduid(getCasXmlValue(doc, "eduid"));

            log.info("[CAS] XML 解析成功: user={}, username={}", info.getUser(), info.getUsername());
            return info;
        } catch (Exception e) {
            log.error("[CAS] XML 解析失败", e);
            return null;
        }
    }

    private String getCasXmlValue(Document doc, String tagName) {
        NodeList nodes = doc.getElementsByTagNameNS("*", tagName);
        if (nodes.getLength() > 0) {
            Element element = (Element) nodes.item(0);
            return element.getTextContent();
        }
        return null;
    }

    /**
     * 从 URL 中提取 ST-xxx ticket。
     */
    private String extractTicketFromUrl(String url) {
        if (url == null) return null;
        // ticket 参数值通常是 ST-xxx
        int idx = url.indexOf("ticket=");
        if (idx < 0) return null;
        String ticketPart = url.substring(idx + "ticket=".length());
        // 截取到下一个 & 或结束
        int endIdx = ticketPart.indexOf('&');
        if (endIdx > 0) {
            ticketPart = ticketPart.substring(0, endIdx);
        }
        return ticketPart;
    }
}

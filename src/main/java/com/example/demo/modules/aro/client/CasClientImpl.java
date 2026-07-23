package com.example.demo.modules.aro.client;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.example.demo.modules.aro.dto.CasLoginSession;
import com.example.demo.modules.aro.dto.CasTokenInfo;
import com.example.demo.modules.aro.dto.CasUserInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

        // 解析 JWT payload（不验证签名，ARO 的 JWT 用自己的密钥签名）
        JSONObject payload = parseJwtPayload(token);
        if (payload == null) {
            log.error("[CAS] 解析 JWT payload 失败");
            return null;
        }

        CasTokenInfo info = new CasTokenInfo();
        info.setToken(token);
        info.setAccount(payload.getString("account"));
        info.setAroUserId(payload.getString("userId"));
        info.setUserKey(payload.getString("userKey"));
        info.setRoleNames(payload.getString("roleNames"));
        Long exp = payload.getLong("exp");
        info.setExp(exp != null ? exp : 0);

        log.info("[CAS] JWT 解析成功: account={}, userId={}, userKey={}",
                info.getAccount(), info.getAroUserId(), info.getUserKey());
        return info;
    }

    @Override
    public CasUserInfo validateTicket(String ticket, String serviceUrl) {
        String url = CAS_SERVICE_VALIDATE_URL + "?service=" + URLEncoder.encode(serviceUrl, StandardCharsets.UTF_8)
                + "&ticket=" + URLEncoder.encode(ticket, StandardCharsets.UTF_8);
        log.info("[CAS] 正在验证 ticket: service={}", serviceUrl);

        ResponseEntity<String> response = casRestTemplate.getForEntity(url, String.class);

        if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
            log.error("[CAS] serviceValidate 返回异常: status={}", response.getStatusCode());
            return null;
        }

        String xmlBody = response.getBody();
        log.debug("[CAS] serviceValidate 响应: {}", xmlBody);

        return parseCasXml(xmlBody);
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

    // ==================== CASTGC 获取（代理 CAS 登录） ====================

    private static final String CAS_BASE = "https://auth2.shsmu.edu.cn";
    private static final String CAS_LOGIN_PAGE = CAS_BASE + "/cas/login";
    private static final String CAS_CAPTCHA = CAS_BASE + "/cas/captcha.jpg";

    @Override
    public CasLoginSession fetchLoginSession() {
        try {
            ResponseEntity<String> resp = casRestTemplate.getForEntity(CAS_LOGIN_PAGE, String.class);
            String html = resp.getBody();
            if (html == null) throw new RuntimeException("CAS 登录页返回空");

            CasLoginSession session = new CasLoginSession();

            // Extract JSESSIONID from Set-Cookie
            String setCookie = resp.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
            if (setCookie != null) {
                String jsession = extractCookieValue(setCookie, "JSESSIONID");
                if (jsession != null) session.setJsessionId(jsession);
            }

            // Extract execution from hidden input
            session.setExecution(extractHiddenField(html, "execution"));
            session.setLt(extractHiddenField(html, "lt"));
            session.setEventId(extractHiddenField(html, "_eventId"));

            log.info("[CAS] 获取登录页成功, execution={}", session.getExecution());
            return session;
        } catch (Exception e) {
            log.error("[CAS] 获取登录页失败", e);
            throw new RuntimeException("无法连接 CAS 服务器", e);
        }
    }

    @Override
    public byte[] fetchCaptcha(CasLoginSession session) {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (session.getJsessionId() != null) {
                headers.set(HttpHeaders.COOKIE, "JSESSIONID=" + session.getJsessionId());
            }
            HttpEntity<String> entity = new HttpEntity<>(headers);
            ResponseEntity<byte[]> resp = casRestTemplate.exchange(CAS_CAPTCHA, HttpMethod.GET, entity, byte[].class);
            return resp.getBody();
        } catch (Exception e) {
            log.error("[CAS] 获取验证码失败", e);
            throw new RuntimeException("获取 CAS 验证码失败", e);
        }
    }

    @Override
    public String submitLogin(CasLoginSession session, String username, String password,
                              String captcha, String service) throws CasLoginException {
        try {
            // Build form body
            StringBuilder body = new StringBuilder();
            appendParam(body, "username", username);
            appendParam(body, "password", password);
            appendParam(body, "captcha", captcha);
            if (session.getExecution() != null) appendParam(body, "execution", session.getExecution());
            if (session.getLt() != null) appendParam(body, "lt", session.getLt());
            appendParam(body, "_eventId", session.getEventId() != null ? session.getEventId() : "submit");

            String loginUrl = CAS_LOGIN_PAGE;
            if (service != null && !service.isBlank()) {
                loginUrl += "?service=" + URLEncoder.encode(service, StandardCharsets.UTF_8);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            if (session.getJsessionId() != null) {
                headers.set(HttpHeaders.COOKIE, "JSESSIONID=" + session.getJsessionId());
            }
            HttpEntity<String> entity = new HttpEntity<>(body.toString(), headers);

            // Must NOT follow redirect — need to capture Set-Cookie from 302
            ResponseEntity<String> resp = casRestTemplate.exchange(loginUrl, HttpMethod.POST, entity, String.class);

            // CAS login success → 302 redirect with Set-Cookie: CASTGC=TGT-xxx
            if (resp.getStatusCode().is3xxRedirection()) {
                String setCookie = resp.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
                if (setCookie != null) {
                    String tgc = extractCookieValue(setCookie, "CASTGC");
                    if (tgc != null) {
                        log.info("[CAS] 成功获取 CASTGC");
                        return tgc;
                    }
                }
                // Some CAS versions set CASTGC on the page response, not just redirect
                log.warn("[CAS] 302 重定向但未包含 CASTGC Cookie");
            }

            // Check if response body indicates error
            String body2 = resp.getBody();
            if (body2 != null) {
                if (body2.contains("验证码")) throw new CasLoginException("验证码输入有误");
                if (body2.contains("密码") || body2.contains("凭据")) throw new CasLoginException("账号或密码错误");
                if (body2.contains("锁定") || body2.contains("locked")) throw new CasLoginException("账号已锁定，请稍后重试");
            }
            throw new CasLoginException("CAS 登录失败，请重试");
        } catch (CasLoginException e) {
            throw e;
        } catch (Exception e) {
            log.error("[CAS] 提交登录失败", e);
            throw new CasLoginException("CAS 登录失败: " + e.getMessage(), e);
        }
    }

    private void appendParam(StringBuilder sb, String key, String value) {
        if (value == null) return;
        if (sb.length() > 0) sb.append("&");
        sb.append(URLEncoder.encode(key, StandardCharsets.UTF_8))
          .append("=")
          .append(URLEncoder.encode(value, StandardCharsets.UTF_8));
    }

    private static String extractCookieValue(String setCookie, String cookieName) {
        if (setCookie == null) return null;
        for (String part : setCookie.split(";")) {
            String trimmed = part.trim();
            if (trimmed.startsWith(cookieName + "=")) {
                return trimmed.substring(cookieName.length() + 1);
            }
        }
        return null;
    }

    private static String extractHiddenField(String html, String fieldName) {
        if (html == null) return null;
        // Match: <input type="hidden" name="execution" value="xxx"/>
        java.util.regex.Pattern p = java.util.regex.Pattern.compile(
            "<input[^>]+name=[\"']" + java.util.regex.Pattern.quote(fieldName)
            + "[\"'][^>]+value=[\"']([^\"']*)[\"']",
            java.util.regex.Pattern.CASE_INSENSITIVE
        );
        java.util.regex.Matcher m = p.matcher(html);
        return m.find() ? m.group(1) : null;
    }
}

package com.example.demo.modules.auth.iam;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * 上海交大医学院 IAM OAuth2 v3 客户端（换票 / userInfo / 必要时 OIDC uid）。
 * 与 CAS 客户端完全独立，勿混用。
 */
@Component
public class IamOAuthClient {

    private static final Logger log = LoggerFactory.getLogger(IamOAuthClient.class);

    private final IamOAuthProperties properties;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public IamOAuthClient(IamOAuthProperties properties, RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.properties = properties;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    public String buildAuthorizeUrl(String state, String redirectUri) {
        return UriComponentsBuilder
                .fromHttpUrl(properties.authorizeUrl())
                .queryParam("response_type", "code")
                .queryParam("client_id", properties.getClientId())
                .queryParam("redirect_uri", redirectUri)
                .queryParam("state", state)
                .encode()
                .build()
                .toUriString();
    }

    public IamOAuthTokenResponse exchangeCodeForToken(String code) {
        if (!StringUtils.hasText(properties.getClientSecret())) {
            throw new IamOAuthException("IAM client-secret 未配置（请设置环境变量 IAM_CLIENT_SECRET）");
        }
        String url = UriComponentsBuilder
                .fromHttpUrl(properties.tokenUrl())
                .queryParam("grant_type", "authorization_code")
                .queryParam("code", code)
                .encode()
                .build()
                .toUriString();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        headers.set(HttpHeaders.AUTHORIZATION, basicAuthHeader());

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.POST, new HttpEntity<>(headers), String.class);
            IamOAuthTokenResponse token = objectMapper.readValue(
                    response.getBody() == null ? "{}" : response.getBody(), IamOAuthTokenResponse.class);
            if (token == null || !StringUtils.hasText(token.getAccessToken())) {
                String err = token != null && StringUtils.hasText(token.getMsg())
                        ? token.getMsg() : "换取 access_token 失败";
                throw new IamOAuthException(err);
            }
            return token;
        } catch (IamOAuthException ex) {
            throw ex;
        } catch (RestClientException | java.io.IOException ex) {
            log.warn("[IAM-OAuth] exchangeCodeForToken failed: {}", ex.getMessage());
            throw new IamOAuthException("IAM 换票失败：" + ex.getMessage());
        }
    }

    public IamOAuthUserInfo fetchUserInfo(String accessToken) {
        JsonNode v3 = getJson(properties.userInfoUrl(), bearer(accessToken));
        if (v3 != null && v3.has("errcode") && !v3.path("errcode").asText("").isBlank()) {
            throw new IamOAuthException("获取用户信息失败：" + v3.path("msg").asText("access_token 无效"));
        }

        String userName = firstText(v3, "userName", "username", "loginName", "employeeNo", "spRoleList");
        if (userName == null && v3 != null && v3.has("spRoleList") && v3.get("spRoleList").isArray()
                && v3.get("spRoleList").size() > 0) {
            userName = v3.get("spRoleList").get(0).asText(null);
        }
        String jobNumber = firstText(v3, "employeeNo", "jobNumber", "job_number", "userName", "username");
        if (!StringUtils.hasText(jobNumber)) {
            jobNumber = userName;
        }

        String idpUid = firstText(v3, "uid", "id", "sub", "userId", "user_id");
        if (!StringUtils.hasText(idpUid)) {
            JsonNode oidc = getJson(properties.oidcUserInfoUrl(), bearer(accessToken));
            if (oidc != null) {
                idpUid = firstText(oidc, "uid", "sub", "id");
                if (!StringUtils.hasText(userName)) {
                    userName = firstText(oidc, "userName", "username", "preferred_username");
                }
                if (!StringUtils.hasText(jobNumber)) {
                    jobNumber = firstText(oidc, "employeeNo", "userName", "username");
                    if (!StringUtils.hasText(jobNumber)) {
                        jobNumber = userName;
                    }
                }
            }
        }

        // 仍无 uid：尝试从 id_token 解析（若换票返回了）— 由调用方可选传入；此处仅兜底用 jobNumber 不可作绑定主键
        if (!StringUtils.hasText(idpUid)) {
            throw new IamOAuthException("IAM 未返回稳定 uid/sub，请确认 OIDC/SSO 映射已开放 uid");
        }
        if (!StringUtils.hasText(jobNumber)) {
            throw new IamOAuthException("IAM 未返回工号类字段（userName/employeeNo）");
        }

        IamOAuthUserInfo info = new IamOAuthUserInfo();
        info.setIdpUid(idpUid.trim());
        info.setJobNumber(jobNumber.trim());
        info.setUserName(StringUtils.hasText(userName) ? userName.trim() : jobNumber.trim());
        return info;
    }

    /** 从 id_token JWT payload 取 uid/sub（不验签，仅作字段补充；正式验签可后续接 JWKS）。 */
    public String extractUidFromIdToken(String idToken) {
        if (!StringUtils.hasText(idToken)) {
            return null;
        }
        try {
            String[] parts = idToken.split("\\.");
            if (parts.length < 2) {
                return null;
            }
            String json = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            JsonNode payload = objectMapper.readTree(json);
            return firstText(payload, "uid", "sub");
        } catch (Exception ex) {
            log.debug("[IAM-OAuth] id_token parse skipped: {}", ex.getMessage());
            return null;
        }
    }

    public String buildGloRedirectUrl(String redirectToUrl) {
        return UriComponentsBuilder
                .fromHttpUrl(properties.gloUrl())
                .queryParam("clientId", properties.getClientId())
                .queryParam("redirectToLogin", "false")
                .queryParam("redirectToUrl", redirectToUrl)
                .encode()
                .build()
                .toUriString();
    }

    private String basicAuthHeader() {
        String raw = properties.getClientId() + ":" + properties.getClientSecret();
        return "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private HttpHeaders bearer(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        return headers;
    }

    private JsonNode getJson(String url, HttpHeaders headers) {
        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.GET, new HttpEntity<>(headers), String.class);
            String body = response.getBody();
            if (!StringUtils.hasText(body)) {
                return null;
            }
            return objectMapper.readTree(body);
        } catch (Exception ex) {
            log.warn("[IAM-OAuth] GET {} failed: {}", url, ex.getMessage());
            return null;
        }
    }

    private static String firstText(JsonNode node, String... keys) {
        if (node == null || keys == null) {
            return null;
        }
        for (String key : keys) {
            JsonNode child = node.get(key);
            if (child == null || child.isNull()) {
                continue;
            }
            if (child.isTextual() || child.isNumber()) {
                String v = child.asText();
                if (StringUtils.hasText(v)) {
                    return v.trim();
                }
            }
        }
        // 浅层扫描 attributesMap / data 常见嵌套
        for (String nest : new String[]{"attributesMap", "data", "user"}) {
            JsonNode nested = node.get(nest);
            if (nested != null && nested.isObject()) {
                String found = firstText(nested, keys);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }
}

package com.example.demo.modules.twin.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * 浏览器从公网 HTTP 页加载校内 HTTPS 头像会触发 Chrome Private Network Access；
 * 由服务端拉取后再同源下发给前端。
 */
@Service
public class PersonnelAvatarProxyService {

    private static final Logger log = LoggerFactory.getLogger(PersonnelAvatarProxyService.class);

    private static final int MAX_BYTES = 5 * 1024 * 1024;

    /** 逗号分隔，支持后缀匹配（如 shsmu.edu.cn 匹配子域）。 */
    @Value("${app.personnel-avatar-proxy.allowed-hosts:aro.shsmu.edu.cn}")
    private String allowedHostsCsv;

    /**
     * 路径含 /jtu_files/ 时强制使用该 HTTPS 主机拉取（避免库内 IP/错误域名与证书 CN 不一致）。
     */
    @Value("${app.personnel-avatar-proxy.canonical-file-host:aro.shsmu.edu.cn}")
    private String canonicalFileHost;

    /**
     * 仅头像出站：信任任意服务端证书并跳过主机名校验。仅在内网证书配置错误时临时开启，生产慎用。
     */
    @Value("${app.personnel-avatar-proxy.insecure-tls:false}")
    private boolean insecureTls;

    private HttpClient httpClient;

    @PostConstruct
    public void init() throws GeneralSecurityException {
        if (insecureTls) {
            log.warn("personnel-avatar-proxy.insecure-tls=true：全局放宽 HTTPS 主机名校验（仅建议在隔离环境短期使用）");
            HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);
            SSLContext sslContext = SSLContext.getInstance("TLS");
            TrustManager[] trustAll = new TrustManager[]{
                    new X509TrustManager() {
                        @Override
                        public void checkClientTrusted(X509Certificate[] chain, String authType) {
                        }

                        @Override
                        public void checkServerTrusted(X509Certificate[] chain, String authType) {
                        }

                        @Override
                        public X509Certificate[] getAcceptedIssuers() {
                            return new X509Certificate[0];
                        }
                    }
            };
            sslContext.init(null, trustAll, new SecureRandom());
            this.httpClient = HttpClient.newBuilder()
                    .sslContext(sslContext)
                    .connectTimeout(Duration.ofSeconds(15))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
        } else {
            this.httpClient = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(15))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
        }
    }

    public record ProxiedImage(byte[] bytes, String contentType) {}

    /** 与前端 personnelAvatarUrl.ts 中 URL-safe Base64 分段对应 */
    public static String decodeUrlFromPathSegment(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            return null;
        }
        try {
            byte[] bytes = Base64.getUrlDecoder().decode(encoded.trim());
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            log.warn("personnel-avatar path decode failed: {}", e.getMessage());
            return null;
        }
    }

    public ProxiedImage fetchAllowed(String rawUrl) throws IOException, InterruptedException {
        if (rawUrl == null || rawUrl.isBlank()) {
            return null;
        }
        String normalized = normalizeUrl(rawUrl.trim());
        URI uri;
        try {
            uri = URI.create(normalized);
        } catch (IllegalArgumentException e) {
            return null;
        }
        uri = applyCanonicalFileHost(uri);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            return null;
        }
        String host = uri.getHost();
        if (host == null || !isHostAllowed(host)) {
            log.warn("personnel-avatar host not allowed: {}", host);
            return null;
        }

        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(25))
                .header("User-Agent", "Mozilla/5.0 (compatible; TwinSystem-AvatarProxy/1.0)")
                .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
                .GET()
                .build();

        HttpResponse<byte[]> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofByteArray());
        int code = resp.statusCode();
        if (code < 200 || code >= 300) {
            log.warn("personnel-avatar upstream HTTP {} for {}", code, uri.getHost());
            return null;
        }
        byte[] body = resp.body();
        if (body == null || body.length == 0 || body.length > MAX_BYTES) {
            return null;
        }

        String ct = resp.headers().firstValue("Content-Type").orElse("");
        ct = ct.split(";")[0].trim();
        if (ct.isEmpty() || !ct.toLowerCase(Locale.ROOT).startsWith("image/")) {
            String guessed = guessContentType(uri.getPath());
            if (guessed == null) {
                return null;
            }
            ct = guessed;
        }
        return new ProxiedImage(body, ct);
    }

    private URI applyCanonicalFileHost(URI uri) {
        if (!StringUtils.hasText(canonicalFileHost)) {
            return uri;
        }
        String path = uri.getRawPath();
        if (path != null && path.contains("/jtu_files/")) {
            try {
                String query = uri.getRawQuery();
                StringBuilder sb = new StringBuilder("https://").append(canonicalFileHost).append(path);
                if (StringUtils.hasText(query)) {
                    sb.append('?').append(query);
                }
                return URI.create(sb.toString());
            } catch (IllegalArgumentException e) {
                log.warn("personnel-avatar canonical URI failed: {}", e.getMessage());
                return uri;
            }
        }
        return uri;
    }

    /** 修复库内偶发的双斜杠路径段，如 /jtu_files//2023/... */
    private static String normalizeUrl(String url) {
        return url.replace("/jtu_files//", "/jtu_files/");
    }

    private boolean isHostAllowed(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        for (String token : allowedHostsCsv.split(",")) {
            String t = token.trim().toLowerCase(Locale.ROOT);
            if (t.isEmpty()) {
                continue;
            }
            if (h.equals(t) || h.endsWith("." + t)) {
                return true;
            }
        }
        return false;
    }

    private static String guessContentType(String path) {
        if (path == null) {
            return null;
        }
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".png")) {
            return "image/png";
        }
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (p.endsWith(".gif")) {
            return "image/gif";
        }
        if (p.endsWith(".webp")) {
            return "image/webp";
        }
        if (p.endsWith(".bmp")) {
            return "image/bmp";
        }
        return null;
    }

    public static long cacheMaxAgeSeconds() {
        return TimeUnit.HOURS.toSeconds(1);
    }
}

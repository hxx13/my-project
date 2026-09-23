package com.example.demo.modules.personnel.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.DigestUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;

/**
 * 把 ARO 同步过来的远程头像落成本地文件，让 personnel.head 直接存本地地址。
 *
 * <p>为什么要有它：ARO 静态文件域的证书 CN 与文件域名对不上（还混着 http 的 IP 形态），
 * 浏览器直连会报证书错误，之前是靠后端同源代理每次都现场拉一遍。落成本地之后
 * 前端（Web / 小程序）拿到的就是本机地址，不需要代理、也不用每次回源。
 *
 * <p>落盘位置复用上传目录（app.upload.base-dir），读取走已有的 /api/upload/files/** 端点。
 * 文件名取远程地址的 md5 —— 同一个地址重复同步不会重复下载，也不会堆垃圾文件。
 *
 * <p>失败一律原样返回原来的地址：头像拉不到不能把整次人员同步带崩。
 */
@Service
public class PersonnelHeadLocalizer {

    private static final Logger log = LoggerFactory.getLogger(PersonnelHeadLocalizer.class);

    private static final String FILE_PREFIX = "/api/upload/files/";
    private static final String SUBDIR = "personnel-head";
    /** 只收图片后缀；拿不到就按 png 存（内容照样能显示） */
    private static final Set<String> OK_EXT = Set.of("png", "jpg", "jpeg", "webp", "gif");
    private static final int MAX_BYTES = 5 * 1024 * 1024;

    private final Path baseDir;
    private final HttpClient http;

    public PersonnelHeadLocalizer(@Value("${app.upload.base-dir:uploads}") String uploadBaseDir) {
        this.baseDir = Paths.get(uploadBaseDir).toAbsolutePath().normalize();
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /** 远程地址 → 本地地址。空值、已是本地路径、下载失败都原样返回。 */
    public String localize(String head) {
        if (head == null || head.isBlank()) return head;
        String url = head.trim();
        boolean remote = url.regionMatches(true, 0, "http://", 0, 7)
                || url.regionMatches(true, 0, "https://", 0, 8);
        if (!remote) return head;

        try {
            String fileName = DigestUtils.md5DigestAsHex(url.getBytes(StandardCharsets.UTF_8)) + "." + extOf(url);
            Path dir = baseDir.resolve(SUBDIR);
            Path target = dir.resolve(fileName).normalize();
            if (!target.startsWith(baseDir)) return head;
            if (Files.exists(target)) return FILE_PREFIX + SUBDIR + "/" + fileName;

            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("User-Agent", "twin-system-personnel-head")
                    .GET()
                    .build();
            HttpResponse<byte[]> resp = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() != 200) {
                log.warn("[personnel-head] 拉取失败 status={} url={}", resp.statusCode(), url);
                return head;
            }
            byte[] body = resp.body();
            if (body == null || body.length == 0) {
                log.warn("[personnel-head] 空响应 url={}", url);
                return head;
            }
            if (body.length > MAX_BYTES) {
                log.warn("[personnel-head] 超过 {} 字节，不落地 url={}", MAX_BYTES, url);
                return head;
            }
            Files.createDirectories(dir);
            Files.write(target, body);
            return FILE_PREFIX + SUBDIR + "/" + fileName;
        } catch (Exception e) {
            // 网络不通、URI 畸形、磁盘不可写……都只降级，不抛给同步流程
            log.warn("[personnel-head] 头像落地失败 url={} err={}", url, e.getMessage());
            return head;
        }
    }

    /** 从 URL 猜图片后缀；不在白名单里一律按 png 存（内容照样能显示）。包级可见以便单测。 */
    static String extOf(String url) {
        String path = url;
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        int dot = path.lastIndexOf('.');
        if (dot >= 0 && dot < path.length() - 1) {
            String e = path.substring(dot + 1).toLowerCase(Locale.ROOT);
            if (OK_EXT.contains(e)) return "jpeg".equals(e) ? "jpg" : e;
        }
        return "png";
    }
}

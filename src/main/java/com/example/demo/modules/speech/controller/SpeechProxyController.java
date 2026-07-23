package com.example.demo.modules.speech.controller;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * 语音合成代理 — 将前端请求转发到 CosyVoice 3 微服务。
 * <p>
 * 前端 → POST /api/v1/twin/speech/tts        → http://127.0.0.1:50000/v1/tts        (非流式 WAV)
 * 前端 → POST /api/v1/twin/speech/tts/stream → http://127.0.0.1:50000/v1/tts/stream (流式 PCM)
 * <p>
 * 极简透传，不解析业务逻辑。CosyVoice 不可用时静默返回 502。
 */
@RestController
@RequestMapping("/api/v1/twin/speech")
public class SpeechProxyController {

    private static final Logger log = LoggerFactory.getLogger(SpeechProxyController.class);

    @Value("${app.cosyvoice.base-url:http://127.0.0.1:50000}")
    private String cosyvoiceBaseUrl;

    /** 非流式合成 → 返回完整 WAV */
    @PostMapping("/tts")
    public ResponseEntity<byte[]> proxyTts(@RequestBody String requestBody) {
        try {
            HttpURLConnection conn = openConnection(cosyvoiceBaseUrl + "/v1/tts");
            conn.setReadTimeout(120_000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(requestBody.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                os.flush();
            }

            int status = conn.getResponseCode();
            if (status != 200) {
                log.warn("CosyVoice /tts returned HTTP {}", status);
                return ResponseEntity.status(502).build();
            }

            byte[] audio;
            try (InputStream is = conn.getInputStream()) {
                audio = is.readAllBytes();
            }

            if (audio.length < 100) {
                log.warn("CosyVoice returned unusually small audio: {} bytes", audio.length);
                return ResponseEntity.status(502).build();
            }

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, "audio/mpeg")
                    .header("X-Voice-Backend", "cosyvoice3")
                    .body(audio);

        } catch (java.net.ConnectException e) {
            log.warn("CosyVoice unreachable: {}", e.getMessage());
            return ResponseEntity.status(502).build();
        } catch (Exception e) {
            log.error("Speech proxy error: {}", e.getMessage(), e);
            return ResponseEntity.status(502).build();
        }
    }

    /** 流式合成 → 逐块转发 PCM 字节 */
    @PostMapping("/tts/stream")
    public ResponseEntity<StreamingResponseBody> proxyTtsStream(@RequestBody String requestBody) {
        try {
            HttpURLConnection conn = openConnection(cosyvoiceBaseUrl + "/v1/tts/stream");
            conn.setReadTimeout(120_000); // 流式可能更长

            try (OutputStream os = conn.getOutputStream()) {
                os.write(requestBody.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                os.flush();
            }

            int status = conn.getResponseCode();
            if (status != 200) {
                log.warn("CosyVoice /tts/stream returned HTTP {}", status);
                return ResponseEntity.status(502).build();
            }

            String sampleRate = conn.getHeaderField("X-Pcm-Sample-Rate");
            String bits = conn.getHeaderField("X-Pcm-Bits-Per-Sample");
            String channels = conn.getHeaderField("X-Pcm-Channels");
            InputStream upstream = conn.getInputStream();

            StreamingResponseBody stream = out -> {
                byte[] buf = new byte[8192];
                int n;
                try (upstream; out) {
                    while ((n = upstream.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        out.flush();
                    }
                }
            };

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, "application/octet-stream")
                    .header("X-Pcm-Sample-Rate", sampleRate != null ? sampleRate : "24000")
                    .header("X-Pcm-Bits-Per-Sample", bits != null ? bits : "16")
                    .header("X-Pcm-Channels", channels != null ? channels : "1")
                    .header("X-Transfer-Encoding", "chunked")
                    .body(stream);

        } catch (java.net.ConnectException e) {
            log.warn("CosyVoice unreachable: {}", e.getMessage());
            return ResponseEntity.status(502).build();
        } catch (Exception e) {
            log.error("Speech stream proxy error: {}", e.getMessage(), e);
            return ResponseEntity.status(502).build();
        }
    }

    /** Edge TTS 快速合成 — 微软免费神经网络语音，<1s 延迟 */
    @PostMapping("/tts/edge")
    public ResponseEntity<byte[]> proxyTtsEdge(@RequestBody String requestBody) {
        try {
            HttpURLConnection conn = openConnection(cosyvoiceBaseUrl + "/v1/tts/edge");
            conn.setReadTimeout(15_000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(requestBody.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                os.flush();
            }

            int status = conn.getResponseCode();
            if (status != 200) {
                log.warn("Edge TTS returned HTTP {}", status);
                return ResponseEntity.status(502).build();
            }

            byte[] audio;
            try (InputStream is = conn.getInputStream()) {
                audio = is.readAllBytes();
            }

            if (audio.length < 100) {
                return ResponseEntity.status(502).build();
            }

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, "audio/mpeg")
                    .header("X-Backend", "edge-tts")
                    .body(audio);

        } catch (java.net.ConnectException e) {
            log.warn("Edge TTS unreachable: {}", e.getMessage());
            return ResponseEntity.status(502).build();
        } catch (Exception e) {
            log.error("Edge TTS proxy error: {}", e.getMessage(), e);
            return ResponseEntity.status(502).build();
        }
    }

    private HttpURLConnection openConnection(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setConnectTimeout(5_000);
        conn.setRequestProperty("Content-Type", "application/json");
        return conn;
    }
}

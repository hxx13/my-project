package com.example.demo.modules.speech.controller;

import java.io.FileNotFoundException;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.example.demo.modules.speech.service.SpeechFileService;

/**
 * 服务端语音文件 — 生成 + 下载。
 *
 * GET  /api/v1/twin/speech/ready-ids  → 列出所有已生成音频的消息 ID（后端/浏览器重启后仍可用）
 * GET  /api/v1/twin/speech/file/{messageId}  → 下载已生成的 WAV（不存在返回 404）
 * POST /api/v1/twin/speech/generate/{messageId} → 触发生成（幂等，已存在跳过）
 * GET  /api/v1/twin/speech/file/{messageId}/status → 检查是否存在
 */
@RestController
@RequestMapping("/api/v1/twin/speech")
public class SpeechFileController {

    private static final Logger log = LoggerFactory.getLogger(SpeechFileController.class);
    private final SpeechFileService service;
    private final com.example.demo.modules.notification.service.NotificationSettingsService settingsService;

    @org.springframework.beans.factory.annotation.Value("${app.speech.scan-auto-play:true}")
    private String defaultScanAutoPlay;

    public SpeechFileController(
            SpeechFileService service,
            com.example.demo.modules.notification.service.NotificationSettingsService settingsService) {
        this.service = service;
        this.settingsService = settingsService;
    }

    /** 列出磁盘上所有已生成音频的消息 ID */
    @GetMapping("/ready-ids")
    public ResponseEntity<Map<String, Object>> getReadyIds() {
        java.util.List<Long> ids = service.listReadyIds();
        return ResponseEntity.ok(Map.of(
                "count", ids.size(),
                "ids", ids));
    }

    /** 扫码语音自动播报开关状态（DB 优先 → 环境变量回退） */
    @GetMapping("/scan-auto-play")
    public ResponseEntity<Map<String, Object>> getScanAutoPlay() {
        String value = settingsService.getEffectiveValue("integration", "speech.scan_auto_play", defaultScanAutoPlay);
        boolean enabled = "true".equalsIgnoreCase(value);
        return ResponseEntity.ok(Map.of(
                "scanAutoPlay", enabled,
                "key", "speech.scan_auto_play"));
    }

    /** 下载已生成的音频文件 */
    @GetMapping("/file/{messageId}")
    public ResponseEntity<byte[]> getFile(@PathVariable long messageId) {
        try {
            byte[] audio = service.load(messageId);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, "audio/mpeg")
                    .header("X-Cached", "true")
                    .body(audio);
        } catch (FileNotFoundException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        } catch (Exception e) {
            log.error("Failed to load speech file {}: {}", messageId, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /** 检查音频是否已生成 */
    @GetMapping("/file/{messageId}/status")
    public ResponseEntity<Map<String, Object>> getStatus(@PathVariable long messageId) {
        return ResponseEntity.ok(Map.of(
                "messageId", messageId,
                "ready", service.exists(messageId)));
    }

    /** 触发生成语音（幂等） */
    @PostMapping("/generate/{messageId}")
    public ResponseEntity<Map<String, Object>> generate(
            @PathVariable long messageId,
            @RequestBody Map<String, String> body) {
        String text = body.get("text");
        String voiceId = body.getOrDefault("voice_id", "default");

        if (text == null || text.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "text is required"));
        }

        try {
            service.generate(text.trim(), voiceId, messageId);
            return ResponseEntity.ok(Map.of(
                    "messageId", messageId,
                    "ready", true,
                    "url", "/api/v1/twin/speech/file/" + messageId));
        } catch (Exception e) {
            log.error("Failed to generate speech for {}: {}", messageId, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }
}

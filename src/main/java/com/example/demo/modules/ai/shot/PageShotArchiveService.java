package com.example.demo.modules.ai.shot;

import com.example.demo.modules.ai.export.entity.AiExportArtifact;
import com.example.demo.modules.ai.export.service.AiExportArtifactService;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 「渲染一张页面截图并落成产物」这一件事。
 *
 * <p>抽出来是因为它被**两条完全不同的路**用到，而那两条路彼此够不着：
 * <ul>
 *   <li>交互那条走 {@code AiOrchestrator}，通过事件出口把图下发给载体；</li>
 *   <li><b>无人值守那条走 {@code AiTimerService}</b> —— 定时器到点是**直接调工具执行体**的，
 *       不经过编排层的事件出口，所以 {@code emitImage} 那套约定在那边根本不会跑。
 *       这曾经意味着「定时的截图静默消失、单子还标成功」。</li>
 * </ul>
 *
 * <p><b>为什么不挂在 AiOrchestrator 上</b>：定时器服务与工具注册表之间是构造器循环
 * （{@code ToolRegistry → TimerToolPack → AiTimerService}），而编排层依赖 ToolRegistry ——
 * 把方法挂在编排层上，定时器就只能延迟解析它，凭空多一层绕。本类只依赖渲染与产物两个服务，
 * 谁也回不到工具注册表，两边都能直接注入。
 */
@Service
public class PageShotArchiveService {

    private static final ObjectMapper M = new ObjectMapper();

    private final PageScreenshotService shots;
    private final AiExportArtifactService artifacts;

    public PageShotArchiveService(PageScreenshotService shots, AiExportArtifactService artifacts) {
        this.shots = shots;
        this.artifacts = artifacts;
    }

    /**
     * 渲染 + 落成产物，返回产物 id。
     *
     * <p><b>顺序是刻意的</b>：先渲染成功才落产物 —— 反过来的话，渲染失败会留下一条
     * 永远取不到字节的空产物，历史里就是一张点不开的卡。
     *
     * <p>失败一律抛（渲染不了 / 落库不了）。由调用方决定是回落给载体自截、还是如实告诉用户。
     */
    public Long renderAndArchive(User owner, Long sessionId, Long messageId, String path, String label) {
        byte[] png = shots.shoot(owner, path);

        Map<String, Object> params = new LinkedHashMap<>();
        if (path != null && !path.isBlank()) {
            // 存下来是为了历史里那张卡还能「再截一张」同一页
            params.put("path", path);
        }
        AiExportArtifact saved;
        try {
            saved = artifacts.record(sessionId, messageId, owner == null ? null : owner.getId(),
                    AiExportArtifact.KIND_SCREENSHOT, label, "screenshot.png",
                    M.writeValueAsString(params), null);
        } catch (Exception e) {
            throw new IllegalStateException("截图产物落库失败：" + e.getMessage(), e);
        }
        if (saved == null) {
            throw new IllegalStateException("截图没存下来（会话或身份缺失）");
        }
        artifacts.saveContent(saved.getId(), png, "image/png");
        return saved.getId();
    }
}

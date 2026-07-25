package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.push.config.NotifySourceChannel;
import com.example.demo.modules.notification.push.config.NotifySourceChannelService;
import com.example.demo.modules.notification.push.dto.NotifySourceConfigDTO;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipient;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipientService;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/admin/notify-source")
public class AdminNotifySourceController {

    private final NotifySourceService sourceService;
    private final NotifySourceChannelService channelConfigService;
    private final NotifySourceRecipientService recipientService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AdminNotifySourceController(NotifySourceService sourceService,
                                        NotifySourceChannelService channelConfigService,
                                        NotifySourceRecipientService recipientService) {
        this.sourceService = sourceService;
        this.channelConfigService = channelConfigService;
        this.recipientService = recipientService;
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        User user = (User) request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (user == null || user.getRole() != RoleEnum.SUPER_ADMIN) return Result.error("仅超级管理员可操作");
        return null;
    }

    @GetMapping
    public Result<List<NotifySourceConfigDTO>> listAll(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        List<NotifySource> sources = sourceService.listAll();
        List<NotifySourceConfigDTO> result = new ArrayList<>();
        for (NotifySource src : sources) result.add(buildDTO(src));
        return Result.success(result);
    }

    @GetMapping("/{id}")
    public Result<NotifySourceConfigDTO> getById(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        return Result.success(buildDTO(sourceService.getById(id)));
    }

    @PutMapping("/{id}/enabled")
    public Result<Void> setSourceEnabled(@PathVariable Long id, @RequestParam boolean enabled, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        sourceService.setEnabled(id, enabled);
        return Result.success();
    }

    @PutMapping("/{sourceId}/channels/{channelCode}")
    public Result<Void> saveChannelConfig(@PathVariable Long sourceId, @PathVariable String channelCode,
                                           @RequestBody NotifySourceChannel config, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        config.setSourceId(sourceId);
        config.setChannelCode(channelCode);
        channelConfigService.createOrUpdate(config);
        return Result.success();
    }

    @PutMapping("/{sourceId}/recipients")
    public Result<Void> saveRecipients(@PathVariable Long sourceId, @RequestBody List<NotifySourceRecipient> recipients,
                                        HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        recipientService.replaceBySourceId(sourceId, recipients);
        return Result.success();
    }

    private NotifySourceConfigDTO buildDTO(NotifySource src) {
        NotifySourceConfigDTO dto = new NotifySourceConfigDTO();
        dto.setSourceId(src.getId()); dto.setSourceCode(src.getSourceCode());
        dto.setSourceName(src.getSourceName()); dto.setDescription(src.getDescription());
        dto.setSourceEnabled(src.getEnabled() == 1);
        try {
            if (src.getVariables() != null) dto.setVariables(objectMapper.readValue(src.getVariables(), new TypeReference<Map<String, String>>() {}));
        } catch (Exception e) { dto.setVariables(Map.of()); }

        List<NotifySourceConfigDTO.ChannelConfig> channels = new ArrayList<>();
        for (NotifySourceChannel ch : channelConfigService.listBySourceId(src.getId())) {
            NotifySourceConfigDTO.ChannelConfig cc = new NotifySourceConfigDTO.ChannelConfig();
            cc.setId(ch.getId()); cc.setChannelCode(ch.getChannelCode());
            cc.setChannelName("EMAIL".equals(ch.getChannelCode()) ? "邮件通知" : "Server酱微信通知");
            cc.setEnabled(ch.getEnabled() == 1);
            cc.setTitleTpl(ch.getTitleTpl()); cc.setContentTpl(ch.getContentTpl());
            cc.setQuietStart(ch.getQuietStart() != null ? ch.getQuietStart().toString() : null);
            cc.setQuietEnd(ch.getQuietEnd() != null ? ch.getQuietEnd().toString() : null);
            cc.setRateLimitSeconds(ch.getRateLimitSeconds());
            channels.add(cc);
        }
        dto.setChannels(channels);

        List<NotifySourceConfigDTO.RecipientConfig> recipients = new ArrayList<>();
        for (NotifySourceRecipient r : recipientService.listBySourceId(src.getId())) {
            NotifySourceConfigDTO.RecipientConfig rc = new NotifySourceConfigDTO.RecipientConfig();
            rc.setId(r.getId()); rc.setPerspective(r.getPerspective());
            rc.setScopeType(r.getScopeType()); rc.setScopeValue(r.getScopeValue());
            recipients.add(rc);
        }
        dto.setRecipients(recipients);
        return dto;
    }
}

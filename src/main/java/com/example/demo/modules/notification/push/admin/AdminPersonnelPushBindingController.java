package com.example.demo.modules.notification.push.admin;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.binding.BindingMasker;
import com.example.demo.modules.notification.push.binding.UserPushBinding;
import com.example.demo.modules.notification.push.binding.UserPushBindingMapper;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.dto.BindEmailRequest;
import com.example.demo.modules.notification.push.dto.BindServerChanRequest;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.util.*;

@RestController
@RequestMapping("/api/admin/personnel/{userId}/push-bindings")
public class AdminPersonnelPushBindingController {

    private final UserPushBindingMapper bindingMapper;
    private final List<PushChannel> channels;

    public AdminPersonnelPushBindingController(UserPushBindingMapper bindingMapper, List<PushChannel> channels) {
        this.bindingMapper = bindingMapper;
        this.channels = channels;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        User user = (User) request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (user == null || user.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.error("仅管理员可操作");
        }
        return null;
    }

    @GetMapping
    public Result<List<Map<String, Object>>> listBindings(@PathVariable String userId, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        List<UserPushBinding> bindings = bindingMapper.findByUser(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (PushChannel ch : channels) {
            UserPushBinding b = bindings.stream().filter(x -> x.getChannelCode().equals(ch.getCode())).findFirst().orElse(null);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("channelCode", ch.getCode());
            m.put("channelName", ch.getDisplayName());
            m.put("target", b != null ? BindingMasker.mask(ch.getCode(), b.getTarget()) : null);
            m.put("isVerified", b != null && b.getIsVerified() != null && b.getIsVerified() == 1);
            result.add(m);
        }
        return Result.success(result);
    }

    @PostMapping("/bind-email")
    public Result<Map<String, Object>> bindEmail(@PathVariable String userId, @RequestBody BindEmailRequest req, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        String code = String.format("%06d", new SecureRandom().nextInt(1_000_000));
        UserPushBinding binding = new UserPushBinding();
        binding.setUserId(userId);
        binding.setChannelCode(PushConstants.CHANNEL_EMAIL);
        binding.setTarget(req.getEmail());
        binding.setIsVerified(0);
        binding.setVerifyCode(code);
        bindingMapper.upsert(binding);
        return Result.success(Map.of("message", "验证码已生成", "code", code));
    }

    @PostMapping("/bind-serverchan")
    public Result<Map<String, Object>> bindServerChan(@PathVariable String userId, @RequestBody BindServerChanRequest req, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        UserPushBinding binding = new UserPushBinding();
        binding.setUserId(userId);
        binding.setChannelCode(PushConstants.CHANNEL_SERVER_CHAN);
        binding.setTarget(req.getSendKey());
        binding.setIsVerified(0);
        bindingMapper.upsert(binding);
        return Result.success(Map.of("message", "SendKey已保存"));
    }

    @PostMapping("/{channelCode}/test")
    public Result<Map<String, Object>> sendTest(@PathVariable String userId, @PathVariable String channelCode, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        UserPushBinding binding = bindingMapper.findByUserAndChannel(userId, channelCode);
        if (binding == null) return Result.error("该人员未绑定此渠道");
        PushChannel ch = channels.stream().filter(c -> c.getCode().equals(channelCode)).findFirst().orElse(null);
        if (ch == null) return Result.error("渠道不存在");
        var result = ch.send(binding.getTarget(), "ARO系统通知绑定测试", "这是一条测试消息。收到此消息说明绑定成功。");
        return Result.success(Map.of("success", result.isSuccess(), "errorMsg", result.getErrorMsg() != null ? result.getErrorMsg() : ""));
    }

    @DeleteMapping("/{channelCode}")
    public Result<Void> unbind(@PathVariable String userId, @PathVariable String channelCode, HttpServletRequest request) {
        Result<?> denied = requireAdmin(request); if (denied != null) return Result.error(denied.getMessage());
        bindingMapper.deleteByUserAndChannel(userId, channelCode);
        return Result.success();
    }
}

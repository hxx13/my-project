package com.example.demo.modules.notification.push.binding;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.dto.BindEmailRequest;
import com.example.demo.modules.notification.push.dto.BindServerChanRequest;
import com.example.demo.modules.notification.push.dto.VerifyBindingRequest;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/user/push-bindings")
public class UserPushBindingController {

    private final UserPushBindingService bindingService;
    private final List<PushChannel> channels;

    public UserPushBindingController(UserPushBindingService bindingService, List<PushChannel> channels) {
        this.bindingService = bindingService;
        this.channels = channels;
    }

    private User currentUser(HttpServletRequest request) {
        return (User) request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
    }

    @GetMapping
    public Result<List<Map<String, Object>>> listBindings(HttpServletRequest request) {
        User user = currentUser(request);
        if (user == null) return Result.error("未登录");
        List<UserPushBinding> bindings = bindingService.listBindings(user.getId());
        List<Map<String, Object>> result = bindings.stream().map(b -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("channelCode", b.getChannelCode());
            m.put("target", BindingMasker.mask(b.getChannelCode(), b.getTarget()));
            m.put("isVerified", b.getIsVerified() == 1);
            PushChannel ch = findChannel(b.getChannelCode());
            m.put("channelName", ch != null ? ch.getDisplayName() : b.getChannelCode());
            return m;
        }).toList();
        return Result.success(result);
    }

    @PostMapping("/bind-email")
    public Result<Map<String, Object>> bindEmail(@RequestBody BindEmailRequest req, HttpServletRequest request) {
        User user = currentUser(request);
        if (user == null) return Result.error("未登录");
        bindingService.bindEmail(user.getId(), req.getEmail());
        return Result.success(Map.of("message", "验证码已发送到邮箱，请查收后验证"));
    }

    @PostMapping("/bind-serverchan")
    public Result<Map<String, Object>> bindServerChan(@RequestBody BindServerChanRequest req, HttpServletRequest request) {
        User user = currentUser(request);
        if (user == null) return Result.error("未登录");
        bindingService.bindServerChan(user.getId(), req.getSendKey());
        return Result.success(Map.of("message", "SendKey已保存，请确认收到测试消息后点击验证"));
    }

    @PostMapping("/verify")
    public Result<Void> verify(@RequestBody VerifyBindingRequest req, HttpServletRequest request) {
        User user = currentUser(request);
        if (user == null) return Result.error("未登录");
        if (PushConstants.CHANNEL_EMAIL.equals(req.getChannelCode())) {
            bindingService.verifyEmail(user.getId(), req.getCode());
        } else if (PushConstants.CHANNEL_SERVER_CHAN.equals(req.getChannelCode())) {
            bindingService.verifyServerChan(user.getId(), req.getCode());
        }
        return Result.success();
    }

    @DeleteMapping("/{channelCode}")
    public Result<Void> unbind(@PathVariable String channelCode, HttpServletRequest request) {
        User user = currentUser(request);
        if (user == null) return Result.error("未登录");
        bindingService.unbind(user.getId(), channelCode);
        return Result.success();
    }

    private PushChannel findChannel(String code) {
        return channels.stream().filter(c -> c.getCode().equals(code)).findFirst().orElse(null);
    }
}

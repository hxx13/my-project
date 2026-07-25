package com.example.demo.modules.notification.push.binding;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.notification.push.PushConstants;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.List;
import java.util.UUID;

@Service
public class UserPushBindingService {

    private final UserPushBindingMapper bindingMapper;

    public UserPushBindingService(UserPushBindingMapper bindingMapper) {
        this.bindingMapper = bindingMapper;
    }

    public String bindEmail(String userId, String email) {
        SecureRandom rng = new SecureRandom();
        String code = String.format("%06d", rng.nextInt(1_000_000));
        UserPushBinding binding = new UserPushBinding();
        binding.setUserId(userId);
        binding.setChannelCode(PushConstants.CHANNEL_EMAIL);
        binding.setTarget(email);
        binding.setIsVerified(0);
        binding.setVerifyCode(code);
        bindingMapper.upsert(binding);
        return code;
    }

    public void bindServerChan(String userId, String sendKey) {
        UserPushBinding binding = new UserPushBinding();
        binding.setUserId(userId);
        binding.setChannelCode(PushConstants.CHANNEL_SERVER_CHAN);
        binding.setTarget(sendKey);
        binding.setIsVerified(0);
        binding.setVerifyCode(UUID.randomUUID().toString().substring(0, 8));
        bindingMapper.upsert(binding);
    }

    public void verifyEmail(String userId, String code) {
        UserPushBinding binding = bindingMapper.findByUserAndChannel(userId, PushConstants.CHANNEL_EMAIL);
        if (binding == null)
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_BINDING_NOT_FOUND, "未找到绑定记录");
        if (!code.equals(binding.getVerifyCode()))
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_VERIFY_CODE_INVALID, "验证码错误");
        bindingMapper.updateVerified(userId, PushConstants.CHANNEL_EMAIL, 1);
    }

    public void verifyServerChan(String userId, String code) {
        if (!"CONFIRMED".equals(code))
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_VERIFY_CODE_INVALID, "请先确认收到测试消息");
        UserPushBinding binding = bindingMapper.findByUserAndChannel(userId, PushConstants.CHANNEL_SERVER_CHAN);
        if (binding == null)
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_BINDING_NOT_FOUND, "未找到绑定记录");
        bindingMapper.updateVerified(userId, PushConstants.CHANNEL_SERVER_CHAN, 1);
    }

    public void unbind(String userId, String channelCode) {
        int rows = bindingMapper.deleteByUserAndChannel(userId, channelCode);
        if (rows == 0)
            throw new TwinBusinessException(ErrorCodeConstants.NOTIFY_BINDING_NOT_FOUND, "未找到绑定记录");
    }

    public List<UserPushBinding> listBindings(String userId) {
        return bindingMapper.findByUser(userId);
    }
}

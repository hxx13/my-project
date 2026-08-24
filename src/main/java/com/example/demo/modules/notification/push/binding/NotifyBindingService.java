package com.example.demo.modules.notification.push.binding;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.notification.push.PushConstants;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class NotifyBindingService {

    private final PersonnelNotifyBindingMapper bindingMapper;
    private final PersonnelService personnelService;
    private final UserMapper userMapper;

    public NotifyBindingService(PersonnelNotifyBindingMapper bindingMapper,
                                PersonnelService personnelService,
                                UserMapper userMapper) {
        this.bindingMapper = bindingMapper;
        this.personnelService = personnelService;
        this.userMapper = userMapper;
    }

    /** 任意账号 id → 单渠道目标值;未绑定返回 null。落单账号回落 sys_user 旧列。 */
    public String readByChannel(String accountId, String channelCode) {
        String pid = personnelService.resolveIdByAccount(accountId);
        if (pid != null) {
            PersonnelNotifyBinding row = bindingMapper.find(Long.parseLong(pid), channelCode);
            return row == null ? null : row.getTargetValue();
        }
        return fallbackReadSysUser(accountId, channelCode);
    }

    /** 写单渠道;空值=解绑。落单账号写 sys_user 旧列。 */
    public void writeByChannel(String accountId, String channelCode, String targetValue) {
        String pid = personnelService.resolveIdByAccount(accountId);
        if (pid != null) {
            Long personnelId = Long.parseLong(pid);
            if (StringUtils.hasText(targetValue)) {
                PersonnelNotifyBinding row = new PersonnelNotifyBinding();
                row.setPersonnelId(personnelId);
                row.setChannelCode(channelCode);
                row.setTargetValue(targetValue.trim());
                bindingMapper.upsert(row);
            } else {
                bindingMapper.delete(personnelId, channelCode);
            }
            return;
        }
        fallbackWriteSysUser(accountId, channelCode, targetValue);
    }

    /** personnel.id 集合 → Map<personnelId, Map<channelCode, targetValue>>(派发批量预载用)。 */
    public Map<Long, Map<String, String>> readBatchByPersonnelIds(List<Long> ids) {
        Map<Long, Map<String, String>> result = new HashMap<>();
        for (PersonnelNotifyBinding row : bindingMapper.listByPersonnelIds(ids)) {
            result.computeIfAbsent(row.getPersonnelId(), k -> new HashMap<>())
                  .put(row.getChannelCode(), row.getTargetValue());
        }
        return result;
    }

    private String fallbackReadSysUser(String accountId, String channelCode) {
        switch (channelCode) {
            case PushConstants.CHANNEL_EMAIL: return userMapper.findContactEmailById(accountId);
            case PushConstants.CHANNEL_SERVER_CHAN: return userMapper.findSendKeyById(accountId);
            case PushConstants.CHANNEL_WXPUSHER: return userMapper.findWxPusherUidById(accountId);
            default: return null;
        }
    }

    private void fallbackWriteSysUser(String accountId, String channelCode, String targetValue) {
        String v = StringUtils.hasText(targetValue) ? targetValue.trim() : null;
        switch (channelCode) {
            case PushConstants.CHANNEL_EMAIL -> userMapper.updateContactEmail(accountId, v);
            case PushConstants.CHANNEL_SERVER_CHAN -> userMapper.updateSendKey(accountId, v);
            case PushConstants.CHANNEL_WXPUSHER -> userMapper.updateWxPusherUid(accountId, v);
            default -> { }
        }
    }
}

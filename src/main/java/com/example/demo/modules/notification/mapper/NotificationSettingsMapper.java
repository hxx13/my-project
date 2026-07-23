package com.example.demo.modules.notification.mapper;

import com.example.demo.modules.notification.entity.NotifyRule;
import com.example.demo.modules.notification.entity.NotifyTemplate;
import com.example.demo.modules.notification.entity.SystemConfigItem;
import com.example.demo.modules.notification.entity.SystemConfigDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface NotificationSettingsMapper {
    List<NotifyRule> listRules();

    NotifyRule findRuleById(@Param("id") Long id);

    int updateRule(NotifyRule rule);

    NotifyRule findRuleByEventAndBiz(@Param("eventType") String eventType, @Param("bizType") String bizType);

    List<NotifyTemplate> listTemplates();

    NotifyTemplate findTemplateByKey(@Param("templateKey") String templateKey);

    int updateTemplate(NotifyTemplate template);

    List<SystemConfigItem> listConfigsByModule(@Param("module") String module);

    List<String> listConfigModules();

    SystemConfigItem findConfigById(@Param("id") Long id);

    List<SystemConfigDefinition> listConfigDefinitionsByModule(@Param("module") String module);

    List<SystemConfigDefinition> listPublicConfigDefinitions();

    int updateConfig(SystemConfigItem item);

    int insertConfigItem(SystemConfigItem item);

    int insertConfigAudit(@Param("configId") Long configId,
                          @Param("module") String module,
                          @Param("configKey") String configKey,
                          @Param("oldValue") String oldValue,
                          @Param("newValue") String newValue,
                          @Param("operatorId") String operatorId);
}

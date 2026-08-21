package com.example.demo.modules.aup.config;

import com.example.demo.modules.aup.service.AupDictService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 启动时自动导入内置种子字典（db/default-aup-dict.json），幂等。
 * 确保 AUP 表单的动物品种/品系/安乐死方法/人员类别/项目来源/供应商等下拉默认就绪，
 * 之后可在 /#/content-manager/aup-dict 页面配置，或通过「导入内置字典」按钮重新导入。
 */
@Component
@Order(190)
public class AupBuiltinDictSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AupBuiltinDictSeeder.class);

    private final AupDictService aupDictService;

    public AupBuiltinDictSeeder(AupDictService aupDictService) {
        this.aupDictService = aupDictService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Map<String, Object> r = aupDictService.importBuiltinDicts();
            log.info("[aup-dict] 内置字典就绪：新建字典 {} 个、字典项 {} 个",
                    r.get("createdDicts"), r.get("createdItems"));
        } catch (Exception e) {
            log.warn("[aup-dict] 内置字典导入跳过：{}", e.getMessage());
        }
    }
}

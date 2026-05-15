package com.example.demo;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.client.RestTemplate;

@SpringBootApplication
@MapperScan("com.example.demo.modules.*.mapper")
@EnableScheduling // 💥 2. 加上这个注解，定时任务引擎就启动了！
public class TwinSystemApplication {

    public static void main(String[] args) {
        // ❌ 原来的写法：SpringApplication.run(main.class, args);
        // 原来的写法默认会开启 headless 模式，导致无法调用桌面浏览器

        // ✅ 新的写法：强制关闭 headless 模式
        SpringApplicationBuilder builder = new SpringApplicationBuilder(TwinSystemApplication.class);
        builder.headless(false); // 关键：允许 Java 调用本地桌面应用
        builder.run(args);
    }

    // 💥 加上这段代码！这就是把 RestTemplate 放进 Spring 工具箱的动作！
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
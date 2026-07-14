---
title: Tomcat WAR 部署
category: 运维手册
---

# Tomcat WAR 部署

#  Tomcat 部署

友情提示：

参考 《Spring Boot 打包为 war 包，部署 tomcat》，已验证可行。

① 修改 `yudao-server` 目录的 `pom.xml` 文件，添加 `war` 包的打包配置：

```
<!-- <packaging>jar</packaging> -->
<packaging>war</packaging>
```

继续修改该 `pom.xml` 文件，添加 `spring-boot-starter-tomcat` 依赖：

```
        <!-- 排除内置tomcat，用于war包部署 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
            <exclusions>
                <exclusion>
                    <groupId>org.springframework.boot</groupId>
                    <artifactId>spring-boot-starter-tomcat</artifactId>
                </exclusion>
            </exclusions>
        </dependency>

        <!-- 添加servlet api依赖，用于war包部署 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
            <scope>provided</scope>
        </dependency>
```

② 修改 YudaoServerApplication 类，实现 SpringBootServletInitializer 接口，并重写 `configure` 方法：

```

    /**
     * 用于 WAR 包部署到外部 Tomcat
     */
    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(YudaoServerApplication.class);
    }

```

③ 根目录执行打包命令：

```
mvn clean package -Dmaven.test.skip=true
```

后续，部署到 Tomcat 的时候，使用 `yudao-server/target/yudao-server.war` 文件。

注意，`context-path` 需要为 `/` 噢！

#  国产 TongWeb 部署

友情提示：最好上面的 Tomcat 部署先跑通！！！

手头暂时没有 TongWeb 的环境，无法验证是否可行。目前找了几篇看着还行的文档：

-   《国产化：springboot 项目 TongWeb 替换 tomcat 踩坑实录 》
-   《Springboot 集成东方通等中间件打包和部署》
-   《信创改造：tongweb 部署 Springboot 项目方案>》

package com.example.demo.modules.auth.iam;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(IamOAuthProperties.class)
public class IamOAuthPropertiesConfiguration {
}

package com.example.demo.modules.docs.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.lang.reflect.Field;
import java.lang.reflect.Parameter;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/admin/docs")
@Tag(name = "接口中心", description = "自动发现后端接口并生成文档元数据")
public class AdminDocsController {
    private final RequestMappingHandlerMapping requestMappingHandlerMapping;

    public AdminDocsController(RequestMappingHandlerMapping requestMappingHandlerMapping) {
        this.requestMappingHandlerMapping = requestMappingHandlerMapping;
    }

    @GetMapping("/apis")
    @Operation(summary = "获取接口文档列表", description = "自动枚举 /api/** 路由并返回接口元数据")
    public Result<?> listApis(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : requestMappingHandlerMapping.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = entry.getKey();
            HandlerMethod handler = entry.getValue();
            Set<String> paths = info.getPathPatternsCondition() == null ? Set.of() : info.getPathPatternsCondition().getPatternValues();
            Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
            if (methods.isEmpty()) {
                methods = Set.of(RequestMethod.GET, RequestMethod.POST, RequestMethod.PATCH, RequestMethod.PUT, RequestMethod.DELETE);
            }
            for (String path : paths) {
                if (!path.startsWith("/api")) continue;
                for (RequestMethod method : methods) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("module", resolveModule(path));
                    row.put("path", path);
                    row.put("method", method.name());
                    row.put("summary", resolveSummary(handler));
                    row.put("description", resolveDescription(handler));
                    row.put("tags", resolveTags(handler));
                    row.put("parameters", toParameters(handler));
                    row.put("requestBodyExample", buildRequestBodyExample(handler));
                    row.put("statusCodes", resolveStatusCodes(handler));
                    row.put("qualityHints", resolveQualityHints(handler));
                    items.add(row);
                }
            }
        }
        Map<String, Object> data = new HashMap<>();
        data.put("data", items);
        data.put("standardResponse", Map.of("code", 200, "success", true, "message", "操作成功", "data", Map.of()));
        return Result.success(data);
    }

    private List<Map<String, Object>> toParameters(HandlerMethod handler) {
        List<Map<String, Object>> params = new ArrayList<>();
        for (Parameter parameter : handler.getMethod().getParameters()) {
            RequestParam requestParam = parameter.getAnnotation(RequestParam.class);
            PathVariable pathVariable = parameter.getAnnotation(PathVariable.class);
            RequestHeader requestHeader = parameter.getAnnotation(RequestHeader.class);
            RequestBody requestBody = parameter.getAnnotation(RequestBody.class);
            String in = resolveIn(requestParam, pathVariable, requestHeader, requestBody);
            boolean required = resolveRequired(requestParam, pathVariable, requestHeader, requestBody);
            params.add(Map.of(
                    "name", resolveParameterName(parameter, requestParam, pathVariable, requestHeader),
                    "in", in,
                    "required", required,
                    "description", parameter.getType().getSimpleName(),
                    "type", resolveParameterType(parameter.getType()),
                    "defaultValue", resolveDefaultValue(requestParam, requestHeader)
            ));
        }
        return params;
    }

    private String resolveParameterType(Class<?> type) {
        if (String.class.equals(type)) return "string";
        if (Boolean.class.equals(type) || boolean.class.equals(type)) return "boolean";
        if (Integer.class.equals(type) || int.class.equals(type)
                || Long.class.equals(type) || long.class.equals(type)
                || Double.class.equals(type) || double.class.equals(type)
                || Float.class.equals(type) || float.class.equals(type)) return "number";
        if (List.class.isAssignableFrom(type)) return "array";
        if (Map.class.isAssignableFrom(type)) return "object";
        return "string";
    }

    private String resolveDefaultValue(RequestParam requestParam, RequestHeader requestHeader) {
        if (requestParam != null && StringUtils.hasText(requestParam.defaultValue())
                && !org.springframework.web.bind.annotation.ValueConstants.DEFAULT_NONE.equals(requestParam.defaultValue())) {
            return requestParam.defaultValue();
        }
        if (requestHeader != null && StringUtils.hasText(requestHeader.defaultValue())
                && !org.springframework.web.bind.annotation.ValueConstants.DEFAULT_NONE.equals(requestHeader.defaultValue())) {
            return requestHeader.defaultValue();
        }
        return "";
    }

    private String resolveSummary(HandlerMethod handler) {
        Operation operation = handler.getMethod().getAnnotation(Operation.class);
        if (operation != null && StringUtils.hasText(operation.summary())) {
            return operation.summary();
        }
        return handler.getMethod().getName();
    }

    private String resolveDescription(HandlerMethod handler) {
        Operation operation = handler.getMethod().getAnnotation(Operation.class);
        if (operation != null && StringUtils.hasText(operation.description())) {
            return operation.description();
        }
        return handler.getBeanType().getSimpleName() + "." + handler.getMethod().getName();
    }

    private List<String> resolveTags(HandlerMethod handler) {
        Operation operation = handler.getMethod().getAnnotation(Operation.class);
        if (operation != null && operation.tags().length > 0) {
            return Arrays.stream(operation.tags()).toList();
        }
        Tag tag = handler.getBeanType().getAnnotation(Tag.class);
        if (tag != null && StringUtils.hasText(tag.name())) {
            return List.of(tag.name());
        }
        return List.of(handler.getBeanType().getSimpleName());
    }

    private String resolveIn(RequestParam requestParam,
                             PathVariable pathVariable,
                             RequestHeader requestHeader,
                             RequestBody requestBody) {
        if (pathVariable != null) return "path";
        if (requestHeader != null) return "header";
        if (requestBody != null) return "body";
        if (requestParam != null) return "query";
        return "query";
    }

    private boolean resolveRequired(RequestParam requestParam,
                                    PathVariable pathVariable,
                                    RequestHeader requestHeader,
                                    RequestBody requestBody) {
        if (pathVariable != null) return true;
        if (requestHeader != null) return requestHeader.required();
        if (requestBody != null) return requestBody.required();
        if (requestParam != null) return requestParam.required();
        return false;
    }

    private String resolveParameterName(Parameter parameter,
                                        RequestParam requestParam,
                                        PathVariable pathVariable,
                                        RequestHeader requestHeader) {
        if (requestParam != null && StringUtils.hasText(requestParam.value())) return requestParam.value();
        if (pathVariable != null && StringUtils.hasText(pathVariable.value())) return pathVariable.value();
        if (requestHeader != null && StringUtils.hasText(requestHeader.value())) return requestHeader.value();
        return parameter.getName();
    }

    private String buildRequestBodyExample(HandlerMethod handler) {
        for (Parameter parameter : handler.getMethod().getParameters()) {
            if (parameter.getAnnotation(RequestBody.class) != null) {
                Object sample = buildSampleObject(parameter.getType(), 0);
                return toJson(sample);
            }
        }
        return "";
    }

    private Object sampleByType(Class<?> type) {
        if (String.class.equals(type)) return "";
        if (Integer.class.equals(type) || int.class.equals(type) || Long.class.equals(type) || long.class.equals(type)) return 0;
        if (Boolean.class.equals(type) || boolean.class.equals(type)) return false;
        if (Double.class.equals(type) || double.class.equals(type) || Float.class.equals(type) || float.class.equals(type)) return 0.0;
        if (List.class.isAssignableFrom(type)) return List.of();
        return null;
    }

    private Object buildSampleObject(Class<?> type, int depth) {
        if (depth >= 2) {
            return sampleByType(type);
        }
        if (type.getName().startsWith("java.")) {
            return sampleByType(type);
        }
        if (type.isEnum()) {
            Object[] values = type.getEnumConstants();
            return values != null && values.length > 0 ? String.valueOf(values[0]) : "";
        }
        if (List.class.isAssignableFrom(type)) {
            return List.of();
        }
        Map<String, Object> sample = new LinkedHashMap<>();
        for (Field field : type.getDeclaredFields()) {
            if (Modifier.isStatic(field.getModifiers())) continue;
            Class<?> fieldType = field.getType();
            sample.put(field.getName(), buildSampleObject(fieldType, depth + 1));
        }
        return sample;
    }

    private String toJson(Object obj) {
        if (obj == null) {
            return "null";
        }
        if (obj instanceof String str) {
            return "\"" + str + "\"";
        }
        if (obj instanceof Number || obj instanceof Boolean) {
            return obj.toString();
        }
        if (obj instanceof List<?> list) {
            StringBuilder sb = new StringBuilder();
            sb.append("[\n");
            for (int i = 0; i < list.size(); i++) {
                sb.append("  ").append(toJson(list.get(i)));
                if (i < list.size() - 1) sb.append(",");
                sb.append("\n");
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Map<?, ?> map) {
            StringBuilder sb = new StringBuilder();
            sb.append("{\n");
            int i = 0;
            int size = map.size();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                sb.append("  \"").append(entry.getKey()).append("\": ").append(toJson(entry.getValue()));
                if (i < size - 1) sb.append(",");
                sb.append("\n");
                i++;
            }
            sb.append("}");
            return sb.toString();
        }
        return "\"" + obj + "\"";
    }

    private List<Map<String, Object>> resolveStatusCodes(HandlerMethod handler) {
        ApiResponses responses = handler.getMethod().getAnnotation(ApiResponses.class);
        if (responses != null && responses.value().length > 0) {
            List<Map<String, Object>> list = new ArrayList<>();
            for (ApiResponse r : responses.value()) {
                list.add(Map.of(
                        "code", r.responseCode(),
                        "description", StringUtils.hasText(r.description()) ? r.description() : "无描述"
                ));
            }
            return list;
        }
        return List.of(
                Map.of("code", "200", "description", "成功"),
                Map.of("code", "400", "description", "请求参数错误"),
                Map.of("code", "401", "description", "未授权"),
                Map.of("code", "403", "description", "无权限"),
                Map.of("code", "500", "description", "服务器异常")
        );
    }

    private List<String> resolveQualityHints(HandlerMethod handler) {
        List<String> hints = new ArrayList<>();
        Operation op = handler.getMethod().getAnnotation(Operation.class);
        if (op == null || !StringUtils.hasText(op.summary())) {
            hints.add("缺少 @Operation(summary)");
        }
        Tag tag = handler.getBeanType().getAnnotation(Tag.class);
        if (tag == null || !StringUtils.hasText(tag.name())) {
            hints.add("控制器缺少 @Tag");
        }
        return hints;
    }

    private String resolveModule(String path) {
        String[] parts = path.split("/");
        if (parts.length >= 3) {
            return parts[2];
        }
        return "other";
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}

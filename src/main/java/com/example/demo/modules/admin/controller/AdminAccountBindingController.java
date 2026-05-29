package com.example.demo.modules.admin.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminAccountBindingController {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountBindingController.class);

    private final UserAroBindingMapper userAroBindingMapper;
    private final AroPersonnelMapper aroPersonnelMapper;
    private final AuthContextService authContextService;
    private final UserMapper userMapper;

    public AdminAccountBindingController(UserAroBindingMapper userAroBindingMapper,
                                         AroPersonnelMapper aroPersonnelMapper,
                                         AuthContextService authContextService,
                                         UserMapper userMapper) {
        this.userAroBindingMapper = userAroBindingMapper;
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.authContextService = authContextService;
        this.userMapper = userMapper;
    }

    @GetMapping("/account/binding")
    public Result<?> getBinding(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        UserAroBinding binding = userAroBindingMapper.selectByUserId(user.getId());
        if (binding == null) {
            return Result.success(null);
        }

        AroPersonnel personnel = aroPersonnelMapper.findByUserId(binding.getAroUserId());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("aroUserId", binding.getAroUserId());
        data.put("name", personnel != null ? personnel.getName() : null);
        data.put("departmentName", personnel != null ? personnel.getDepartmentName() : null);
        data.put("createdAt", binding.getCreatedAt());
        return Result.success(data);
    }

    @PostMapping("/account/bind-aro")
    public Result<?> bindAro(@RequestBody Map<String, String> body, HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        String aroUserId = body.get("aroUserId");
        if (aroUserId == null || aroUserId.isBlank()) {
            return Result.fail(400, "aroUserId 不能为空");
        }

        AroPersonnel personnel = aroPersonnelMapper.findByUserId(aroUserId);
        if (personnel == null) {
            return Result.fail(400, "ARO 人员不存在");
        }

        UserAroBinding existingByAro = userAroBindingMapper.selectByAroUserId(aroUserId);
        if (existingByAro != null && !existingByAro.getUserId().equals(user.getId())) {
            return Result.fail(409, "该 ARO 人员已被其他用户绑定");
        }

        userAroBindingMapper.deleteByUserId(user.getId());

        UserAroBinding newBinding = new UserAroBinding();
        newBinding.setUserId(user.getId());
        newBinding.setAroUserId(aroUserId);
        newBinding.setCreatedAt(LocalDateTime.now());
        userAroBindingMapper.insert(newBinding);

        // 自动为 ARO 人员创建 sys_user 注册记录（若不存在），
        // 使模拟身份切换时走正常登录流程，数据自然合并。
        User aroUser = userMapper.findById(aroUserId);
        if (aroUser == null) {
            aroUser = new User();
            aroUser.setId(aroUserId);
            aroUser.setUsername(aroUserId);
            aroUser.setRole(RoleEnum.STUDENT);
            aroUser.setStatus(1);
            aroUser.setAuthProfile("ARO_BOUND");
            userMapper.insertUser(aroUser);
            log.info("auto-created sys_user for bound ARO person: {}", aroUserId);
        }

        return Result.success();
    }

    @DeleteMapping("/account/bind-aro")
    public Result<?> unbindAro(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        userAroBindingMapper.deleteByUserId(user.getId());
        return Result.success();
    }

    @DeleteMapping("/personnel/{userId}/aro-binding")
    public Result<?> adminUnbindAro(@PathVariable String userId, HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) {
            return Result.fail(401, "未登录或 Token 无效");
        }

        if (user.getRole() == null || user.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.fail(403, "无权限访问");
        }

        userAroBindingMapper.deleteByUserId(userId);
        return Result.success();
    }

    @GetMapping("/aro-bindings")
    public Result<List<Map<String, Object>>> listAllBindings(HttpServletRequest request) {
        User user = resolveUser(request);
        if (user == null) return Result.fail(401, "未登录");
        if (user.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel())
            return Result.fail(403, "权限不足");

        List<UserAroBinding> bindings = userAroBindingMapper.selectAll();
        List<Map<String, Object>> result = new ArrayList<>();
        for (UserAroBinding b : bindings) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("userId", b.getUserId());
            item.put("aroUserId", b.getAroUserId());
            AroPersonnel p = aroPersonnelMapper.findByUserId(b.getAroUserId());
            item.put("name", p != null ? p.getName() : "");
            item.put("departmentName", p != null ? p.getDepartmentName() : "");
            item.put("createdAt", b.getCreatedAt() != null ? b.getCreatedAt().toString() : "");
            result.add(item);
        }
        return Result.success(result);
    }

    private User resolveUser(HttpServletRequest request) {
        return authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    }
}

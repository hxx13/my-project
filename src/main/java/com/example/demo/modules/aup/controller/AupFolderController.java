package com.example.demo.modules.aup.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.aup.dto.AupFolderCreateRequest;
import com.example.demo.modules.aup.dto.AupFolderMoveRequest;
import com.example.demo.modules.aup.dto.AupFolderUpdateRequest;
import com.example.demo.modules.aup.dto.AupFolderVO;
import com.example.demo.modules.aup.service.AupFolderService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** AUP 配置面通用文件夹（码表/字段/原子域共用，ADMIN）。 */
@RestController
@RequestMapping("/api/aup-folder")
@Tag(name = "AUP 配置文件夹", description = "配置面通用文件夹树管理")
public class AupFolderController {

    private final AupFolderService service;
    private final AuthContextService authContextService;

    public AupFolderController(AupFolderService service, AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    private User resolveUser(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) {
            return null;
        }
        return authContextService.resolveUserFromBearer(authHeader);
    }

    @GetMapping
    @Operation(summary = "取整棵文件夹树")
    public Result<List<AupFolderVO>> tree(@RequestParam(value = "ownerType", required = false) String ownerType) {
        return Result.success(service.tree(ownerType));
    }

    @PostMapping
    @Operation(summary = "新建文件夹")
    public Result<AupFolderVO> create(@RequestHeader(value = "Authorization", required = false) String auth,
                                      @RequestBody AupFolderCreateRequest body) {
        return service.create(body, resolveUser(auth));
    }

    @PutMapping("/{id}")
    @Operation(summary = "重命名/改排序")
    public Result<AupFolderVO> update(@RequestHeader(value = "Authorization", required = false) String auth,
                                      @PathVariable Long id, @RequestBody AupFolderUpdateRequest body) {
        return service.update(id, body, resolveUser(auth));
    }

    @PutMapping("/{id}/move")
    @Operation(summary = "换父节点")
    public Result<Void> move(@RequestHeader(value = "Authorization", required = false) String auth,
                             @PathVariable Long id, @RequestBody AupFolderMoveRequest body) {
        return service.move(id, body, resolveUser(auth));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除空文件夹")
    public Result<Void> remove(@RequestHeader(value = "Authorization", required = false) String auth,
                               @PathVariable Long id) {
        return service.delete(id, resolveUser(auth));
    }
}

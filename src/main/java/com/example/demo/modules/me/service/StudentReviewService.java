package com.example.demo.modules.me.service;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.material.dto.MaterialRequestView;
import com.example.demo.modules.material.entity.MaterialDemand;
import com.example.demo.modules.material.mapper.MaterialDemandMapper;
import com.example.demo.modules.material.service.MaterialService;
import com.example.demo.modules.me.dto.StudentReviewDashboardVo;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayRequestService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class StudentReviewService {

    private final MaterialService materialService;
    private final ScanDelayRequestService scanDelayRequestService;
    private final MaterialDemandMapper demandMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final JdbcTemplate jdbcTemplate;

    public StudentReviewService(MaterialService materialService,
                                ScanDelayRequestService scanDelayRequestService,
                                MaterialDemandMapper demandMapper,
                                UserDisplayNameService userDisplayNameService,
                                JdbcTemplate jdbcTemplate) {
        this.materialService = materialService;
        this.scanDelayRequestService = scanDelayRequestService;
        this.demandMapper = demandMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.jdbcTemplate = jdbcTemplate;
    }

    public Result<StudentReviewDashboardVo> buildDashboard(User user) {
        if (user == null) {
            return Result.error("未登录");
        }
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        if (role.getLevel() < RoleEnum.STAFF.getLevel()) {
            return Result.error("需要教职工权限");
        }

        StudentReviewDashboardVo vo = new StudentReviewDashboardVo();

        Result<List<MaterialRequestView>> pendingRes = materialService.listPendingForReview(user);
        if (!Boolean.TRUE.equals(pendingRes.getSuccess())) {
            return Result.error(pendingRes.getMessage());
        }
        List<MaterialRequestView> pending = pendingRes.getData() == null ? List.of() : pendingRes.getData();
        vo.setPendingMaterials(pending);
        vo.setPendingMaterialCount(pending.size());

        Result<Map<String, Object>> allRes = materialService.listFinishedForStaff(null, null, 1, 50);
        if (Boolean.TRUE.equals(allRes.getSuccess()) && allRes.getData() != null) {
            Object data = allRes.getData().get("data");
            Object total = allRes.getData().get("total");
            if (data instanceof List<?> list) {
                @SuppressWarnings("unchecked")
                List<MaterialRequestView> rows = (List<MaterialRequestView>) list;
                vo.setAllMaterials(rows);
            }
            vo.setAllMaterialsTotal(total instanceof Number n ? n.intValue() : 0);
        } else {
            vo.setAllMaterials(List.of());
            vo.setAllMaterialsTotal(0);
        }

        List<Map<String, Object>> scanPending = scanDelayRequestService.listPendingEnriched(user.getId());
        vo.setScanDelayPending(scanPending == null ? List.of() : scanPending);
        vo.setScanDelayPendingCount(vo.getScanDelayPending().size());

        List<MaterialDemand> demands = demandMapper.selectAll(0, 200);
        for (MaterialDemand d : demands) {
            d.setUserName(userDisplayNameService.resolveDisplayName(d.getUserId()));
        }
        vo.setDemands(demands);
        vo.setDemandsTotal(demandMapper.countAll());
        vo.setOpenDemandCount((int) demands.stream().filter(d -> d.getStatus() != null && d.getStatus() == 0).count());
        vo.setDemandEntryVisible(isDemandEntryVisible());

        return Result.success(vo);
    }

    private boolean isDemandEntryVisible() {
        try {
            String val = jdbcTemplate.queryForObject(
                    "SELECT config_value FROM sys_system_config WHERE module='material' AND config_key='material.demand_entry_visible'",
                    String.class);
            return !"false".equals(val);
        } catch (Exception e) {
            return true;
        }
    }
}

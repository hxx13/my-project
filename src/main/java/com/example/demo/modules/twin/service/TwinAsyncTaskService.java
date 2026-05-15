package com.example.demo.modules.twin.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.service.AroPersonnelDatabaseService;
import com.example.demo.modules.aro.service.AroService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class TwinAsyncTaskService {

    @Autowired
    private AroService aroService;

    @Autowired
    private AroPersonnelDatabaseService personnelDbService;

    @Autowired
    private ExamRoomPermissionSyncService examRoomPermissionSyncService;

    @Async("coreTaskExecutor")
    public void syncPersonnelAsync() {
        List<AroPersonnel> allData = aroService.fetchAllPersonnel();
        personnelDbService.upsertPersonnel(allData);
        examRoomPermissionSyncService.refreshAllowedRoomsDisplayForPersonnelList(allData);
    }
}

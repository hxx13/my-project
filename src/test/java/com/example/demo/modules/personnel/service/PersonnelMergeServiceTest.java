package com.example.demo.modules.personnel.service;

import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PersonnelMergeServiceTest {

    @Mock private PersonnelMapper personnelMapper;
    @Mock private JdbcTemplate jdbcTemplate;

    private PersonnelMergeService service() {
        return new PersonnelMergeService(personnelMapper, jdbcTemplate);
    }

    private static Personnel row(Long id, String name, String staffId, String aroUserId) {
        Personnel p = new Personnel();
        p.setId(id);
        p.setName(name);
        p.setStaffId(staffId);
        p.setAroUserId(aroUserId);
        return p;
    }

    @Test
    void merge_moves_account_ids_to_survivor_and_deletes_merged_row() {
        Personnel survivor = row(1L, "张三", null, "19digit");
        Personnel merged = row(2L, "张三", "STAFF_x", null);
        when(personnelMapper.findById(1L)).thenReturn(survivor);
        when(personnelMapper.findById(2L)).thenReturn(merged);

        service().merge(1L, 2L, "STAFF_admin");

        assertEquals("STAFF_x", survivor.getStaffId());
        assertEquals("19digit", survivor.getAroUserId());
        verify(personnelMapper).update(survivor);
        verify(personnelMapper).deleteById(2L);
    }

    @Test
    void merge_repoints_every_table_that_stores_personnel_id() {
        when(personnelMapper.findById(anyLong()))
                .thenReturn(row(1L, "张三", null, "19digit"))
                .thenReturn(row(2L, "张三", "STAFF_x", null));

        service().merge(1L, 2L, "STAFF_admin");

        // 每一对 (表, 列) 都必须改指，且恰好一次。
        // 漏掉任意一个，被合并行的 id 删除后那些行就成为孤儿 —— 而 lookupKeys() 不含被删的 id，
        // 数据会静默丢失，且没有任何报错。实测：person_identity.user_id 有 2531/2532 行是 personnel.id。
        for (String target : List.of(
                "personnel_notify_binding SET personnel_id",
                "crf_dag_user SET personnel_id",
                "team_member SET personnel_id",
                "team_join_request SET personnel_id",
                "team_join_request SET reviewer_personnel_id",
                "team SET owner_personnel_id",
                "team_audit_log SET actor_personnel_id",
                "cage_transfer_log SET occupant_id",
                "cage_transfer_log SET operator_id",
                "person_identity SET user_id",
                "cage_region_grant SET user_id",
                "cage_region_grant SET leader_user_id",
                "cage_member_capability SET user_id",
                "health_survey_response SET person_id",
                "person_qualification SET person_id",
                "crf_data_audit_log SET operator_id",
                "crf_import_batch SET operator_id",
                "crf_record_snapshot SET created_by",
                "crf_signature SET signer_id",
                "person_scope SET user_id")) {
            verify(jdbcTemplate).update(contains(target), eq(1L), eq(2L));
        }
    }

    @Test
    void merge_writes_binding_and_log() {
        when(personnelMapper.findById(anyLong()))
                .thenReturn(row(1L, "张三", null, "19digit"))
                .thenReturn(row(2L, "张三", "STAFF_x", null));

        service().merge(1L, 2L, "STAFF_admin");

        verify(jdbcTemplate).update(contains("user_aro_binding"), eq("STAFF_x"), eq("19digit"));
        verify(jdbcTemplate).update(contains("personnel_merge_log"), eq(1L), eq(2L), any(), any(),
                any(), any(), any(), any(), eq("STAFF_admin"));
    }

    @Test
    void merge_rejects_same_id() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> service().merge(1L, 1L, "STAFF_admin"));
        assertTrue(ex.getMessage().contains("不能合并自己"));
    }

    @Test
    void merge_rejects_missing_row() {
        when(personnelMapper.findById(1L)).thenReturn(row(1L, "张三", null, "19digit"));
        when(personnelMapper.findById(2L)).thenReturn(null);

        assertThrows(IllegalArgumentException.class, () -> service().merge(1L, 2L, "STAFF_admin"));
    }
}

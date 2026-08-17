package com.example.demo.modules.institution.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.institution.entity.Institution;
import com.example.demo.modules.institution.mapper.InstitutionMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class InstitutionService {

    private final InstitutionMapper institutionMapper;

    public InstitutionService(InstitutionMapper institutionMapper) {
        this.institutionMapper = institutionMapper;
    }

    /** 启用中的院校（下拉/人员归属选择用） */
    public List<Institution> listActive() {
        return institutionMapper.listActive();
    }

    public List<Institution> listAll() {
        return institutionMapper.listAll();
    }

    @Transactional
    public Institution create(String code, String name, String type, Integer sortOrder) {
        if (code == null || code.isBlank()) {
            throw new TwinBusinessException(400, "院校 code 不能为空");
        }
        if (name == null || name.isBlank()) {
            throw new TwinBusinessException(400, "院校名称不能为空");
        }
        if (institutionMapper.findByCode(code.trim()) != null) {
            throw new TwinBusinessException(400, "院校 code 已存在: " + code.trim());
        }
        Institution inst = new Institution();
        inst.setCode(code.trim());
        inst.setName(name.trim());
        inst.setType(type);
        inst.setSortOrder(sortOrder != null ? sortOrder : 0);
        inst.setActive(1);
        institutionMapper.insert(inst);
        return inst;
    }

    @Transactional
    public Institution update(Long id, String name, String type, Integer sortOrder, Integer active) {
        Institution inst = institutionMapper.findById(id);
        if (inst == null) {
            throw new TwinBusinessException(404, "院校不存在: " + id);
        }
        if (name != null && !name.isBlank()) {
            inst.setName(name.trim());
        }
        if (type != null) {
            inst.setType(type);
        }
        if (sortOrder != null) {
            inst.setSortOrder(sortOrder);
        }
        if (active != null) {
            inst.setActive(active);
        }
        institutionMapper.update(inst);
        return inst;
    }

    @Transactional
    public void delete(Long id) {
        if (institutionMapper.findById(id) == null) {
            throw new TwinBusinessException(404, "院校不存在: " + id);
        }
        institutionMapper.deleteById(id);
    }
}

package com.example.demo.modules.policy.mapper;

import com.example.demo.modules.policy.entity.BizCapabilityPolicy;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface BizCapabilityPolicyMapper {

    List<BizCapabilityPolicy> selectAll();

    BizCapabilityPolicy selectByDomain(@Param("bizDomain") String bizDomain);

    int updatePolicy(@Param("row") BizCapabilityPolicy row);

    long sumPolicyVersions();
}

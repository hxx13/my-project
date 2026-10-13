-- 禁改（关键信息，禁止修改）
UPDATE form_field SET config = JSON_SET(
    CASE WHEN config IS NULL OR config = '' OR NOT JSON_VALID(config) THEN '{}' ELSE config END,
    '$.amendmentLevel', 'LOCKED')
WHERE (field_key IN ('0.oldRegNo', '0.regNo', 'A1.name', 'A1.no', 'A2.employeeNo', 'A2.leader', 'F.leaderSignature'))
  AND JSON_EXTRACT(CASE WHEN config IS NULL OR config = '' OR NOT JSON_VALID(config) THEN '{}' ELSE config END, '$.amendmentLevel') IS NULL;

-- 大修（须走「更新版本」重审）
UPDATE form_field SET config = JSON_SET(
    CASE WHEN config IS NULL OR config = '' OR NOT JSON_VALID(config) THEN '{}' ELSE config END,
    '$.amendmentLevel', 'MAJOR')
WHERE (field_key IN ('A1.period', 'A5.approvalDate', 'A5.approvalNo', 'A5.iacucApproved', 'A5.orgLicense', 'A5.orgName', 'A5.scope', 'A7.export', 'A7.exportItems', 'A7.import', 'A7.importItems', 'B1.purpose', 'B3.hasPain', 'B3.painDesc', 'B5.blocks', 'B6.blocks', 'B7.basis', 'B7.basisDesc', 'B8.overview', 'B8.timeline', 'B9.details', 'B9.nonPharma', 'C1.externalTable', 'C1.space', 'C2.detail', 'C2.hasRequest', 'C2.requests', 'C3.detail', 'C3.singleCage', 'D2.confirm', 'D2.detail', 'D2.restraint', 'D3.exempt', 'E2.disposal', 'E2.otherDetail', 'E3.method', 'E3.otherDetail', 'E4.coDept', 'E4.coJobNo', 'E4.coLeader', 'E4.cooperate', 'F.coLeaderName', 'G1.chemicals', 'G1.otherChemicals', 'G2.details', 'H1.none', 'H1.selfTransportDesc', 'H1.transportBy', 'H2.none', 'H2.selfTransportDesc', 'H2.transportBy', 'I2.intraOpDrugs', 'I2.painLevel', 'I2.preOpDrugs', 'I3.anesthesia', 'I3.drugs', 'J2.details', 'L2.reason') OR field_key LIKE 'E1.%' OR field_key LIKE 'L1.%')
  AND JSON_EXTRACT(CASE WHEN config IS NULL OR config = '' OR NOT JSON_VALID(config) THEN '{}' ELSE config END, '$.amendmentLevel') IS NULL;

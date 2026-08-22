import { describe, expect, it } from "vitest";
import type { FormField } from "../../schema/formTemplate";
import { computeDerivedPreview, hasEffectiveFieldValue } from "../nhpAutoGenPreview";
import { resolvePkIdType } from "../nhpPkIdContext";

const pairScoreField: FormField = {
  fieldKey: "D3.01.006",
  label: "配对评分",
  type: "number",
  role: "DERIVED",
  conceptCode: "PAIR_SCORE",
};

const vrField: FormField = {
  fieldKey: "D10.02.006",
  label: "血管阻力",
  type: "number",
  role: "DERIVED",
  conceptCode: "VR",
};

const allPairFields: FormField[] = [
  { fieldKey: "D3.01.003", label: "CDC", type: "select" },
  { fieldKey: "D3.01.004", label: "流式", type: "select" },
  { fieldKey: "D3.01.005", label: "ADCC", type: "select" },
  pairScoreField,
];

const allPerfFields: FormField[] = [
  { fieldKey: "D10.02.002", label: "门静脉流量", type: "number" },
  { fieldKey: "D10.02.004", label: "门静脉压力", type: "number" },
  vrField,
];

describe("resolvePkIdType", () => {
  it("reads roleMeta.pkRule first", () => {
    expect(resolvePkIdType({ fieldKey: "x", label: "x", type: "text", roleMeta: { pkRule: "TX" } })).toBe("TX");
  });

  it("infers ANES from unit when pkRule missing", () => {
    expect(
      resolvePkIdType({
        fieldKey: "D7.01.001",
        label: "麻醉记录ID",
        type: "text",
        role: "PK",
        config: { unit: "ANES-XXX" },
      }),
    ).toBe("ANES");
  });
});

describe("computeDerivedPreview", () => {
  it("computes pairing score from crossmatch results", () => {
    const values = {
      "D3.01.003": "阴性",
      "D3.01.004": "弱阳",
      "D3.01.005": "阳性",
    };
    expect(computeDerivedPreview(pairScoreField, values, allPairFields)).toBe("50.0");
  });

  it("computes vascular resistance as pressure over flow", () => {
    const values = {
      "D10.02.002": 100,
      "D10.02.004": 12,
    };
    expect(computeDerivedPreview(vrField, values, allPerfFields)).toBe("0.12");
  });
});

describe("hasEffectiveFieldValue", () => {
  it("treats auto-gen preview as satisfying required PK", () => {
    const pk: FormField = { fieldKey: "D1.01.001", label: "供体", type: "text", role: "PK" };
    expect(hasEffectiveFieldValue(pk, {}, { "D1.01.001": "DON-FARM26-001" })).toBe(true);
  });
});

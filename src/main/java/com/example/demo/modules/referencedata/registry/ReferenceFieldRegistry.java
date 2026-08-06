package com.example.demo.modules.referencedata.registry;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ReferenceFieldRegistry {

    public static final String TYPE_ANIMAL_BREED = "ANIMAL_BREED";
    public static final String TYPE_ANIMAL_STRAIN = "ANIMAL_STRAIN";
    public static final String TYPE_GENOTYPE = "GENOTYPE";
    public static final String TYPE_SUPPLIER = "SUPPLIER";

    private final Map<String, FieldSchema> registry = new LinkedHashMap<>();

    public ReferenceFieldRegistry() {
        // SUPPLIER: root level, no purchasable, childType=ANIMAL_BREED
        register(TYPE_SUPPLIER, new FieldSchema(
                List.of(
                        new FieldDef("title", "主标题", FieldType.STRING, true),
                        new FieldDef("subtitle", "副标题", FieldType.STRING, false),
                        new FieldDef("address", "地址", FieldType.STRING, false),
                        new FieldDef("phone", "电话", FieldType.STRING, false),
                        new FieldDef("email", "邮箱", FieldType.STRING, false)
                ),
                false,
                null,
                TYPE_ANIMAL_BREED
        ));

        // ANIMAL_BREED: no purchasable, parentType=SUPPLIER, childType=ANIMAL_STRAIN
        register(TYPE_ANIMAL_BREED, new FieldSchema(
                List.of(
                        new FieldDef("title", "主标题", FieldType.STRING, true),
                        new FieldDef("subtitle", "副标题", FieldType.STRING, false),
                        new FieldDef("description", "描述", FieldType.TEXT, false)
                ),
                false,
                TYPE_SUPPLIER,
                TYPE_ANIMAL_STRAIN
        ));

        // ANIMAL_STRAIN: purchasable, parentType=ANIMAL_BREED, childType=GENOTYPE
        register(TYPE_ANIMAL_STRAIN, new FieldSchema(
                List.of(
                        new FieldDef("title", "主标题", FieldType.STRING, true),
                        new FieldDef("subtitle", "副标题", FieldType.STRING, false),
                        new FieldDef("description", "描述", FieldType.TEXT, false),
                        new FieldDef("imageUrl", "图片URL", FieldType.STRING, false),
                        new FieldDef("purchasable", "可订购", FieldType.BOOLEAN, false)
                ),
                true,
                TYPE_ANIMAL_BREED,
                TYPE_GENOTYPE
        ));

        // GENOTYPE: purchasable, parentType=ANIMAL_STRAIN, leaf node
        register(TYPE_GENOTYPE, new FieldSchema(
                List.of(
                        new FieldDef("title", "主标题", FieldType.STRING, true),
                        new FieldDef("subtitle", "副标题", FieldType.STRING, false),
                        new FieldDef("description", "描述", FieldType.TEXT, false),
                        new FieldDef("purchasable", "可订购", FieldType.BOOLEAN, false)
                ),
                true,
                TYPE_ANIMAL_STRAIN,
                null
        ));
    }

    private void register(String typeKey, FieldSchema schema) {
        registry.put(typeKey, schema);
    }

    public FieldSchema getSchema(String typeKey) {
        return registry.get(typeKey);
    }

    public boolean isValidType(String typeKey) {
        return registry.containsKey(typeKey);
    }

    public List<String> getAllTypes() {
        return List.copyOf(registry.keySet());
    }

    public String validate(String typeKey, Map<String, Object> fieldData) {
        FieldSchema schema = registry.get(typeKey);
        if (schema == null) {
            return "未知参考数据类型: " + typeKey;
        }
        if (schema.fields == null || schema.fields.isEmpty()) {
            return null;
        }
        for (FieldDef field : schema.fields) {
            if (field.required) {
                Object value = fieldData == null ? null : fieldData.get(field.name);
                if (value == null || (value instanceof String s && s.isBlank())) {
                    return "必填字段缺失: " + field.label;
                }
            }
        }
        return null;
    }

    public enum FieldType { STRING, TEXT, BOOLEAN, NUMBER }

    public record FieldDef(String name, String label, FieldType type, boolean required) {}

    public record FieldSchema(List<FieldDef> fields, boolean purchasable,
                              String parentType, String childType) {
        public boolean hasParent() { return parentType != null; }
        public boolean hasChild() { return childType != null; }
    }
}

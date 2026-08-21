package com.example.demo.modules.twin.obligation.rule;

import com.example.demo.modules.twin.obligation.support.ObligationSupport;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductionRuleRegistryTest {

    @Test
    void registersExecutableRules() {
        ProductionRuleRegistry registry = new ProductionRuleRegistry(List.of(
                new AnnouncementProductionRule(),
                new UnboundProductionRule()
        ));
        assertEquals(2, registry.all().size());
        var r = registry.execute("ANNOUNCEMENT", new ProductionRule.ProductionContext("test"));
        assertTrue(r.ok());
        assertEquals(ObligationSupport.SOURCE_ANNOUNCEMENT, registry.require("ANNOUNCEMENT").sourceType());
    }
}

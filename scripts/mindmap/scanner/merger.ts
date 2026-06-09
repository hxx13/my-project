import type { MindmapDocument, Domain, ModuleInfo, ScanResult } from '../types.js';
import { updateTimestamp } from '../yaml-io.js';

/**
 * Merge auto-scanned results into an existing MindmapDocument.
 *
 * Golden rules:
 *   1. New domains → append to the list
 *   2. Existing domains → only merge auto-scanned fields
 *   3. Manual-only fields → NEVER touched by scanner:
 *      - name, summary, description, business_rules, business_actors
 *      - data_flows, pending
 *   4. cross_cutting, annotations → NEVER touched
 *   5. Interactions → only add new auto entries, keep all manual ones
 */
export function mergeScanResult(doc: MindmapDocument, scan: ScanResult): MindmapDocument {
  updateTimestamp(doc);

  for (const scannedDomain of scan.domains) {
    const existingIndex = doc.domains.findIndex(d => d.id === scannedDomain.id);

    if (existingIndex === -1) {
      // Brand new domain — add as-is
      doc.domains.push(scannedDomain);
    } else {
      // Existing domain — merge auto fields only
      doc.domains[existingIndex] = mergeDomainAutoFields(
        doc.domains[existingIndex],
        scannedDomain
      );
    }
  }

  return doc;
}

function mergeDomainAutoFields(existing: Domain, scanned: Domain): Domain {
  // ---- Merge modules (auto field) ----
  for (const scannedMod of scanned.modules) {
    const modIndex = existing.modules.findIndex(m => m.package === scannedMod.package);
    if (modIndex === -1) {
      existing.modules.push(scannedMod);
    } else {
      existing.modules[modIndex] = mergeModuleAutoFields(
        existing.modules[modIndex],
        scannedMod
      );
    }
  }

  // ---- Merge frontend pages: only ADD new ones by route ----
  for (const scannedPage of scanned.frontend) {
    if (!existing.frontend.some(p => p.route === scannedPage.route)) {
      existing.frontend.push(scannedPage);
    }
  }

  // ---- Merge interactions: keep ALL manual, add new auto ----
  const manualInteractions = existing.interactions.filter(i => i.source === 'manual');
  const existingAutoKeys = new Set(
    existing.interactions
      .filter(i => i.source === 'auto')
      .map(i => `${i.target}::${i.type}`)
  );

  for (const scannedInt of scanned.interactions) {
    const key = `${scannedInt.target}::${scannedInt.type}`;
    if (!existingAutoKeys.has(key)) {
      manualInteractions.push(scannedInt);
    }
  }
  existing.interactions = manualInteractions;

  return existing;
}

function mergeModuleAutoFields(existing: ModuleInfo, scanned: ModuleInfo): ModuleInfo {
  // ---- Merge controllers: add new, update APIs for existing ----
  for (const scannedCtrl of scanned.controllers) {
    const ctrlIndex = existing.controllers.findIndex(c => c.class === scannedCtrl.class);
    if (ctrlIndex === -1) {
      existing.controllers.push(scannedCtrl);
    } else {
      const existingCtrl = existing.controllers[ctrlIndex];
      const existingApiKeys = new Set(
        existingCtrl.apis.map(a => `${a.method}::${a.full_path}`)
      );
      for (const scannedApi of scannedCtrl.apis) {
        const key = `${scannedApi.method}::${scannedApi.full_path}`;
        if (!existingApiKeys.has(key)) {
          existingCtrl.apis.push(scannedApi);
        }
      }
    }
  }

  // ---- Merge services: add new ones ----
  for (const scannedSvc of scanned.services) {
    if (!existing.services.some(s => s.class === scannedSvc.class)) {
      existing.services.push(scannedSvc);
    }
    // Don't overwrite existing dependencies — they may have been manually adjusted
  }

  // ---- Merge mappers ----
  for (const mapper of scanned.mappers) {
    if (!existing.mappers.includes(mapper)) {
      existing.mappers.push(mapper);
    }
  }

  // ---- Merge entities ----
  for (const scannedEnt of scanned.entities) {
    if (!existing.entities.some(e => e.name === scannedEnt.name)) {
      existing.entities.push(scannedEnt);
    }
  }

  // ---- Merge scheduled tasks ----
  for (const scannedTask of scanned.scheduled_tasks) {
    if (!existing.scheduled_tasks.some(t => t.method === scannedTask.method)) {
      existing.scheduled_tasks.push(scannedTask);
    }
  }

  return existing;
}

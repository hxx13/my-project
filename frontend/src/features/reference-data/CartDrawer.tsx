export interface CartLine {
  id: number;
  key: string;
  itemId: number;
  itemLabel: string;
  specLabel: string;
  qty: number;
  aupRecordId?: number | null;
  aupLabel?: string;
  packageStatus?: string;
  packageRemark?: string | null;
  addedBy: string;
  addedByLabel?: string;
}

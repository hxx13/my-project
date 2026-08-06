// CartDrawer is now inlined in ReferenceDataManager's footer.
// Keeping this file as a re-export for CartLine type.
export interface CartLine {
  key: string;
  itemId: number;
  itemLabel: string;
  specLabel: string;
  qty: number;
  remark: string;
  addedBy: string;
  icon: string;
  imageUrl?: string;
}

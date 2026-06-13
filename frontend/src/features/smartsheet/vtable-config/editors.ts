// frontend/src/features/smartsheet/vtable-config/editors.ts

export interface CellEditContext {
  records: Record<string, unknown>[];
  onCellChange: (rowId: string, columnKey: string, value: unknown, version: number) => Promise<void>;
}

export function createCellEditHandler(ctx: CellEditContext) {
  return async (args: {
    col: number;
    row: number;
    value: unknown;
    oldValue: unknown;
    tableInstance: unknown;
  }) => {
    const record = ctx.records[args.row];
    if (!record) return;

    const rowId = record.__id as string;
    const version = (record.__version as number) ?? 0;

    const table = args.tableInstance as { columns?: { field?: string }[] };
    const colDef = table.columns?.[args.col];
    const columnKey = colDef?.field ?? `col_${args.col}`;

    if (columnKey.startsWith('__')) return; // Skip metadata fields

    await ctx.onCellChange(rowId, columnKey, args.value, version);
  };
}

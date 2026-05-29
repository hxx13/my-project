import * as React from "react"

import { cn } from "@/lib/utils"

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
}

function Table<T>({ columns, data, rowKey, onRowClick }: TableProps<T>) {
  return (
    <div className="w-full overflow-auto rounded-[var(--student-radius-md)] border border-[var(--student-border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--student-canvas-soft-2)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-left font-medium text-[var(--student-body)]",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                "border-b border-[var(--student-hairline)] transition-colors hover:bg-[var(--student-canvas-soft)]",
                onRowClick && "cursor-pointer"
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn("px-4 py-3 text-[var(--student-ink)]", col.className)}
                >
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

Table.displayName = "Table"

export { Table }
export type { Column, TableProps }

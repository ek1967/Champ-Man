import { type ReactNode, useState } from 'react';

export interface Column<Row> {
  id: string;
  label: string;
  title?: string;
  render: (row: Row) => ReactNode;
  /** Value used for sorting; columns without one can't be sorted. */
  sortValue?: (row: Row) => number | string;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

/** Dense data table with click-to-sort headers. */
export function SortableTable<Row>(props: {
  rows: readonly Row[];
  columns: ReadonlyArray<Column<Row>>;
  rowKey: (row: Row) => string;
  rowClassName?: (row: Row) => string;
  initialSort?: { id: string; desc: boolean };
}) {
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(props.initialSort ?? null);
  const column = sort ? props.columns.find((c) => c.id === sort.id) : undefined;
  const rows = column?.sortValue
    ? [...props.rows].sort((a, b) => {
        const va = column.sortValue!(a);
        const vb = column.sortValue!(b);
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return sort!.desc ? -cmp : cmp;
      })
    : props.rows;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {props.columns.map((c) => (
              <th
                key={c.id}
                title={c.title}
                className={`${c.align ?? 'left'} ${c.sortValue ? 'sortable' : ''} ${c.className ?? ''}`}
                onClick={() => {
                  if (!c.sortValue) return;
                  const first = props.rows[0];
                  const numeric = first !== undefined && typeof c.sortValue(first) === 'number';
                  setSort((s) => (s?.id === c.id ? { id: c.id, desc: !s.desc } : { id: c.id, desc: numeric }));
                }}
                aria-sort={sort?.id === c.id ? (sort.desc ? 'descending' : 'ascending') : undefined}
              >
                {c.label}
                {sort?.id === c.id ? (sort.desc ? ' ▾' : ' ▴') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={props.rowKey(row)} className={props.rowClassName?.(row)}>
              {props.columns.map((c) => (
                <td key={c.id} className={`${c.align ?? 'left'} ${c.className ?? ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useId, useState } from 'react';

interface Props {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

/**
 * The table behind a chart.
 *
 * Every chart ships one. It is what makes a value readable when colour is not
 * available — colour blindness, forced-colors, print — and it is the relief
 * channel for any fill that sits below 3:1 on the surface.
 */
export function DataTable({ caption, columns, rows }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        className="viz__table-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide the numbers' : 'Show the numbers'}
      </button>

      <div id={id} hidden={!open}>
        <table className="viz__table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={i}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

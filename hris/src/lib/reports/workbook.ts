/**
 * Workbook formatting layer. The only file in the reports stack that imports
 * ExcelJS — the builders describe columns and hand over plain rows, and this
 * turns them into a formatted sheet.
 *
 * Everything here is presentation. No queries, no business rules: if a number
 * needs deriving it happens in `data.ts`, so the two can change independently.
 */
import { Workbook, type Worksheet } from 'exceljs';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Trace brand primary, as an ARGB literal for ExcelJS fills. */
const BRAND_ARGB = 'FF2C5282';
const HEADER_TEXT_ARGB = 'FFFFFFFF';
const TOTAL_FILL_ARGB = 'FFEDF2F7';

/**
 * How a column's values should read in Excel.
 *
 * `decimal` and `percent` are stored as real numbers (2.5 hours, 0.96) rather
 * than pre-formatted strings, so the reader can sort, filter, average and chart
 * them. That is the whole point of exporting a spreadsheet instead of a PDF.
 *
 * `decimal` covers hours, leave days and balances alike — all half-step values
 * that read best to two places.
 */
export type ColFormat = 'text' | 'date' | 'time' | 'decimal' | 'int' | 'percent';

const NUM_FMT: Record<ColFormat, string | undefined> = {
  text: undefined,
  date: 'dd mmm yyyy',
  time: 'hh:mm AM/PM',
  decimal: '0.00',
  int: '0',
  percent: '0%',
};

export interface Col {
  header: string;
  /** Matches the property name on the row objects passed to `addRows`. */
  key: string;
  width?: number;
  format?: ColFormat;
  /** Include this column in the totals row, summing every data row. */
  total?: boolean;
}

/** A cell value ExcelJS can render without further coercion. */
export type CellValue = string | number | Date | null;
export type Row = Record<string, CellValue>;

export function createWorkbook(): Workbook {
  const wb = new Workbook();
  wb.creator = 'Trace HRIS';
  wb.company = 'Trace Consulting Ltd';
  return wb;
}

/**
 * Adds a sheet with a styled, frozen, filterable header row.
 *
 * `name` is truncated to Excel's 31-character sheet-name limit and stripped of
 * the characters Excel rejects — a name it refuses makes the whole file fail to
 * open, which is a poor way to discover the rule.
 */
export function addSheet(wb: Workbook, name: string, columns: Col[]): Worksheet {
  const sheet = wb.addWorksheet(safeSheetName(name), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? defaultWidth(c),
    style: NUM_FMT[c.format ?? 'text']
      ? { numFmt: NUM_FMT[c.format ?? 'text'] }
      : undefined,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: HEADER_TEXT_ARGB }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 22;

  if (columns.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  return sheet;
}

/** Appends data rows. Column formats come from `addSheet`, so rows stay plain. */
export function addRows(sheet: Worksheet, rows: Row[]): void {
  for (const r of rows) sheet.addRow(r);
}

/**
 * Appends a bold, shaded totals row summing the columns marked `total: true`.
 *
 * Written as a live `SUM()` formula rather than a computed constant so the
 * total still holds if the reader deletes or edits rows — a spreadsheet is an
 * editable document, and a hardcoded total silently becomes a lie.
 *
 * No-ops when there is nothing to total, so callers can pass columns through
 * unconditionally.
 */
export function addTotalsRow(sheet: Worksheet, columns: Col[], label = 'Total'): void {
  const summed = columns.filter((c) => c.total);
  if (summed.length === 0) return;

  const firstDataRow = 2;
  const lastDataRow = sheet.rowCount;
  // rowCount === 1 means the header is alone; SUM over an empty range would
  // reference the totals row itself and produce a circular reference.
  if (lastDataRow < firstDataRow) return;

  const row = sheet.getRow(lastDataRow + 1);

  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    if (c.total) {
      const letter = colLetter(i + 1);
      cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` };
    } else if (i === 0) {
      cell.value = label;
    }
  });

  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL_ARGB } };
  row.commit();
}

/**
 * A two-column `Field | Value` sheet for report metadata and headline figures.
 * Used for the "Summary" sheet every workbook opens on, so the reader sees the
 * period and the scope before any raw rows.
 */
export function addSummarySheet(
  wb: Workbook,
  name: string,
  sections: { heading: string; rows: [string, CellValue][] }[],
): Worksheet {
  const sheet = wb.addWorksheet(safeSheetName(name), {
    views: [{ state: 'frozen', ySplit: 0 }],
  });
  sheet.columns = [
    { key: 'field', width: 32 },
    { key: 'value', width: 42 },
  ];

  for (const section of sections) {
    const head = sheet.addRow({ field: section.heading });
    head.font = { bold: true, color: { argb: HEADER_TEXT_ARGB }, size: 11 };
    head.getCell(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB },
    };
    head.getCell(2).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB },
    };

    for (const [field, value] of section.rows) {
      const row = sheet.addRow({ field, value });
      row.getCell(1).font = { bold: true };
      // Percentages arrive as fractions; anything else numeric is a plain count.
      if (typeof value === 'number' && field.includes('%')) {
        row.getCell(2).numFmt = '0%';
      }
    }
    sheet.addRow({});
  }

  return sheet;
}

/**
 * Serialises the workbook into an XLSX download response.
 *
 * `writeBuffer()` is typed as returning ExcelJS's own `Buffer` declaration
 * (`declare interface Buffer extends ArrayBuffer`), which does not line up with
 * Node's Buffer. Wrapping in `Uint8Array` is byte-correct either way and is
 * what the Response body actually wants.
 */
export async function xlsxResponse(wb: Workbook, filename: string): Promise<Response> {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as unknown as ArrayBuffer), {
    status: 200,
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

// ─── internals ────────────────────────────────────────────

/**
 * Excel rejects sheet names over 31 characters or containing : \ / ? * [ ],
 * and refuses to open a file that contains one. Names are authored in code, so
 * this is a guard against a future rename, not against user input.
 */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Sheet';
}

/** Widths that fit the content without a manual pass over every column. */
function defaultWidth(c: Col): number {
  switch (c.format) {
    case 'date': return 14;
    case 'time': return 12;
    case 'decimal': return 11;
    case 'int': return 10;
    case 'percent': return 10;
    default: return Math.max(12, Math.min(40, c.header.length + 4));
  }
}

/** 1 → A, 27 → AA. Needed for the SUM() ranges in the totals row. */
function colLetter(index: number): string {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

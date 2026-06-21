export function getSpreadsheetColumnLabel(columnIndex: number): string {
  if (!Number.isInteger(columnIndex) || columnIndex < 0) {
    throw new RangeError("Spreadsheet column index must be a non-negative integer.");
  }

  let columnNumber = columnIndex + 1;
  let label = "";

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return label;
}

export function parseSpreadsheetColumnReference(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (!/^[A-Za-z]+$/.test(trimmed)) {
    return null;
  }

  let columnNumber = 0;
  for (const char of trimmed.toUpperCase()) {
    columnNumber = columnNumber * 26 + (char.charCodeAt(0) - 64);
  }

  return columnNumber - 1;
}

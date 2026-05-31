import ExcelJS from "exceljs";

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * 產生單一 sheet 的 xlsx Buffer
 */
export async function makeXlsxBuffer(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, string | number | null | undefined>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "海王子潛水團";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);

  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 14,
  }));

  // 表頭樣式
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0A2342" }, // ocean deep
  };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 22;

  // 寫入資料
  for (const row of rows) {
    ws.addRow(row);
  }

  // 全部欄位置中
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    row.alignment = { vertical: "middle", horizontal: "left" };
    row.height = 18;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * 多 sheet 的 xlsx Buffer
 */
export async function makeMultiSheetXlsxBuffer(
  sheets: Array<{
    name: string;
    columns: ExcelColumn[];
    rows: Record<string, string | number | null | undefined>[];
  }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "海王子潛水團";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 14,
    }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0A2342" },
    };
    ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(1).height = 22;
    for (const row of sheet.rows) ws.addRow(row);
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      row.alignment = { vertical: "middle", horizontal: "left" };
      row.height = 18;
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

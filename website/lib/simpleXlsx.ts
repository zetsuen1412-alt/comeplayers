import { strToU8, zipSync } from "fflate";

export type SpreadsheetValue = string | number | boolean | null | undefined;

type SpreadsheetColumn = {
  header: string;
  width: number;
};

export type SpreadsheetListValidation = {
  column: number;
  name: string;
  values: string[];
  allowBlank?: boolean;
  inputTitle?: string;
  inputMessage?: string;
  errorTitle?: string;
  errorMessage?: string;
};

type SpreadsheetOptions = {
  sheetName: string;
  title: string;
  columns: SpreadsheetColumn[];
  rows: SpreadsheetValue[][];
  listValidations?: SpreadsheetListValidation[];
  maxDataRows?: number;
};

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function safeSheetName(value: string) {
  return value.replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Data";
}

function safeDefinedName(value: string, index: number) {
  const normalized = value.replace(/[^A-Za-z0-9_.]/g, "_");
  if (/^[A-Za-z_\\][A-Za-z0-9_.]*$/.test(normalized)) return normalized;
  return `_Options${index + 1}`;
}

function cellXml(value: SpreadsheetValue, reference: string, style: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    value
  )}</t></is></c>`;
}

export function createSimpleXlsx({
  sheetName,
  title,
  columns,
  rows,
  listValidations = [],
  maxDataRows = 200,
}: SpreadsheetOptions) {
  const safeName = safeSheetName(sheetName);
  const optionsSheetName = safeName.toLowerCase() === "options" ? "Lists" : "Options";
  const normalizedValidations = listValidations
    .filter((validation) => validation.column >= 0 && validation.column < columns.length)
    .map((validation, index) => ({
      ...validation,
      name: safeDefinedName(validation.name, index),
      values: Array.from(
        new Map(
          validation.values
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
            .map((value) => [value.toLocaleLowerCase(), value])
        ).values()
      ),
    }))
    .filter((validation) => validation.values.length > 0);
  const hasOptionsSheet = normalizedValidations.length > 0;
  const lastColumn = columnName(Math.max(columns.length - 1, 0));
  const lastRow = Math.max(rows.length + 1, 1);
  const validationLastRow = Math.max(2, Math.floor(maxDataRows) + 1);
  const columnXml = columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${Math.max(
          8,
          Math.min(column.width, 80)
        )}" customWidth="1"/>`
    )
    .join("");
  const headerCells = columns
    .map((column, index) => cellXml(column.header, `${columnName(index)}1`, 1))
    .join("");
  const dataRows = rows
    .map((row, rowIndex) => {
      const number = rowIndex + 2;
      const style = rowIndex % 2 === 0 ? 2 : 3;
      const cells = columns
        .map((_, columnIndex) =>
          cellXml(row[columnIndex], `${columnName(columnIndex)}${number}`, style)
        )
        .join("");
      return `<row r="${number}" ht="30" customHeight="1">${cells}</row>`;
    })
    .join("");
  const validationXml = normalizedValidations.length
    ? `<dataValidations count="${normalizedValidations.length}">${normalizedValidations
        .map((validation) => {
          const column = columnName(validation.column);
          return `<dataValidation type="list" allowBlank="${
            validation.allowBlank === false ? 0 : 1
          }" showInputMessage="1" showErrorMessage="1" errorStyle="stop" errorTitle="${escapeXml(
            validation.errorTitle || "Invalid value"
          )}" error="${escapeXml(
            validation.errorMessage || "Choose a value from the dropdown list."
          )}" promptTitle="${escapeXml(
            validation.inputTitle || columns[validation.column]?.header || "Choose a value"
          )}" prompt="${escapeXml(
            validation.inputMessage || "Select a value from the dropdown list."
          )}" sqref="${column}2:${column}${validationLastRow}"><formula1>${escapeXml(
            validation.name
          )}</formula1></dataValidation>`;
        })
        .join("")}</dataValidations>`
    : "";

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnXml}</cols>
  <sheetData><row r="1" ht="32" customHeight="1">${headerCells}</row>${dataRows}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
  ${validationXml}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;

  const optionsRowCount = Math.max(
    1,
    ...normalizedValidations.map((validation) => validation.values.length)
  );
  const optionsLastColumn = columnName(Math.max(normalizedValidations.length - 1, 0));
  const optionsRows = Array.from({ length: optionsRowCount }, (_, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = normalizedValidations
      .map((validation, columnIndex) => {
        const value = validation.values[rowIndex];
        return value === undefined
          ? ""
          : cellXml(value, `${columnName(columnIndex)}${rowNumber}`, 0);
      })
      .join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  const optionsWorksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${optionsLastColumn}${optionsRowCount}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <sheetData>${optionsRows}</sheetData>
</worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FF050816"/><sz val="11"/><name val="Aptos Display"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFCC00"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F7FC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFDCE3ED"/></left><right style="thin"><color rgb="FFDCE3ED"/></right><top style="thin"><color rgb="FFDCE3ED"/></top><bottom style="thin"><color rgb="FFDCE3ED"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="0"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="0"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <fileVersion appName="ComePlayers"/>
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
  <sheets><sheet name="${escapeXml(safeName)}" sheetId="1" r:id="rId1"/>${
    hasOptionsSheet
      ? `<sheet name="${escapeXml(optionsSheetName)}" sheetId="2" state="hidden" r:id="rId2"/>`
      : ""
  }</sheets>
  ${
    hasOptionsSheet
      ? `<definedNames>${normalizedValidations
          .map(
            (validation, index) =>
              `<definedName name="${escapeXml(validation.name)}">&apos;${escapeXml(
                optionsSheetName
              )}&apos;!$${columnName(index)}$1:$${columnName(index)}$${
                validation.values.length
              }</definedName>`
          )
          .join("")}</definedNames>`
      : ""
  }
  <calcPr calcId="191029"/>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  ${
    hasOptionsSheet
      ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
      : ""
  }
  <Relationship Id="${hasOptionsSheet ? "rId3" : "rId2"}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  ${
    hasOptionsSheet
      ? '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      : ""
  }
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const timestamp = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title><dc:creator>ComePlayers</dc:creator><cp:lastModifiedBy>ComePlayers</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ComePlayers</Application><AppVersion>1.0</AppVersion></Properties>`;

  const archive: Record<string, Uint8Array> = {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rootRels),
      "docProps/core.xml": strToU8(core),
      "docProps/app.xml": strToU8(app),
      "xl/workbook.xml": strToU8(workbook),
      "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
      "xl/styles.xml": strToU8(styles),
      "xl/worksheets/sheet1.xml": strToU8(worksheet),
  };
  if (hasOptionsSheet) {
    archive["xl/worksheets/sheet2.xml"] = strToU8(optionsWorksheet);
  }

  return zipSync(archive, { level: 6 });
}

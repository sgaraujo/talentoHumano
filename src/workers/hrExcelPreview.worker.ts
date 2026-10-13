/// <reference lib="webworker" />

import * as XLSX from 'xlsx';
import {
  ACCOUNT_MAPPING_SHEET, analyzeHrRows, buildHrImportPlan, HR_DATE_COLUMNS, STANDARD_ACCOUNT_COLUMN,
} from '@/domain/humanResources/hrExcelPreview';

type PreviewRequest = {
  fileName: string;
  buffer: ArrayBuffer;
  existingUsers: any[];
  mode?: 'preview' | 'apply';
};

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<PreviewRequest>) => {
  try {
    worker.postMessage({ type: 'progress', label: 'Leyendo estructura del Excel' });
    // Sin cellDates: las fechas reales llegan como número serial de Excel (cell.v),
    // que se convierte sin depender del formato visual de la celda.
    const workbook = XLSX.read(event.data.buffer);
    const sheetName = 'BD - DIRECTOS';
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) throw new Error(`El archivo no contiene la hoja obligatoria "${sheetName}".`);

    worker.postMessage({ type: 'progress', label: 'Consolidando historial laboral' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: false,
    });
    // El texto formateado (cell.w) de las fechas depende del formato de cada
    // celda, y la hoja mezcla m/d/aaaa con d/m/aaaa. Para las columnas de fecha
    // se usa el valor sin formato: el serial de Excel, o el texto si la celda es texto.
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: null, raw: true });
    // SheetJS agrega __rowNum__ (no enumerable) a cada fila: permite emparejar ambas lecturas.
    const rowNumber = (row: Record<string, unknown>) => (row as { __rowNum__?: number }).__rowNum__;
    const rawByRowNumber = new Map(rawRows.map(row => [rowNumber(row), row]));
    rows.forEach(row => {
      const raw = rawByRowNumber.get(rowNumber(row));
      if (!raw) return;
      HR_DATE_COLUMNS.forEach(column => { if (column in raw) row[column] = raw[column]; });
    });

    // La hoja "Mapeo Cuentas Analiticas" (original → estándar) alimenta la columna
    // CUENTA ANALITICA ESTANDAR, que es una fórmula: si el archivo no se guardó
    // desde Excel, la fórmula no trae valor y se aplica aquí el mismo mapeo.
    const mappingSheet = workbook.Sheets[ACCOUNT_MAPPING_SHEET];
    if (mappingSheet) {
      const mapping = new Map(XLSX.utils.sheet_to_json<Record<string, unknown>>(mappingSheet, { range: 5, defval: null })
        .map(item => [String(item['CUENTA ANALITICA ORIGINAL'] ?? '').trim(), String(item['CUENTA ANALITICA ESTANDAR'] ?? '').trim()] as const)
        .filter(([original, standard]) => original && standard));
      rows.forEach(row => {
        if (String(row[STANDARD_ACCOUNT_COLUMN] ?? '').trim()) return;
        const standard = mapping.get(String(row['CUENTA ANALITICA'] ?? '').trim());
        if (standard) row[STANDARD_ACCOUNT_COLUMN] = standard;
      });
    }
    if (event.data.mode === 'apply') {
      worker.postMessage({ type: 'progress', label: 'Preparando expedientes y relaciones' });
      worker.postMessage({ type: 'complete', plan: buildHrImportPlan(event.data.fileName, rows, event.data.existingUsers) });
    } else {
      const preview = analyzeHrRows(event.data.fileName, rows, event.data.existingUsers);
      worker.postMessage({ type: 'complete', preview });
    }
  } catch (error: any) {
    worker.postMessage({
      type: 'error',
      message: error?.message || 'No fue posible analizar el archivo.',
    });
  }
};

export {};

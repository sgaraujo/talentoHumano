/// <reference lib="webworker" />

import * as XLSX from 'xlsx';
import { analyzeHrRows, buildHrImportPlan } from '@/domain/humanResources/hrExcelPreview';

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
    const workbook = XLSX.read(event.data.buffer, { cellDates: true });
    const sheetName = 'BD - DIRECTOS';
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) throw new Error(`El archivo no contiene la hoja obligatoria "${sheetName}".`);

    worker.postMessage({ type: 'progress', label: 'Consolidando historial laboral' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
      raw: false,
    });
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

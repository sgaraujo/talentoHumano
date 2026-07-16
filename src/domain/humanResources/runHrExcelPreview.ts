import type { HrExcelPreview, HrImportPlan } from './hrExcelPreview';

export async function runHrExcelPreview(
  file: File,
  existingUsers: any[],
  onProgress?: (label: string) => void,
): Promise<HrExcelPreview> {
  onProgress?.('Preparando archivo');
  const buffer = await file.arrayBuffer();
  // Enviar al worker solo los campos necesarios para comparar. Evita clonar
  // expedientes completos (salario, banco, cuestionarios, etc.).
  const comparisonUsers = existingUsers.map(user => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    personalData: {
      documentNumber: user.personalData?.documentNumber,
      position: user.personalData?.position,
    },
    location: {
      corporateEmail: user.location?.corporateEmail,
      personalEmail: user.location?.personalEmail,
    },
    contractInfo: {
      assignment: {
        company: user.contractInfo?.assignment?.company,
        project: user.contractInfo?.assignment?.project,
        position: user.contractInfo?.assignment?.position,
      },
      contract: {
        contractType: user.contractInfo?.contract?.contractType,
      },
    },
  }));

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../../workers/hrExcelPreview.worker.ts', import.meta.url),
      { type: 'module' },
    );

    const finish = () => worker.terminate();
    worker.onerror = event => {
      finish();
      reject(new Error(event.message || 'El analizador del Excel dejó de responder.'));
    };
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.label);
        return;
      }
      finish();
      if (message.type === 'complete') resolve(message.preview);
      else reject(new Error(message.message || 'No fue posible analizar el archivo.'));
    };

    worker.postMessage({ fileName: file.name, buffer, existingUsers: comparisonUsers }, [buffer]);
  });
}

export async function runHrExcelImportPlan(
  file: File,
  existingUsers: any[],
  onProgress?: (label: string) => void,
): Promise<HrImportPlan> {
  onProgress?.('Preparando importación');
  const buffer = await file.arrayBuffer();
  const comparisonUsers = existingUsers.map(user => ({
    id: user.id,
    personalData: { documentNumber: user.personalData?.documentNumber },
    location: { corporateEmail: user.location?.corporateEmail, personalEmail: user.location?.personalEmail },
  }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/hrExcelPreview.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => worker.terminate();
    worker.onerror = event => { finish(); reject(new Error(event.message || 'El importador dejó de responder.')); };
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'progress') return onProgress?.(message.label);
      finish();
      if (message.type === 'complete') resolve(message.plan);
      else reject(new Error(message.message || 'No fue posible preparar la importación.'));
    };
    worker.postMessage({ fileName: file.name, buffer, existingUsers: comparisonUsers, mode: 'apply' }, [buffer]);
  });
}

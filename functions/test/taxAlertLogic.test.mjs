import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAlertCuts, displayPeriod, periodKey, shouldIncludeManualAlert } from '../lib/taxAlertLogic.js';

test('detecta obligaciones nuevas y las que ya no requieren alerta', () => {
  const result = compareAlertCuts(['continua', 'nueva'], [
    { obligationId: 'continua', recipientEmails: ['admin@empresa.com'] },
    { obligationId: 'resuelta', recipientEmails: ['admin@empresa.com'] },
  ], 'admin@empresa.com');

  assert.deepEqual([...result.newIds], ['nueva']);
  assert.deepEqual(result.noLongerAlerted.map(item => item.obligationId), ['resuelta']);
});

test('no mezcla el historial de destinatarios diferentes', () => {
  const result = compareAlertCuts(['compartida'], [
    { obligationId: 'compartida', recipientEmails: ['otro@empresa.com'] },
  ], 'asesor@empresa.com');

  assert.deepEqual([...result.newIds], ['compartida']);
  assert.deepEqual(result.noLongerAlerted, []);
});

test('el historial antiguo sirve para novedades pero no para falsos resueltos', () => {
  const result = compareAlertCuts(['existente', 'nueva'], [
    { obligationId: 'existente' },
    { obligationId: 'antigua' },
  ], 'admin@empresa.com');

  assert.deepEqual([...result.newIds], ['nueva']);
  assert.deepEqual(result.noLongerAlerted, []);
});

test('incluye una obligación manual vencida sin exigir calendario automático pendiente', () => {
  assert.equal(shouldIncludeManualAlert({
    companyMatches: true,
    resolved: false,
    representedByCalendar: false,
    hasCompletedDuplicate: false,
    dueDate: '2026-07-31',
    today: '2026-08-11',
    overdueFrom: '2026-06-01',
    upcomingWindow: 7,
  }), true);
});

test('excluye manuales resueltas, duplicadas o fuera de la ventana', () => {
  const base = {
    companyMatches: true, resolved: false, representedByCalendar: false,
    hasCompletedDuplicate: false, today: '2026-08-11',
    overdueFrom: '2026-06-01', upcomingWindow: 7,
  };
  assert.equal(shouldIncludeManualAlert({ ...base, resolved: true, dueDate: '2026-07-31' }), false);
  assert.equal(shouldIncludeManualAlert({ ...base, hasCompletedDuplicate: true, dueDate: '2026-07-31' }), false);
  assert.equal(shouldIncludeManualAlert({ ...base, dueDate: '2026-08-19' }), false);
});

test('generaliza variantes mensuales y bimestrales al mismo periodo', () => {
  assert.equal(periodKey('Mensual-7'), periodKey('Julio'));
  assert.equal(periodKey('Bim 3'), periodKey('Bimestre 3'));
  assert.equal(periodKey('Bim 3'), periodKey('ICA Bim 3 (May-Jun)'));
  assert.equal(periodKey('Bim 3'), periodKey('IVA Bim 3 (May-Jun)'));
  assert.equal(displayPeriod('ICA Bim 3 (May-Jun)'), 'Bimestre 3');
  assert.equal(periodKey('Sem 1'), periodKey('Semestre-1 (Ene-Jun)'));
  assert.equal(displayPeriod('Semestre-2 (Jul-Dic)'), 'Semestre 2');
});

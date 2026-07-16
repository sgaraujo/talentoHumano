import XLSX from 'xlsx';
import { basename, resolve } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Uso: node scripts/diagnose-hr-excel.mjs <archivo.xlsx>');
  process.exit(1);
}

const filePath = resolve(input);
const workbook = XLSX.readFile(filePath, { cellDates: true });
const sheetName = 'BD - DIRECTOS';
const worksheet = workbook.Sheets[sheetName];

if (!worksheet) {
  console.error(`No se encontró la hoja obligatoria "${sheetName}".`);
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });
const normalizeText = value => String(value ?? '').trim();
const normalizeDocument = value => normalizeText(value).replace(/\D/g, '');
const normalizeEmail = value => normalizeText(value).toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isRetired = value => {
  const status = normalizeText(value).toLowerCase();
  return ['retirad', 'inactiv', 'terminad', 'finalizad', 'anulad'].some(token => status.includes(token));
};

const requiredColumns = ['CEDULA', 'APELLIDOS Y NOMBRES', 'ESTADO', 'EMPRESA'];
const headers = rows[0] ? Object.keys(rows[0]).filter(header => !header.startsWith('__EMPTY')) : [];
const missingColumns = requiredColumns.filter(column => !headers.includes(column));
const documents = new Map();
const emails = new Map();
const issues = [];
let active = 0;
let retired = 0;
let valid = 0;

rows.forEach((row, index) => {
  const rowNumber = index + 2;
  const documentNumber = normalizeDocument(row.CEDULA);
  const corporateEmail = normalizeEmail(row['CORREO CORPORATIVO']);
  const personalEmail = normalizeEmail(row['CORREO ELECTRONICO PERSONAL']);
  const primaryEmail = corporateEmail || personalEmail;
  const fullName = normalizeText(row['APELLIDOS Y NOMBRES']);

  const rowIssues = [];
  if (!documentNumber) rowIssues.push('missing_document');
  if (!fullName) rowIssues.push('missing_name');
  if (!primaryEmail) rowIssues.push('missing_email');
  else if (!validEmail(primaryEmail)) rowIssues.push('invalid_email');

  if (documentNumber) {
    if (!documents.has(documentNumber)) documents.set(documentNumber, []);
    documents.get(documentNumber).push({ row: rowNumber, retired: isRetired(row.ESTADO) });
  }
  for (const email of new Set([corporateEmail, personalEmail].filter(Boolean))) {
    if (!emails.has(email)) emails.set(email, []);
    emails.get(email).push({ row: rowNumber, retired: isRetired(row.ESTADO) });
  }

  if (isRetired(row.ESTADO)) retired++;
  else active++;
  if (rowIssues.length === 0) valid++;
  else issues.push({ row: rowNumber, codes: rowIssues });
});

const duplicateDocuments = [...documents.values()].filter(list => list.length > 1);
const duplicateEmails = [...emails.values()].filter(list => list.length > 1);
const activeDocumentConflicts = duplicateDocuments.filter(list => list.filter(item => !item.retired).length > 1);
const activeEmailConflicts = duplicateEmails.filter(list => list.filter(item => !item.retired).length > 1);
const issueCounts = issues.flatMap(issue => issue.codes).reduce((acc, code) => {
  acc[code] = (acc[code] ?? 0) + 1;
  return acc;
}, {});

const result = {
  file: basename(filePath),
  sheet: sheetName,
  rows: rows.length,
  columns: headers.length,
  missingRequiredColumns: missingColumns,
  validRows: valid,
  rejectedOrReviewRows: issues.length,
  status: { active, retired },
  duplicates: {
    documentGroups: duplicateDocuments.length,
    emailGroups: duplicateEmails.length,
    activeDocumentConflictGroups: activeDocumentConflicts.length,
    activeEmailConflictGroups: activeEmailConflicts.length,
  },
  issueCounts,
  reviewRowNumbers: issues.slice(0, 100).map(issue => issue.row),
  note: 'Diagnóstico local: no escribe en Firebase ni imprime datos personales.',
};

console.log(JSON.stringify(result, null, 2));
if (missingColumns.length > 0 || duplicateDocuments.length > 0) process.exitCode = 2;

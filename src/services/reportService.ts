import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── helpers ───────────────────────────────────────────────────────────────────

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('es-CO');
}

function rotacionLabel(pct: number): string {
  if (pct <= 3)  return 'Óptima';
  if (pct <= 7)  return 'Moderada';
  if (pct <= 12) return 'Alta';
  return 'Crítica';
}

function rotacionColor(pct: number): [number, number, number] {
  if (pct <= 3)  return [22, 163, 74];
  if (pct <= 7)  return [202, 138, 4];
  if (pct <= 12) return [234, 88, 12];
  return [220, 38, 38];
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ── main export ───────────────────────────────────────────────────────────────

export function generateMonthlyReport(params: {
  users: any[];
  movements: any[];
  companies: any[];
  projects: any[];
  month: number;  // 0-indexed
  year: number;
}) {
  const { users, movements, companies, projects, month, year } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const GREEN: [number,number,number]  = [0, 140, 60];
  const DARK:  [number,number,number]  = [74, 74, 74];
  const LIGHT: [number,number,number]  = [245, 247, 250];
  const monthName = MONTH_NAMES[month];

  // ── Filter movements for this month ────────────────────────────────────────
  const movsMonth = movements.filter(m => {
    const d = toDate(m.date);
    return d && d.getMonth() === month && d.getFullYear() === year;
  });
  const ingresos = movsMonth.filter(m => m.type === 'ingreso');
  const retiros  = movsMonth.filter(m => m.type === 'retiro');

  const colaboradores   = users.filter(u => u.role === 'colaborador').length;
  const aspirantes      = users.filter(u => u.role === 'aspirante').length;
  const excolaboradores = users.filter(u => u.role === 'excolaborador').length;
  const rotacionPct     = colaboradores > 0
    ? Math.round((retiros.length / colaboradores) * 1000) / 10
    : 0;

  const salarios = users
    .filter(u => u.role === 'colaborador')
    .map(u => u.salaryInfo?.baseSalary || u.contractInfo?.workConditions?.baseSalary || 0)
    .filter(s => s > 0);
  const salarioPromedio = salarios.length > 0
    ? salarios.reduce((a, b) => a + b, 0) / salarios.length
    : 0;
  const costoRotacion = Math.round(retiros.length * 1.5 * salarioPromedio);

  // ── Page helpers ───────────────────────────────────────────────────────────
  let pageNum = 1;
  const addPageNumber = () => {
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Página ${pageNum}`, W - 14, H - 8, { align: 'right' });
    doc.text('Nelyoda · Reporte Confidencial', 14, H - 8);
  };

  const addHeader = (title: string) => {
    // Green bar
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, W, 18, 'F');
    // Logo text
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('NELYODA', 14, 12);
    // Title
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(title, W - 14, 12, { align: 'right' });
  };

  const newPage = (title: string) => {
    addPageNumber();
    doc.addPage();
    pageNum++;
    addHeader(title);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Portada
  // ══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 60, 'F');

  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('NELYODA', 14, 22);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Gestión de Talento Humano', 14, 30);

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Informe Mensual de Rotación', 14, 44);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(`${monthName} ${year}`, 14, 52);

  // Date generated
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text(`Generado el ${fmt(new Date())}`, W - 14, 56, { align: 'right' });

  // Summary box
  const boxY = 70;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, boxY, W - 28, 56, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Resumen Ejecutivo', 20, boxY + 9);

  const kpis = [
    ['Colaboradores activos', colaboradores.toString()],
    ['Aspirantes',            aspirantes.toString()],
    ['Ex-colaboradores',      excolaboradores.toString()],
    ['Ingresos del mes',      ingresos.length.toString()],
    ['Retiros del mes',       retiros.length.toString()],
    ['% Rotación',            `${rotacionPct}% — ${rotacionLabel(rotacionPct)}`],
    ['Costo est. rotación',   costoRotacion > 0 ? fmtMoney(costoRotacion) : '—'],
    ['Empresas',              companies.length.toString()],
    ['Proyectos activos',     projects.filter(p => p.status === 'activo').length.toString()],
  ];

  const col1X = 20, col2X = 105, colW = 80;
  kpis.forEach(([label, val], i) => {
    const col = i < 5 ? 0 : 1;
    const row = i < 5 ? i : i - 5;
    const x = col === 0 ? col1X : col2X;
    const y = boxY + 17 + row * 7;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(val, x + colW, y, { align: 'right' });
  });

  // Semáforo visual
  const [sr, sg, sb] = rotacionColor(rotacionPct);
  const semaforoY = boxY + 68;
  doc.setFillColor(sr, sg, sb);
  doc.circle(20, semaforoY, 4, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(sr, sg, sb);
  doc.text(`Rotación ${rotacionLabel(rotacionPct)} (${rotacionPct}%)`, 27, semaforoY + 1.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120,120,120);
  doc.text('Referencia: ≤3% Óptima · ≤7% Moderada · ≤12% Alta · >12% Crítica', 14, semaforoY + 9);

  addPageNumber();

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Headcount por empresa
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  let y = 28;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Headcount por Empresa', 14, y);

  // Build headcount table
  const empMap = new Map<string, { colaboradores: number; aspirantes: number; exco: number }>();
  users.forEach(u => {
    const emp = u.contractInfo?.assignment?.company || 'Sin empresa';
    if (!empMap.has(emp)) empMap.set(emp, { colaboradores: 0, aspirantes: 0, exco: 0 });
    const e = empMap.get(emp)!;
    if (u.role === 'colaborador')  e.colaboradores++;
    if (u.role === 'aspirante')    e.aspirantes++;
    if (u.role === 'excolaborador') e.exco++;
  });

  const empRows = [...empMap.entries()]
    .map(([name, d]) => [
      name,
      d.colaboradores.toString(),
      d.aspirantes.toString(),
      d.exco.toString(),
      (d.colaboradores + d.aspirantes).toString(),
    ])
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  autoTable(doc, {
    startY: y + 6,
    head: [['Empresa', 'Colaboradores', 'Aspirantes', 'Ex-colab.', 'Total activos']],
    body: empRows,
    foot: [['TOTAL',
      empRows.reduce((s, r) => s + Number(r[1]), 0).toString(),
      empRows.reduce((s, r) => s + Number(r[2]), 0).toString(),
      empRows.reduce((s, r) => s + Number(r[3]), 0).toString(),
      empRows.reduce((s, r) => s + Number(r[4]), 0).toString(),
    ]],
    theme: 'striped',
    headStyles: { fillColor: GREEN, textColor: [255,255,255], fontSize: 9, fontStyle: 'bold' },
    footStyles: { fillColor: [230,230,230], textColor: DARK, fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Headcount por proyecto ────────────────────────────────────────────────
  const afterEmp = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Headcount por Proyecto', 14, afterEmp);

  const projMap = new Map<string, { empresa: string; count: number }>();
  users.filter(u => u.role === 'colaborador').forEach(u => {
    const proj = u.contractInfo?.assignment?.project || 'Sin proyecto';
    const emp  = u.contractInfo?.assignment?.company  || '';
    if (!projMap.has(proj)) projMap.set(proj, { empresa: emp, count: 0 });
    projMap.get(proj)!.count++;
  });

  const projRows = [...projMap.entries()]
    .map(([name, d]) => [name, d.empresa, d.count.toString()])
    .sort((a, b) => Number(b[2]) - Number(a[2]));

  autoTable(doc, {
    startY: afterEmp + 5,
    head: [['Proyecto', 'Empresa', 'Colaboradores']],
    body: projRows,
    theme: 'striped',
    headStyles: { fillColor: [31, 143, 191], textColor: [255,255,255], fontSize: 9, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 70 },
      2: { halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Ingresos del mes
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  y = 28;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...GREEN);
  doc.text(`Ingresos del mes — ${monthName} ${year} (${ingresos.length})`, 14, y);

  if (ingresos.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(160,160,160);
    doc.setFont('helvetica', 'normal');
    doc.text('Sin ingresos registrados este mes.', 14, y + 10);
  } else {
    autoTable(doc, {
      startY: y + 6,
      head: [['Nombre', 'Empresa', 'Proyecto', 'Fecha ingreso']],
      body: ingresos.map(m => [
        m.userName || '—',
        m.company  || '—',
        m.project  || m.area || '—',
        fmt(toDate(m.date)),
      ]),
      theme: 'striped',
      headStyles: { fillColor: GREEN, textColor: [255,255,255], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 55 },
        2: { cellWidth: 45 },
        3: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 4 — Retiros del mes
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  y = 28;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(`Retiros del mes — ${monthName} ${year} (${retiros.length})`, 14, y);

  if (retiros.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(160,160,160);
    doc.setFont('helvetica', 'normal');
    doc.text('Sin retiros registrados este mes.', 14, y + 10);
  } else {
    autoTable(doc, {
      startY: y + 6,
      head: [['Nombre', 'Empresa', 'Motivo', 'Fecha retiro', 'Costo est.']],
      body: retiros.map(m => {
        const cost = m.cost ? fmtMoney(Math.round(m.cost * 1.5)) : '—';
        return [
          m.userName || '—',
          m.company  || '—',
          m.reason   || m.notes || '—',
          fmt(toDate(m.date)),
          cost,
        ];
      }),
      foot: [['', '', '', 'Total estimado', costoRotacion > 0 ? fmtMoney(costoRotacion) : '—']],
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: [255,255,255], fontSize: 9, fontStyle: 'bold' },
      footStyles: { fillColor: [230,230,230], textColor: DARK, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 50 },
        2: { cellWidth: 40 },
        3: { halign: 'center' },
        4: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });
  }

  addPageNumber();

  // ── Save ──────────────────────────────────────────────────────────────────
  const fileName = `Nelyoda_Informe_${monthName}_${year}.pdf`;
  doc.save(fileName);
}

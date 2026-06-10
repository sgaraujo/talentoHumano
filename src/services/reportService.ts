import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── helpers ───────────────────────────────────────────────────────────────────

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v?.toDate) {
    const d = v.toDate();
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    return d;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [yr, mo, dy] = v.split('-').map(Number);
    return new Date(yr, mo - 1, dy);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date | null): string {
  if (!d) return '-';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function rotacionLabel(pct: number): string {
  if (pct <= 3)  return 'Optima';
  if (pct <= 7)  return 'Moderada';
  if (pct <= 12) return 'Alta';
  return 'Critica';
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
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── chart helpers (jsPDF primitives) ─────────────────────────────────────────

type RGB = [number, number, number];

// Draws a horizontal bar chart; returns the Y position after the last bar
function hBarChart(
  doc: jsPDF,
  data: { label: string; value: number }[],
  x: number, y: number, totalW: number,
  barH: number, gap: number,
  color: RGB,
): number {
  if (data.length === 0) return y;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const labelW = 85;
  const numW   = 14;
  const barW   = totalW - labelW - numW - 4;

  data.forEach((item, i) => {
    const rowY = y + i * (barH + gap);
    const filled = (item.value / maxVal) * barW;

    // track
    doc.setFillColor(235, 235, 235);
    doc.roundedRect(x + labelW, rowY, barW, barH, 1, 1, 'F');

    // fill
    if (filled > 0.5) {
      doc.setFillColor(...color);
      doc.roundedRect(x + labelW, rowY, filled, barH, 1, 1, 'F');
    }

    // label left
    const lbl = item.label.length > 25 ? item.label.slice(0, 23) + '...' : item.label;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(74, 74, 74);
    doc.text(lbl, x + labelW - 3, rowY + barH / 2 + 1.5, { align: 'right' });

    // value right
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(item.value.toString(), x + labelW + barW + 3, rowY + barH / 2 + 1.5);
  });

  return y + data.length * (barH + gap);
}

// Draws a grouped vertical bar chart (ingresos vs retiros by month)
// Returns Y position after the chart
function trendChart(
  doc: jsPDF,
  data: { mes: string; ingresos: number; retiros: number }[],
  x: number, y: number, totalW: number, chartH: number,
): number {
  if (data.length === 0) return y;
  const maxVal = Math.max(...data.flatMap(d => [d.ingresos, d.retiros]), 1);
  const n      = data.length;
  const colW   = (totalW - 10) / n;
  const barW   = (colW - 6) / 2;
  const GREEN: RGB = [0, 140, 60];
  const RED:   RGB = [220, 38, 38];

  // Y-axis grid lines (3 lines)
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  for (let g = 0; g <= 3; g++) {
    const lineY = y + chartH - (g / 3) * chartH;
    doc.line(x, lineY, x + totalW, lineY);
    if (g > 0) {
      const val = Math.round((g / 3) * maxVal);
      doc.setFontSize(6.5);
      doc.setTextColor(160, 160, 160);
      doc.setFont('helvetica', 'normal');
      doc.text(val.toString(), x - 1, lineY + 1, { align: 'right' });
    }
  }

  data.forEach((item, i) => {
    const colX = x + i * colW + 3;

    // ingreso bar (green)
    const hIng = (item.ingresos / maxVal) * chartH;
    if (hIng > 0.5) {
      doc.setFillColor(...GREEN);
      doc.rect(colX, y + chartH - hIng, barW, hIng, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN);
      doc.text(item.ingresos.toString(), colX + barW / 2, y + chartH - hIng - 1.5, { align: 'center' });
    }

    // retiro bar (red)
    const hRet = (item.retiros / maxVal) * chartH;
    if (hRet > 0.5) {
      doc.setFillColor(...RED);
      doc.rect(colX + barW + 2, y + chartH - hRet, barW, hRet, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...RED);
      doc.text(item.retiros.toString(), colX + barW + 2 + barW / 2, y + chartH - hRet - 1.5, { align: 'center' });
    }

    // month label
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(item.mes, colX + colW / 2 - 3, y + chartH + 6, { align: 'center' });
  });

  // legend
  const legY = y + chartH + 12;
  doc.setFillColor(...GREEN); doc.rect(x, legY, 5, 3, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(74, 74, 74);
  doc.text('Ingresos', x + 7, legY + 2.5);
  doc.setFillColor(...RED); doc.rect(x + 30, legY, 5, 3, 'F');
  doc.text('Retiros', x + 37, legY + 2.5);

  return y + chartH + 20;
}

// ── main export ───────────────────────────────────────────────────────────────

export function generateMonthlyReport(params: {
  users: any[];
  movements: any[];
  companies: any[];
  projects: any[];
  month: number;
  year: number;
  qStats?: { total: number; active: number };
}) {
  const { users, movements, companies, projects, month, year, qStats } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const GREEN:  RGB = [0, 140, 60];
  const BLUE:   RGB = [31, 143, 191];
  const RED:    RGB = [220, 38, 38];
  const DARK:   RGB = [74, 74, 74];
  const LIGHT:  RGB = [245, 247, 250];
  const GRAY:   RGB = [120, 120, 120];
  const monthName = MONTH_NAMES[month];

  // ── Pre-compute stats ──────────────────────────────────────────────────────

  const movsMonth = movements.filter(m => {
    const d = toDate(m.date);
    return d && d.getMonth() === month && d.getFullYear() === year;
  });
  const ingresos = movsMonth.filter(m => m.type === 'ingreso');
  const retiros  = movsMonth.filter(m => m.type === 'retiro');

  const colaboradores   = users.filter(u => u.role === 'colaborador').length;
  const excolaboradores = users.filter(u => u.role === 'excolaborador').length;

  const activeCompanyNames = new Set(companies.filter((c: any) => c.active).map((c: any) => c.name as string));
  const headcount = users.filter(u =>
    u.role === 'colaborador' && activeCompanyNames.has(u.contractInfo?.assignment?.company)
  ).length;

  const esVoluntario = (reason: string = '') => {
    const l = reason.toLowerCase();
    return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario';
  };
  const retirosVol = movsMonth.filter(m =>
    m.type === 'retiro' && activeCompanyNames.has(m.company) && esVoluntario(m.reason)
  ).length;
  const rotacionPct = headcount > 0 ? Math.round((retirosVol / headcount) * 100 * 10) / 10 : 0;

  const salarios = users
    .filter(u => u.role === 'colaborador')
    .map(u => u.contractInfo?.workConditions?.baseSalary || u.salaryInfo?.baseSalary || 0)
    .filter((s: number) => s > 0);
  const salarioPromedio = salarios.length > 0
    ? Math.round(salarios.reduce((a: number, b: number) => a + b, 0) / salarios.length)
    : 0;

  // Tendencia 6 meses
  const trendData = Array.from({ length: 6 }, (_, i) => {
    const d  = new Date(year, month - 5 + i, 1);
    const m2 = d.getMonth();
    const y2 = d.getFullYear();
    const ing = movements.filter(mv => { const dd = toDate(mv.date); return mv.type === 'ingreso' && dd && dd.getMonth() === m2 && dd.getFullYear() === y2; }).length;
    const ret = movements.filter(mv => { const dd = toDate(mv.date); return mv.type === 'retiro'  && dd && dd.getMonth() === m2 && dd.getFullYear() === y2; }).length;
    return { mes: MONTH_SHORT[m2], ingresos: ing, retiros: ret };
  });

  // Top empresas
  const empMap = new Map<string, { col: number; exco: number }>();
  users.forEach(u => {
    const emp = u.contractInfo?.assignment?.company || 'Sin empresa';
    if (!empMap.has(emp)) empMap.set(emp, { col: 0, exco: 0 });
    const e = empMap.get(emp)!;
    if (u.role === 'colaborador')   e.col++;
    if (u.role === 'excolaborador') e.exco++;
  });
  const topEmpresas = [...empMap.entries()]
    .map(([label, d]) => ({ label, value: d.col }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  // Distribución contratos
  const contratoMap = new Map<string, number>();
  users.filter(u => u.role === 'colaborador').forEach(u => {
    const tipo = u.contractInfo?.contract?.contractType || 'No especificado';
    contratoMap.set(tipo, (contratoMap.get(tipo) || 0) + 1);
  });
  const contratoData = [...contratoMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // Headcount por proyecto
  const projMap = new Map<string, { empresa: string; count: number }>();
  users.filter(u => u.role === 'colaborador').forEach(u => {
    const proj = u.contractInfo?.assignment?.project || 'Sin proyecto';
    const emp  = u.contractInfo?.assignment?.company || '';
    if (!projMap.has(proj)) projMap.set(proj, { empresa: emp, count: 0 });
    projMap.get(proj)!.count++;
  });
  const projRows = [...projMap.entries()]
    .map(([name, d]) => [name, d.empresa, d.count.toString()])
    .sort((a, b) => Number(b[2]) - Number(a[2]));
  const topProyectos = projRows.map(r => ({ label: r[0], value: Number(r[2]) }));

  // Cumpleaños del mes
  const cumples = users
    .filter(u => { const bd = toDate(u.personalData?.birthDate); return bd && bd.getMonth() === month && u.role === 'colaborador'; })
    .map(u => {
      const day = toDate(u.personalData.birthDate)!.getDate();
      return [String(day).padStart(2, '0'), u.fullName || '-', u.contractInfo?.assignment?.company || '-'];
    })
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  // Aniversarios del mes
  const aniversarios = users
    .filter(u => {
      const start = toDate(u.contractInfo?.contract?.startDate);
      if (!start || u.role !== 'colaborador') return false;
      const yrs = year - start.getFullYear();
      return start.getMonth() === month && [1, 2, 3, 5, 10].includes(yrs);
    })
    .map(u => {
      const yrs = year - toDate(u.contractInfo.contract.startDate)!.getFullYear();
      return [`${yrs} ano${yrs !== 1 ? 's' : ''}`, u.fullName || '-', u.contractInfo?.assignment?.company || '-'];
    });

  // ── Page helpers ───────────────────────────────────────────────────────────

  let pageNum = 1;

  const addPageNumber = () => {
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Pagina ${pageNum}`, W - 14, H - 8, { align: 'right' });
    doc.text('Inteegrados - Reporte Confidencial', 14, H - 8);
  };

  const addHeader = (title: string) => {
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, W, 18, 'F');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('INTEEGRADOS', 14, 12);
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

  const sectionTitle = (text: string, yPos: number, color: RGB = DARK) => {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(text, 14, yPos);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Portada
  // ══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 58, 'F');

  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('INTEEGRADOS', 14, 22);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Gestion de Talento Humano', 14, 30);

  doc.setFontSize(19);
  doc.setFont('helvetica', 'bold');
  doc.text('Informe Mensual de RR.HH.', 14, 43);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text(`${monthName} ${year}`, 14, 52);

  doc.setFontSize(8.5);
  doc.setTextColor(200, 200, 200);
  doc.text(`Generado el ${fmt(new Date())}`, W - 14, 54, { align: 'right' });

  // KPI box
  const boxY = 66;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, boxY, W - 28, 80, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Resumen Ejecutivo', 20, boxY + 9);

  const kpis = [
    ['Colaboradores activos',  colaboradores.toString()],
    ['Ex-colaboradores',       excolaboradores.toString()],
    ['Ingresos del mes',       ingresos.length.toString()],
    ['Retiros del mes',        retiros.length.toString()],
    ['% Rot. Voluntaria',      `${rotacionPct}%  ${rotacionLabel(rotacionPct)}`],
    ['Empresas activas',       companies.filter((c: any) => c.active).length.toString()],
    ['Proyectos activos',      projects.filter((p: any) => p.status === 'activo').length.toString()],
    ['Total personas',         users.length.toString()],
    ['Cuestionarios activos',  qStats ? qStats.active.toString() : '-'],
    ['Salario promedio',       salarioPromedio > 0 ? `$${Math.round(salarioPromedio / 1000)}k` : '-'],
  ];

  const col1X = 20, col2X = 112, colW = 84;
  kpis.forEach(([label, val], i) => {
    const col = i < 5 ? 0 : 1;
    const row = i < 5 ? i : i - 5;
    const x   = col === 0 ? col1X : col2X;
    const y   = boxY + 19 + row * 11;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(label, x, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(val, x + colW, y, { align: 'right' });
  });

  // Semaforo
  const [sr, sg, sb] = rotacionColor(rotacionPct);
  const semaforoY = boxY + 92;
  doc.setFillColor(sr, sg, sb);
  doc.circle(20, semaforoY, 4, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(sr, sg, sb);
  doc.text(`Rotacion Voluntaria: ${rotacionLabel(rotacionPct)} (${rotacionPct}%)`, 27, semaforoY + 1.5);

  // Referencia semaforo — sin caracteres especiales
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text('Referencia:  <=3% Optima   <=7% Moderada   <=12% Alta   >12% Critica', 14, semaforoY + 9);

  addPageNumber();

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Graficas: Top empresas + Distribucion contratos
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  let curY = 26;
  sectionTitle('Headcount por Empresa (Colaboradores activos)', curY, GREEN);
  curY += 6;
  curY = hBarChart(doc, topEmpresas, 14, curY, W - 28, 7, 3, BLUE);

  curY += 10;
  sectionTitle('Distribucion por Tipo de Contrato', curY, BLUE);
  curY += 6;
  curY = hBarChart(doc, contratoData, 14, curY, W - 28, 7, 3, GREEN);

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Graficas: Tendencia 6 meses + Headcount por proyecto
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  curY = 26;
  sectionTitle('Tendencia de Movimientos — Ultimos 6 meses', curY, DARK);
  curY += 6;
  curY = trendChart(doc, trendData, 22, curY, W - 36, 55);

  curY += 4;
  const projChartH = topProyectos.length * (7 + 3) + 10;
  if (curY + projChartH > H - 15) {
    newPage(`Informe ${monthName} ${year}`);
    curY = 26;
  }
  sectionTitle('Headcount por Proyecto', curY, BLUE);
  curY += 6;
  curY = hBarChart(doc, topProyectos, 14, curY, W - 28, 7, 3, BLUE);

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 4 — Cumpleanos + Aniversarios + Otros indicadores
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  curY = 26;
  sectionTitle(`Cumpleanos de ${monthName}`, curY, [219, 39, 119]);

  if (cumples.length === 0) {
    doc.setFontSize(8.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'italic');
    doc.text('Sin cumpleanos registrados este mes.', 14, curY + 9);
    curY += 18;
  } else {
    autoTable(doc, {
      startY: curY + 5,
      head: [['Dia', 'Nombre', 'Empresa']],
      body: cumples,
      theme: 'striped',
      headStyles: { fillColor: [219, 39, 119], textColor: [255,255,255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 76 },
      },
      margin: { left: 14, right: 14 },
    });
    curY = (doc as any).lastAutoTable.finalY + 10;
  }

  sectionTitle(`Aniversarios de ${monthName}`, curY, GREEN);

  if (aniversarios.length === 0) {
    doc.setFontSize(8.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'italic');
    doc.text('Sin aniversarios registrados este mes.', 14, curY + 9);
    curY += 18;
  } else {
    autoTable(doc, {
      startY: curY + 5,
      head: [['Antiguedad', 'Nombre', 'Empresa']],
      body: aniversarios,
      theme: 'striped',
      headStyles: { fillColor: GREEN, textColor: [255,255,255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 68 },
      },
      margin: { left: 14, right: 14 },
    });
    curY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Otros indicadores
  if (curY < H - 55) {
    sectionTitle('Otros Indicadores', curY, DARK);
    autoTable(doc, {
      startY: curY + 5,
      head: [['Indicador', 'Valor', 'Referencia']],
      body: [
        ['Proyectos activos',      projects.filter((p: any) => p.status === 'activo').toString() || projects.filter((p: any) => p.status === 'activo').length.toString(), `de ${projects.length} totales`],
        ['Cuestionarios activos',  qStats ? qStats.active.toString() : '-', qStats ? `${qStats.total} en total` : ''],
        ['Total personas sistema', users.length.toString(), 'Todos los roles'],
        ['Salario promedio',       salarioPromedio > 0 ? `$${salarioPromedio.toLocaleString('es-CO')}` : '-', 'Colaboradores activos'],
      ],
      theme: 'striped',
      headStyles: { fillColor: DARK, textColor: [255,255,255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 75 },
        1: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 67 },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 5 — Ingresos del mes
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  curY = 26;
  sectionTitle(`Ingresos del mes  ${monthName} ${year}  (${ingresos.length})`, curY, GREEN);

  if (ingresos.length === 0) {
    doc.setFontSize(8.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'italic');
    doc.text('Sin ingresos registrados este mes.', 14, curY + 9);
  } else {
    autoTable(doc, {
      startY: curY + 6,
      head: [['Nombre', 'Empresa', 'Proyecto', 'Fecha ingreso']],
      body: ingresos.map(m => [m.userName || '-', m.company || '-', m.project || m.area || '-', fmt(toDate(m.date))]),
      theme: 'striped',
      headStyles: { fillColor: GREEN, textColor: [255,255,255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 55 },
        2: { cellWidth: 50 },
        3: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 6 — Retiros del mes
  // ══════════════════════════════════════════════════════════════════════════
  newPage(`Informe ${monthName} ${year}`);

  curY = 26;
  sectionTitle(`Retiros del mes  ${monthName} ${year}  (${retiros.length})`, curY, RED);

  if (retiros.length === 0) {
    doc.setFontSize(8.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'italic');
    doc.text('Sin retiros registrados este mes.', 14, curY + 9);
  } else {
    autoTable(doc, {
      startY: curY + 6,
      head: [['Nombre', 'Empresa', 'Motivo', 'Fecha retiro']],
      body: retiros.map(m => [m.userName || '-', m.company || '-', m.reason || m.notes || '-', fmt(toDate(m.date))]),
      theme: 'striped',
      headStyles: { fillColor: RED, textColor: [255,255,255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 55 },
        2: { cellWidth: 50 },
        3: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });
  }

  addPageNumber();

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`Inteegrados_Informe_${monthName}_${year}.pdf`);
}

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL SEND REPORT
// ═════════════════════════════════════════════════════════════════════════════

export interface EmailReportGlobalStats {
  total: number; sent: number; failed: number; noStatus: number;
  deliveryRate: number; topFailReason: string;
}
export interface EmailReportProjectRow {
  projectName: string; total: number; sent: number; failed: number;
  noStatus: number; deliveryRate: number;
}
export interface EmailReportQuestionnaireRow {
  title: string; active: boolean; total: number; sent: number;
  failed: number; deliveryRate: number;
}
export interface EmailReportRoleRow {
  role: string; total: number; sent: number; failed: number; deliveryRate: number;
}
export interface EmailReportFailRow {
  userName: string; userEmail: string; questionnaireTitle: string;
  assignedAt: Date | null; error: string;
}
export interface EmailReportTimelinePoint { date: string; sent: number; failed: number; }

const ROLE_LABELS_PDF: Record<string, string> = {
  colaborador: 'Colaborador', lider: 'Lider', aspirante: 'Aspirante',
  excolaborador: 'Excolaborador', descartado: 'Descartado', desconocido: 'Desconocido',
};

export function generateEmailSendReport(params: {
  globalStats: EmailReportGlobalStats;
  byProject: EmailReportProjectRow[];
  byQuestionnaire: EmailReportQuestionnaireRow[];
  byRole: EmailReportRoleRow[];
  failures: EmailReportFailRow[];
  timeline: EmailReportTimelinePoint[];
}) {
  const { globalStats, byProject, byQuestionnaire, byRole, failures, timeline } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const GREEN: RGB = [0, 140, 60];
  const BLUE:  RGB = [31, 143, 191];
  const RED:   RGB = [220, 38, 38];
  const DARK:  RGB = [74, 74, 74];
  const GRAY:  RGB = [120, 120, 120];
  const LIGHT: RGB = [245, 247, 250];

  const today = fmt(new Date());
  let pageNum = 1;

  const addPageNumber = () => {
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Pagina ${pageNum}`, W - 14, H - 8, { align: 'right' });
    doc.text('Inteegrados - Estadisticas de Correos', 14, H - 8);
  };

  const addHeader = (title: string) => {
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, W, 18, 'F');
    doc.setFontSize(13); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text('INTEEGRADOS', 14, 12);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(title, W - 14, 12, { align: 'right' });
  };

  const newPage = (title: string) => {
    addPageNumber();
    doc.addPage();
    pageNum++;
    addHeader(title);
  };

  const sectionTitle = (text: string, yPos: number, color: RGB = DARK) => {
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(text, 14, yPos);
  };

  // ── Page 1: Portada ────────────────────────────────────────────────────────
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 58, 'F');

  doc.setFontSize(26); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
  doc.text('INTEEGRADOS', 14, 22);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('Gestion de Talento Humano', 14, 30);
  doc.setFontSize(19); doc.setFont('helvetica', 'bold');
  doc.text('Informe de Estadisticas de Correos', 14, 43);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('Envios de cuestionarios y tasa de entrega', 14, 52);
  doc.setFontSize(8.5); doc.setTextColor(200, 200, 200);
  doc.text(`Generado el ${today}`, W - 14, 54, { align: 'right' });

  // KPI summary box
  const boxY = 66;
  doc.setFillColor(...LIGHT);
  doc.roundedRect(14, boxY, W - 28, 76, 3, 3, 'F');

  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK);
  doc.text('Resumen Ejecutivo', 20, boxY + 9);

  const rateColor: RGB = globalStats.deliveryRate >= 90 ? GREEN : globalStats.deliveryRate >= 70 ? [202, 138, 4] : RED;
  const kpis = [
    ['Total asignaciones',   globalStats.total.toLocaleString('es-CO')],
    ['Correos entregados',   globalStats.sent.toLocaleString('es-CO')],
    ['Correos fallidos',     globalStats.failed.toLocaleString('es-CO')],
    ['Sin estado registrado', globalStats.noStatus.toLocaleString('es-CO')],
    ['Tasa de entrega',      `${globalStats.deliveryRate}%`],
  ];

  const col1X = 20, col2X = 112, colW2 = 84;
  kpis.forEach(([label, val], i) => {
    const col = i < 3 ? 0 : 1;
    const row = i < 3 ? i : i - 3;
    const x   = col === 0 ? col1X : col2X;
    const y   = boxY + 19 + row * 12;

    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(i === 4 ? rateColor[0] : DARK[0], i === 4 ? rateColor[1] : DARK[1], i === 4 ? rateColor[2] : DARK[2]);
    doc.text(val, x + colW2, y, { align: 'right' });
  });

  // Semaforo tasa
  const semaforoY = boxY + 68;
  doc.setFillColor(...rateColor);
  doc.circle(20, semaforoY, 4, 'F');
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...rateColor);
  const rateLabel = globalStats.deliveryRate >= 90 ? 'Excelente' : globalStats.deliveryRate >= 70 ? 'Aceptable' : 'Critica';
  doc.text(`Tasa de entrega: ${rateLabel} (${globalStats.deliveryRate}%)`, 27, semaforoY + 1.5);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
  doc.text('Referencia:  >=90% Excelente   >=70% Aceptable   <70% Critica', 14, semaforoY + 9);

  if (globalStats.topFailReason) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RED);
    doc.text(`Error mas frecuente: "${globalStats.topFailReason.slice(0, 70)}"`, 14, semaforoY + 19);
  }

  addPageNumber();

  // ── Page 2: Por Proyecto ───────────────────────────────────────────────────
  newPage('Estadisticas de Correos');
  let curY = 26;

  sectionTitle('Entrega de Correos por Proyecto', curY, GREEN);
  curY += 5;

  autoTable(doc, {
    startY: curY,
    head: [['Proyecto', 'Asignaciones', 'Entregados', 'Fallidos', 'Sin estado', 'Tasa']],
    body: byProject.map(r => [
      r.projectName.length > 30 ? r.projectName.slice(0, 28) + '...' : r.projectName,
      r.total.toString(),
      r.sent.toString(),
      r.failed > 0 ? r.failed.toString() : '0',
      r.noStatus > 0 ? r.noStatus.toString() : '0',
      r.sent + r.failed > 0 ? `${r.deliveryRate}%` : '-',
    ]),
    theme: 'striped',
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 24, halign: 'center', textColor: [0, 120, 40] },
      3: { cellWidth: 20, halign: 'center', textColor: [200, 30, 30] },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const v = parseInt(data.cell.raw as string);
        if (!isNaN(v)) {
          data.cell.styles.textColor = v >= 90 ? [0, 120, 40] : v >= 70 ? [180, 120, 0] : [200, 30, 30];
        }
      }
    },
  });

  curY = (doc as any).lastAutoTable.finalY + 12;

  // Gráfico horizontal top proyectos
  const topP = byProject.slice(0, 8).map(r => ({ label: r.projectName, value: r.sent }));
  if (topP.length > 0 && curY + topP.length * 10 + 16 < H - 15) {
    sectionTitle('Top proyectos — Correos entregados', curY, BLUE);
    curY += 6;
    curY = hBarChart(doc, topP, 14, curY, W - 28, 7, 3, BLUE);
  }

  // ── Page 3: Por Cuestionario ───────────────────────────────────────────────
  newPage('Estadisticas de Correos');
  curY = 26;

  sectionTitle('Entrega de Correos por Cuestionario', curY, BLUE);
  curY += 5;

  autoTable(doc, {
    startY: curY,
    head: [['Cuestionario', 'Estado', 'Enviados', 'Entregados', 'Fallidos', 'Tasa']],
    body: byQuestionnaire.map(r => [
      r.title.length > 38 ? r.title.slice(0, 36) + '...' : r.title,
      r.active ? 'Activo' : 'Inactivo',
      r.total.toString(),
      r.sent.toString(),
      r.failed > 0 ? r.failed.toString() : '0',
      r.sent + r.failed > 0 ? `${r.deliveryRate}%` : '-',
    ]),
    theme: 'striped',
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 22, halign: 'center', textColor: [0, 120, 40] },
      4: { cellWidth: 18, halign: 'center', textColor: [200, 30, 30] },
      5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const v = parseInt(data.cell.raw as string);
        if (!isNaN(v)) {
          data.cell.styles.textColor = v >= 90 ? [0, 120, 40] : v >= 70 ? [180, 120, 0] : [200, 30, 30];
        }
      }
    },
  });

  // ── Page 4: Por Rol + Tendencia ────────────────────────────────────────────
  newPage('Estadisticas de Correos');
  curY = 26;

  sectionTitle('Entrega de Correos por Rol', curY, DARK);
  curY += 5;

  autoTable(doc, {
    startY: curY,
    head: [['Rol', 'Enviados', 'Entregados', 'Fallidos', 'Tasa de entrega']],
    body: byRole.map(r => [
      ROLE_LABELS_PDF[r.role] ?? r.role,
      r.total.toString(),
      r.sent.toString(),
      r.failed > 0 ? r.failed.toString() : '0',
      r.sent + r.failed > 0 ? `${r.deliveryRate}%` : '-',
    ]),
    theme: 'striped',
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: DARK },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 28, halign: 'center', textColor: [0, 120, 40] },
      3: { cellWidth: 28, halign: 'center', textColor: [200, 30, 30] },
      4: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  curY = (doc as any).lastAutoTable.finalY + 12;

  // Tendencia últimos 30 días — resumen por semana
  const weeks: { label: string; sent: number; failed: number }[] = [];
  for (let w = 0; w < 4; w++) {
    const slice = timeline.slice(w * 7, w * 7 + 7);
    if (slice.length === 0) continue;
    const s = slice.reduce((acc, d) => ({ sent: acc.sent + d.sent, failed: acc.failed + d.failed }), { sent: 0, failed: 0 });
    weeks.push({ label: `Semana ${w + 1} (${slice[0].date} - ${slice[slice.length - 1].date})`, ...s });
  }

  if (weeks.length > 0 && curY + weeks.length * 12 + 20 < H - 15) {
    sectionTitle('Tendencia — Ultimos 30 dias (resumen semanal)', curY, GREEN);
    curY += 5;
    autoTable(doc, {
      startY: curY,
      head: [['Periodo', 'Entregados', 'Fallidos', 'Total']],
      body: weeks.map(w => [w.label, w.sent.toString(), w.failed.toString(), (w.sent + w.failed).toString()]),
      theme: 'grid',
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 26, halign: 'center', textColor: [0, 120, 40] },
        2: { cellWidth: 22, halign: 'center', textColor: [200, 30, 30] },
        3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });

    // Pico
    const peakDay = timeline.reduce((best, t) => (t.sent + t.failed) > (best.sent + best.failed) ? t : best, timeline[0]);
    if (peakDay) {
      curY = (doc as any).lastAutoTable.finalY + 6;
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...GRAY);
      doc.text(`Dia con mas envios: ${peakDay.date} — ${peakDay.sent + peakDay.failed} correo(s) procesados`, 14, curY);
    }
  }

  // ── Page 5: Fallidos ───────────────────────────────────────────────────────
  if (failures.length > 0) {
    newPage('Estadisticas de Correos');
    curY = 26;

    sectionTitle(`Correos Fallidos — Detalle (${failures.length})`, curY, RED);
    curY += 5;

    autoTable(doc, {
      startY: curY,
      head: [['Persona', 'Correo', 'Cuestionario', 'Fecha', 'Error']],
      body: failures.map(f => [
        f.userName || '-',
        f.userEmail || '-',
        f.questionnaireTitle.length > 28 ? f.questionnaireTitle.slice(0, 26) + '...' : f.questionnaireTitle,
        f.assignedAt ? fmt(f.assignedAt) : '-',
        f.error.length > 40 ? f.error.slice(0, 38) + '...' : f.error,
      ]),
      theme: 'striped',
      headStyles: { fillColor: RED, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 40 },
        2: { cellWidth: 38 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 44, textColor: [180, 40, 40] },
      },
      margin: { left: 14, right: 14 },
    });
  }

  addPageNumber();

  doc.save(`Inteegrados_Estadisticas_Correos_${today.replace(/\//g, '-')}.pdf`);
}

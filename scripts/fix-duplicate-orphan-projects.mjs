/**
 * fix-duplicate-orphan-projects.mjs
 *
 * Limpia los proyectos (cuentas analíticas) huérfanos y duplicados detectados
 * tras la fusión histórica de "Inteegra S.A.S BIC" (companyId eliminado:
 * Hp0Pn980T3XUXNJAhLLp) en "Inteegra SAS BIC" (companyId vivo:
 * 2wVFsqnnguqxWbFff55d), más 3 huérfanos de "Marka Group de Colombia" (empresa
 * ya inexistente) y 4 duplicados sueltos en empresas activas (Inteegra,
 * Netcol, Misión Servir) creados dos veces con/sin tilde.
 *
 * Cada caso fue verificado contra `organization/data/project_memberships`
 * (17 registros reales) para no perder ninguna membresía de equipo: cuando el
 * documento huérfano/duplicado tenía mejor estado o membresías reales, se
 * REASIGNA (se corrige su companyId) en vez de borrarlo, y se borra la copia
 * inferior — el projectId de las membresías nunca cambia, así que no hace
 * falta tocar esa colección aparte.
 *
 * Ningún registro de empleado (`human_resources/data/employees/*\/employments`)
 * se ve afectado: esos guardan el nombre del proyecto como texto, no el ID.
 *
 * Uso:
 *   node scripts/fix-duplicate-orphan-projects.mjs            (dry-run)
 *   node scripts/fix-duplicate-orphan-projects.mjs --apply     (aplica)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sa = JSON.parse(readFileSync(join(__dirname, 'serviceAccount.json'), 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const APPLY = process.argv.includes('--apply');
const PROJECTS = 'organization/data/projects';

const LIVE_INTEEGRA = { companyId: '2wVFsqnnguqxWbFff55d', companyName: 'INTEEGRA SAS BIC' };

// ── 32 documentos a borrar (huérfano/duplicado inferior; ya existe una copia
// viva equivalente o mejor, y ninguna project_membership los referencia) ──
const TO_DELETE = [
  ['049H15BVz00Hc4rqtalC', 'GUAYEPO (huérfano Inteegra vieja)'],
  ['4LfIBxe53bzMHS6STWII', 'DIRECTV (huérfano Inteegra vieja)'],
  ['7wvvmJ00ej3oECHdOTUu', 'ATP FIBER (huérfano Inteegra vieja)'],
  ['9s91X1JWD8CUgm6rF6BX', 'DESMONTE (huérfano Inteegra vieja)'],
  ['DW4ztucUbloaq7XyDBCi', 'LIBERTY (huérfano Inteegra vieja)'],
  ['H2ebwNxlmDKN9INiyIVH', 'APRENDICES (huérfano Inteegra vieja)'],
  ['N7OEZlRVpNeeGuFWSaFQ', 'CLARO INTERVENTORIA (huérfano Inteegra vieja)'],
  ['O0Q7ykc3ppJXwR3UWLYx', 'ADMINISTRACION (huérfano Inteegra vieja)'],
  ['OGRyG23VliNplOTlWmrh', 'NOC ITAC (huérfano Inteegra vieja)'],
  ['TM32qw6Mpe9oqg2ev83d', 'CLARO SERVICIOS ESPECIALES (huérfano Inteegra vieja)'],
  ['VAydTxze5Lnaow4Om40i', 'DATAFILL (huérfano Inteegra vieja)'],
  ['Yb5gUg1tSiBwUkYnBxPz', 'ADMINISTRACIÓN (huérfano Inteegra vieja, activo, 0 miembros)'],
  ['cWsBABTfgM2keUFjuJZB', 'ETB MELTEC (huérfano Inteegra vieja, activo, 0 miembros)'],
  ['cwmjCoghhi8AYBS499I0', 'METROSALUD (huérfano Inteegra vieja)'],
  ['d6GTaurVmd0e8hS4gpla', 'FLM MOVISTAR II (huérfano Inteegra vieja)'],
  ['eq0ySZoKfT4BomUKAddz', 'FENOGE TAT (huérfano Inteegra vieja)'],
  ['hNo55WWjOdoUVdBqBZCU', 'ITAC (huérfano Inteegra vieja)'],
  ['oMKglPdRBMk3OTIj2dY7', 'NOC DIRECTV (huérfano Inteegra vieja)'],
  ['rQ6wJA4V4QqnWfpA5KTQ', 'ZTE (huérfano Inteegra vieja, activo, 0 miembros)'],
  ['sUyGcVxQFHKj5fELfIfv', 'DATAFILL/CLARO Interventoría Y SE (huérfano Inteegra vieja)'],
  ['s38rNPP5I7qUdlqTPPCN', 'DIRECTV duplicado en Inteegra viva (companyName obsoleto)'],
  ['iA1NWQad7eV0zOVh0zj6', 'ADMINISTRACION duplicado en Inteegra viva'],
  ['K9J1EiFjehQbuHB31VBz', 'ADMINISTRACION duplicado en Misión Servir'],
  ['xxZjAgsUnN4NJxfzYXl3', 'ADMINISTRACION duplicado en Netcol'],
  ['3mCwX5nYfydGVenbtY3m', 'ETB (huérfano Marka Group, empresa ya no existe)'],
  ['hjB2OqlRpXuDa65OPsUS', 'PLEX (huérfano Marka Group, empresa ya no existe)'],
  ['wfuEGCreKUBQzxtRoR07', 'GESTIÓN COMERCIAL (huérfano Marka Group, empresa ya no existe)'],
  ['JTCrbaP8eZPPxorSukn4', 'CLARO-NOC OTS Y DATAFILL duplicado inferior en Inteegra viva (inactivo, 0 miembros)'],
  ['lZ8VgzLlrdaWGhDVVOyT', 'GESTIÓN COMERCIAL duplicado inferior en Inteegra viva (inactivo, 0 miembros)'],
  ['wbF52lvTAreK5pl9OqkH', 'NOC ETB duplicado inferior en Inteegra viva (0 miembros)'],
  ['0IuNG0hCmF6Sy2nbTx2U', 'INTERNUQUI duplicado inferior en Inteegra viva (0 miembros)'],
  ['WPMRscW0qF5tE5QpB07I', 'ATP NOC duplicado inferior en Inteegra viva (0 miembros)'],
];

// ── 7 documentos a reasignar (se quedan vivos, solo se corrige companyId/companyName) ──
// Los 5 primeros son el "sobreviviente" de un par con duplicado inferior (ya
// listado arriba en TO_DELETE); los últimos 2 no tienen copia viva equivalente.
const TO_REASSIGN = [
  ['edrbXTJ2fTKBQbTpi2os', 'CLARO-NOC OTS Y DATAFILL (activo, 4 miembros de equipo)'],
  ['hAMcwXgYXJd9RYEZk0RA', 'GESTIÓN COMERCIAL (activo)'],
  ['iT3NZwcqcz67xFcUcXXm', 'NOC ETB (activo, 1 miembro de equipo)'],
  ['gsif8ZQqLdWIzM1Hl29G', 'INTERNUQUI (inactivo, 1 miembro de equipo)'],
  ['80OvAyEjR0qsReb2z5dV', 'ATP NOC (activo, 1 miembro de equipo)'],
  ['Ck2Pfb5yFT3083xQe1W8', 'COMERCIAL (sin copia viva equivalente)'],
  ['V5kVG3aUKfY6edUlzfwK', '[DTV] DESMONTE DIRECTV (sin copia viva equivalente)'],
];

async function main() {
  console.log(`\n=== ${TO_DELETE.length} documento(s) a BORRAR ===`);
  for (const [id, label] of TO_DELETE) console.log(`  ${id}  ${label}`);

  console.log(`\n=== ${TO_REASSIGN.length} documento(s) a REASIGNAR a ${LIVE_INTEEGRA.companyName} (${LIVE_INTEEGRA.companyId}) ===`);
  for (const [id, label] of TO_REASSIGN) console.log(`  ${id}  ${label}`);

  if (!APPLY) {
    console.log('\n(Dry-run — no se escribió nada. Vuelve a correr con --apply para aplicar.)');
    return;
  }

  const batch = db.batch();
  for (const [id] of TO_DELETE) batch.delete(db.collection(PROJECTS).doc(id));
  for (const [id] of TO_REASSIGN) batch.update(db.collection(PROJECTS).doc(id), LIVE_INTEEGRA);
  await batch.commit();
  console.log(`\n✔ Aplicado: ${TO_DELETE.length} borrados, ${TO_REASSIGN.length} reasignados.`);
}

main().catch(console.error).finally(() => process.exit());

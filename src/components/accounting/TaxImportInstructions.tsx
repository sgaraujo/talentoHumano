import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { KNOWN_TAX_TYPES, VALID_STATUSES, VALID_OBLIGATION_TYPES, VALID_SCOPES } from '@/domain/tax/taxExcelImport';

const REQUIRED_COLUMNS = [
  ['EMPRESA', 'Obligatoria', 'Nombre tal como aparece en el catálogo de empresas (o un alias ya registrado).'],
  ['NIT', 'Opcional', 'Ayuda a encontrar la empresa si el nombre no coincide exacto.'],
  ['TIPO DE OBLIGACIÓN', 'Obligatoria', 'Debe ser uno de los tipos válidos (lista abajo) o uno ya usado antes en el calendario.'],
  ['VENCIMIENTO', 'Obligatoria', 'Formato AAAA-MM-DD (ej: 2026-09-15) o DD/MM/AAAA.'],
  ['PERÍODO', 'Opcional', 'Ej: Bim 4, Cuatri-2, Mensual-9, Anual.'],
  ['ESTADO', 'Opcional', 'Si se deja vacío queda en "No iniciado". Si se llena, debe ser un estado válido.'],
  ['CATEGORÍA', 'Opcional', 'Impuestos, Información Exógena o Reportes. Vacío = Impuestos.'],
  ['ALCANCE', 'Opcional', 'Nacional o Distrital. Vacío = Nacional.'],
  ['CIUDAD', 'Opcional', ''],
  ['ASESOR', 'Opcional', ''],
  ['OBSERVACIÓN', 'Opcional', ''],
  ['PROYECTADO', 'Opcional', 'Solo números, sin símbolo de moneda.'],
] as const;

export function TaxImportInstructions() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Ver formato del Excel"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-[#008C3C] transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-h-[70vh] overflow-y-auto text-sm" align="end">
        <p className="font-semibold text-gray-800 mb-2">Formato esperado del Excel</p>
        <p className="text-xs text-gray-500 mb-3">
          Una fila por vencimiento. El sistema valida cada fila antes de crear o actualizar nada — si algo no coincide con esta lista, la fila se rechaza y se explica por qué.
        </p>

        <div className="space-y-2 mb-4">
          {REQUIRED_COLUMNS.map(([col, req, desc]) => (
            <div key={col} className="text-xs">
              <span className="font-mono font-semibold text-gray-700">{col}</span>{' '}
              <span className={req === 'Obligatoria' ? 'text-red-600 font-medium' : 'text-gray-400'}>({req})</span>
              {desc && <p className="text-gray-500 mt-0.5">{desc}</p>}
            </div>
          ))}
        </div>

        <p className="font-semibold text-gray-700 text-xs mb-1">Tipos de obligación válidos</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {KNOWN_TAX_TYPES.map(type => (
            <span key={type} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{type}</span>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          También se acepta cualquier tipo que ya exista en el calendario actual (obligaciones legales/manuales).
        </p>

        <p className="font-semibold text-gray-700 text-xs mb-1">Estados válidos</p>
        <div className="flex flex-wrap gap-1 mb-3">
          {VALID_STATUSES.map(status => (
            <span key={status} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{status}</span>
          ))}
        </div>

        <p className="font-semibold text-gray-700 text-xs mb-1">Categoría / Alcance</p>
        <div className="flex flex-wrap gap-1">
          {VALID_OBLIGATION_TYPES.map(v => (
            <span key={v} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{v}</span>
          ))}
          {VALID_SCOPES.map(v => (
            <span key={v} className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{v}</span>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

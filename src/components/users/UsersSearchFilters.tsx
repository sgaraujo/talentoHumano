import type { UserRole } from "@/models/types/User";

type EspFilter = "todas" | "con" | "sin";
type RoleFilter = "todos" | UserRole;

const ROLE_OPTIONS: Array<{ label: string; value: RoleFilter }> = [
  { label: "Todos", value: "todos" },
  { label: "Colaborador", value: "colaborador" },
  { label: "Excolaborador", value: "excolaborador" },
  { label: "Aspirante", value: "aspirante" },
  { label: "Descartado", value: "descartado" },
];

export function UsersSearchFilters(props: {
  q: string;
  setQ: (v: string) => void;
  role: RoleFilter;
  setRole: (v: RoleFilter) => void;
  esp: EspFilter;
  setEsp: (v: EspFilter) => void;
  resultsCount: number;
  onClear: () => void;
}) {
  const { q, setQ, role, setRole, esp, setEsp, resultsCount, onClear } = props;

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Buscar</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, carrera, universidad, cargo, doc, email..."
            className="w-full rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleFilter)}
            className="w-full rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Especialización</label>
          <select
            value={esp}
            onChange={(e) => setEsp(e.target.value as EspFilter)}
            className="w-full rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="todas">Todas</option>
            <option value="con">Con especialización</option>
            <option value="sin">Sin especialización</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Resultados:{" "}
          <span className="font-medium text-foreground">{resultsCount}</span>
        </p>

        <button
          onClick={onClear}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-muted"
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}

import { User, UserRole } from "@/models/types/User";
import { searchUsers } from "@/services/userSearchService";
import { useDebounce } from "@/hooks/useDebounce";
import { useEffect, useMemo, useState } from "react";

const ROLES: Array<{ value: UserRole | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "colaborador", label: "Colaborador" },
  { value: "excolaborador", label: "Excolaborador" },
  { value: "aspirante", label: "Aspirante" },
  { value: "descartado", label: "Descartado" },
];

export default function UserSearchPage() {
  const [text, setText] = useState("");
  const [role, setRole] = useState<UserRole | "all">("all");
  const [onlyWithSpec, setOnlyWithSpec] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  async function runSearch(t = text, r = role, spec = onlyWithSpec) {
    setLoading(true);
    setError(null);
    try {
      const res = await searchUsers({
        text: t,
        role: r,
        onlyWithSpecialization: spec,
        limit: 800,
      });
      setUsers(res);
    } catch (e: any) {
      setError(e?.message ?? "Error consultando usuarios");
    } finally {
      setLoading(false);
    }
  }

  // Debounce (búsqueda en vivo)
  const dText = useDebounce(text, 300);
  const dRole = useDebounce(role, 200);
  const dOnlyWithSpec = useDebounce(onlyWithSpec, 200);

  useEffect(() => {
    runSearch(dText, dRole, dOnlyWithSpec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dText, dRole, dOnlyWithSpec]);

  const totalItems = users.length;

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalItems / pageSize));
  }, [totalItems, pageSize]);

  const pagedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, page, pageSize]);

  useEffect(() => {
    // si cambian los resultados (por filtro), vuelve a la página 1
    setPage(1);
  }, [totalItems, pageSize]);

  useEffect(() => {
    // evita página fuera de rango
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="min-h-[calc(100vh-64px)] w-full px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Búsqueda de usuarios</h1>
            <p className="text-sm text-muted-foreground">
              Filtra por nombre, correo, documento, cargo y formación.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full border px-3 py-1">
              Resultados: <b>{totalItems}</b>
            </span>
          </div>
        </div>

        {/* Filtros */}
        <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search */}
            <div className="relative w-full md:max-w-xl">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Buscar por nombre, correo, documento, cargo o formación"
                className="w-full rounded-2xl border bg-gray-50 px-4 py-2.5 text-sm outline-none transition focus:bg-white focus:ring-2"
              />
            </div>

            {/* Controls */}
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              {/* Rol */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600">Rol</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="h-10 rounded-2xl border bg-white px-3 text-sm outline-none transition focus:ring-2"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Especialización */}
              <button
                type="button"
                onClick={() => setOnlyWithSpec((v) => !v)}
                className={[
                  "h-10 rounded-2xl border px-4 text-sm transition",
                  onlyWithSpec
                    ? "border-black bg-black text-white"
                    : "bg-white hover:bg-gray-50",
                ].join(" ")}
                aria-pressed={onlyWithSpec}
              >
                Con especialización
              </button>

              {/* Acciones (opcional, ya que la búsqueda es en vivo) */}
              <div className="flex gap-2">
                <button
                  onClick={() => runSearch(text, role, onlyWithSpec)}
                  className="h-10 rounded-2xl bg-black px-5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Buscando..." : "Buscar"}
                </button>

                <button
                  onClick={() => {
                    setText("");
                    setRole("all");
                    setOnlyWithSpec(false);
                  }}
                  className="h-10 rounded-2xl border px-5 text-sm transition hover:bg-gray-50 disabled:opacity-60"
                  disabled={loading}
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>

          {/* Filtros activos */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Filtros activos:</span>

            {text.trim() ? (
              <span className="inline-flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-xs">
                Texto: <b className="font-medium">{text.trim()}</b>
                <button
                  type="button"
                  onClick={() => setText("")}
                  className="text-gray-500 hover:text-black"
                >
                  ×
                </button>
              </span>
            ) : null}

            {role !== "all" ? (
              <span className="inline-flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-xs">
                Rol: <b className="font-medium">{role}</b>
                <button
                  type="button"
                  onClick={() => setRole("all")}
                  className="text-gray-500 hover:text-black"
                >
                  ×
                </button>
              </span>
            ) : null}

            {onlyWithSpec ? (
              <span className="inline-flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-xs">
                Con especialización
                <button
                  type="button"
                  onClick={() => setOnlyWithSpec(false)}
                  className="text-gray-500 hover:text-black"
                >
                  ×
                </button>
              </span>
            ) : null}

            {!text.trim() && role === "all" && !onlyWithSpec ? (
              <span className="text-xs text-gray-400">Ninguno</span>
            ) : null}
          </div>

          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </div>

        {/* Tabla */}
        <div className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Cargo</th>
                  <th className="px-4 py-3">Carrera / Formación</th>
                  <th className="px-4 py-3">Rol</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{u.fullName}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.personalData?.documentNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.personalData?.position ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {u.professionalProfile?.undergraduate ||
                        u.professionalProfile?.degree ||
                        u.professionalProfile?.knowledgeArea ||
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border px-2 py-1 text-xs">
                        {u.role}
                      </span>
                    </td>
                  </tr>
                ))}

                {!loading && totalItems === 0 && (
                  <tr className="border-t">
                    <td
                      className="px-4 py-6 text-center text-sm text-gray-500"
                      colSpan={6}
                    >
                      No hay resultados con esos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="flex flex-col gap-3 border-t bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              Mostrando{" "}
              <b>{totalItems === 0 ? 0 : (page - 1) * pageSize + 1}</b> -{" "}
              <b>{Math.min(page * pageSize, totalItems)}</b> de{" "}
              <b>{totalItems}</b>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Filas:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 rounded-xl border bg-white px-2 text-sm outline-none focus:ring-2"
              >
                {[10, 20, 30, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                className="h-9 rounded-xl border px-3 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                «
              </button>

              <button
                className="h-9 rounded-xl border px-3 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </button>

              <span className="text-sm text-gray-700">
                Página <b>{page}</b> de <b>{totalPages}</b>
              </span>

              <button
                className="h-9 rounded-xl border px-3 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Siguiente
              </button>

              <button
                className="h-9 rounded-xl border px-3 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
              >
                »
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

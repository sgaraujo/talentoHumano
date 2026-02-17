import type { User } from "@/models/types/User";
import {
  getNombre,
  getCarrera,
  getUniversidad,
  getCargo,
  getDocumento,
  tieneEspecializacion,
} from "@/utils/userSearch";

export function UsersSearchTable({ users }: { users: User[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Carrera</th>
              <th className="px-4 py-3 font-medium">Universidad</th>
              <th className="px-4 py-3 font-medium">Especialización</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Email</th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => {
              const nombre = getNombre(u) || "—";
              const carrera = getCarrera(u) || "—";
              const uni = getUniversidad(u) || "—";
              const cargo = getCargo(u) || "—";
              const doc = getDocumento(u);
              const hasEsp = tieneEspecializacion(u);

              return (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{nombre}</div>
                    {doc ? (
                      <div className="text-xs text-muted-foreground">
                        Doc: {doc}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-3">{carrera}</td>
                  <td className="px-4 py-3">{uni}</td>

                  <td className="px-4 py-3">
                    {hasEsp ? (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                        Sí
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                        No
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">{cargo}</td>

                  <td className="px-4 py-3">
                    <span className="rounded-full border px-2 py-1 text-xs">
                      {u.role}
                    </span>
                  </td>

                  <td className="px-4 py-3">{u.email || "—"}</td>
                </tr>
              );
            })}

            {users.length === 0 && (
              <tr className="border-t">
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No hay resultados con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tarjeta de distribución: lista de categorías con su conteo y una barra
// proporcional al total. Se usa en Resumen (aprendices) y en las estadísticas
// por cuenta analítica.
export function DistributionCard({ title, items, total, emptyLabel = 'Sin datos', maxItems }: {
  title: string;
  items: [string, number][];
  total: number;
  emptyLabel?: string;
  /** Agrupa el resto en "Otros" cuando hay más categorías que este número. */
  maxItems?: number;
}) {
  const visible = maxItems && items.length > maxItems
    ? [...items.slice(0, maxItems - 1), ['Otros', items.slice(maxItems - 1).reduce((sum, [, count]) => sum + count, 0)] as [string, number]]
    : items;
  return (
    <div className="bg-white rounded-xl border border-[#E7E9EE] shadow-sm p-4">
      <p className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wide mb-3">{title}</p>
      {visible.length === 0 ? (
        <p className="text-xs text-gray-400 italic">{emptyLabel}</p>
      ) : (
        <div className="space-y-2.5">
          {visible.map(([name, count]) => (
            <div key={name}>
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-[#14171C] font-medium truncate" title={name}>{name}</span>
                <span className="text-[#14171C] font-bold flex-shrink-0">
                  {count}
                  <span className="ml-1 font-normal text-[#8B93A1]">{total ? Math.round((count / total) * 100) : 0}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-[#F1F2F4]">
                <div className="h-1.5 rounded-full bg-[#008C3C]" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

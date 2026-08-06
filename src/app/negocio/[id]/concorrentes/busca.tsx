"use client";

import { useActionState } from "react";

import { procurar, rastrear, type EstadoBusca } from "./acoes";

export function BuscaConcorrentes({
  businessId,
  sugestao,
  jaRastreados,
}: {
  businessId: string;
  sugestao: string;
  jaRastreados: string[];
}) {
  const [estado, acao, buscando] = useActionState<EstadoBusca, FormData>(
    procurar,
    null,
  );

  return (
    <section className="flex flex-col gap-4">
      <form action={acao} className="flex flex-wrap gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <input
          name="consulta"
          defaultValue={sugestao}
          placeholder="barbearia em Curitiba"
          className="min-w-56 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={buscando}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {buscando ? "Buscando…" : "Buscar concorrentes"}
        </button>
      </form>

      {estado && "erro" in estado && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      {estado && "resultados" in estado && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-500">
            {estado.resultados.length} resultado(s), na ordem de relevância que
            o Google devolveu — sem reordenação nossa.
          </p>
          <ul className="flex flex-col gap-2">
            {estado.resultados.map((r, i) => {
              const rastreado = jaRastreados.includes(r.placeId);
              return (
                <li
                  key={r.placeId}
                  className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800"
                >
                  <span className="flex gap-3">
                    <span className="w-5 text-neutral-400 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{r.nome}</span>
                      {r.endereco && (
                        <span className="text-xs text-neutral-500">
                          {r.endereco}
                        </span>
                      )}
                      <span className="text-xs text-neutral-500">
                        {r.nota ? `${r.nota} ★` : "sem nota"}
                        {r.totalAvaliacoes
                          ? ` · ${r.totalAvaliacoes} avaliações`
                          : ""}
                        {r.site ? " · tem site" : " · sem site"}
                        {r.temHorarios ? " · com horários" : " · sem horários"}
                      </span>
                    </span>
                  </span>

                  {rastreado ? (
                    <span className="whitespace-nowrap text-xs text-neutral-500">
                      já acompanhado
                    </span>
                  ) : (
                    <form action={rastrear}>
                      <input
                        type="hidden"
                        name="businessId"
                        value={businessId}
                      />
                      <input
                        type="hidden"
                        name="dados"
                        value={JSON.stringify(r)}
                      />
                      <button className="whitespace-nowrap rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700">
                        Acompanhar
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

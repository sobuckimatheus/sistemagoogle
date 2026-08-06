"use client";

import { useActionState } from "react";

import { analisarMercado, type EstadoAnalise } from "./acoes";

export function FormularioMercado() {
  const [estado, acao, pendente] = useActionState<EstadoAnalise | null, FormData>(
    analisarMercado,
    null,
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={acao} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Nome do negócio
            <input
              name="nome"
              required
              placeholder="Barbearia do João"
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Cidade
            <input
              name="cidade"
              required
              placeholder="Curitiba"
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Palavra-chave
            <input
              name="termo"
              required
              placeholder="barbearia"
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={pendente}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pendente ? "Consultando o Maps…" : "Analisar posição"}
        </button>

        <p className="text-xs text-neutral-500">
          Cada análise consome 1 busca da cota do SerpApi.
        </p>
      </form>

      {estado?.tipo === "erro" && (
        <p role="alert" className="text-sm text-red-600">
          {estado.mensagem}
        </p>
      )}

      {estado?.tipo === "resultado" && (
        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
            <p className="text-sm text-neutral-500">
              {estado.negocio} para &ldquo;{estado.termo}&rdquo;
            </p>
            <p className="text-3xl font-semibold tabular-nums">
              {estado.posicao ? `${estado.posicao}º lugar` : "fora do top 20"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Ranking na ordem real do Google
            </h3>
            <ol className="flex flex-col gap-1 text-sm">
              {estado.ranking.map((r) => (
                <li
                  key={`${r.posicao}-${r.titulo}`}
                  className={`flex items-center justify-between gap-4 rounded-md border p-3 ${
                    r.titulo === estado.negocio
                      ? "border-neutral-900 dark:border-white"
                      : "border-neutral-200 dark:border-neutral-800"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 text-neutral-500 tabular-nums">
                      {r.posicao}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-medium">{r.titulo}</span>
                      {r.endereco && (
                        <span className="text-xs text-neutral-500">
                          {r.endereco}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-neutral-500 tabular-nums">
                    {r.nota ? `${r.nota} ★` : "—"}{" "}
                    {r.totalAvaliacoes ? `(${r.totalAvaliacoes})` : ""}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-neutral-500">
              A ordem é a que o Google devolveu, sem reordenação nossa. Não
              existe primeiro lugar absoluto no Maps: toda posição é relativa
              ao ponto de onde se busca.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

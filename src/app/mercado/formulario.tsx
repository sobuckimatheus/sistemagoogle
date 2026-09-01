"use client";

import { useActionState, useState } from "react";

import {
  SeletorDeNegocio,
  type NegocioSelecionado,
} from "@/components/seletor-de-negocio";

import { analisarPosicao, type EstadoAnalise } from "./acoes";

export function FormularioMercado() {
  const [negocio, setNegocio] = useState<NegocioSelecionado | null>(null);

  const [estado, acao, analisando] = useActionState<
    EstadoAnalise | null,
    FormData
  >(analisarPosicao, null);

  return (
    <div className="flex flex-col gap-6">
      <form action={acao} className="flex flex-col gap-4">
        <SeletorDeNegocio
          negocio={negocio}
          aoSelecionar={setNegocio}
          aoLimpar={() => setNegocio(null)}
        />

        <label className="flex flex-col gap-1 text-sm">
          Serviço ou palavra-chave
          <input
            name="termo"
            required
            disabled={!negocio}
            placeholder="ex.: barbearia, corte masculino, clínica de estética"
            className="rounded-md border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span className="text-xs text-neutral-500">
            O termo que um cliente digitaria no Google para encontrar esse
            serviço.
          </span>
        </label>

        <input type="hidden" name="placeId" value={negocio?.placeId ?? ""} />
        <input type="hidden" name="nome" value={negocio?.nome ?? ""} />
        <input type="hidden" name="lat" value={negocio?.lat ?? ""} />
        <input type="hidden" name="lng" value={negocio?.lng ?? ""} />

        <button
          type="submit"
          disabled={analisando || !negocio}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {analisando ? "Consultando o Maps…" : "Ver posição"}
        </button>

        <p className="text-xs text-neutral-500">
          Cada verificação consome 1 busca da cota do SerpApi. A posição é
          medida a partir do endereço do próprio negócio.
        </p>
      </form>

      {estado?.tipo === "erro" && (
        <p role="alert" className="text-sm text-red-600">
          {estado.mensagem}
        </p>
      )}

      {estado?.tipo === "resultado" && <Resultado estado={estado} />}
    </div>
  );
}

function Resultado({
  estado,
}: {
  estado: Extract<EstadoAnalise, { tipo: "resultado" }>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">
          {estado.negocio} para &ldquo;{estado.termo}&rdquo;
        </p>
        <p className="text-3xl font-semibold tabular-nums">
          {estado.posicao ? `${estado.posicao}º lugar` : "fora do top 20"}
        </p>
        {!estado.posicao && (
          <p className="mt-1 text-xs text-neutral-500">
            O negócio não apareceu entre os resultados que o Google devolveu
            para esse termo, buscando do endereço dele.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Ranking na ordem real do Google</h3>
        <ol className="flex flex-col gap-1 text-sm">
          {estado.ranking.map((r) => {
            const ehOAlvo = r.placeId
              ? r.placeId === estado.placeId
              : r.titulo.toLowerCase() === estado.negocio.toLowerCase();

            return (
              <li
                key={`${r.posicao}-${r.titulo}`}
                className={`flex items-center justify-between gap-4 rounded-md border p-3 ${
                  ehOAlvo
                    ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 text-neutral-500 tabular-nums">
                    {r.posicao}
                  </span>
                  <span className="flex flex-col">
                    <span className={ehOAlvo ? "font-semibold" : "font-medium"}>
                      {r.titulo}
                    </span>
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
            );
          })}
        </ol>
        <p className="text-xs text-neutral-500">
          A ordem é a que o Google devolveu, sem reordenação nossa. Não existe
          primeiro lugar absoluto no Maps: toda posição é relativa ao ponto de
          onde se busca — aqui, o endereço do negócio analisado.
        </p>
      </div>
    </section>
  );
}

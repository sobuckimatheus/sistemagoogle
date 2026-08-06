"use client";

import { useActionState } from "react";

import { salvarLocais, type ResultadoSalvar } from "./acoes";

export type LocalSelecionavel = {
  valor: string; // JSON serializado com o que o Business precisa
  titulo: string;
  endereco: string;
  categoria: string | null;
  jaRastreado: boolean;
};

export function FormularioLocais({
  conexaoId,
  locais,
  maxNegocios,
  jaRastreados,
}: {
  conexaoId: string;
  locais: LocalSelecionavel[];
  maxNegocios: number;
  jaRastreados: number;
}) {
  const [estado, acao, pendente] = useActionState<
    ResultadoSalvar | null,
    FormData
  >(salvarLocais, null);

  const restantes = maxNegocios - jaRastreados;

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="conexaoId" value={conexaoId} />

      <p className="text-sm text-neutral-500">
        Seu plano permite {maxNegocios} negócio(s). Restam {restantes}.
      </p>

      <ul className="flex flex-col gap-2">
        {locais.map((local) => (
          <li key={local.valor}>
            <label
              className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
                local.jaRastreado
                  ? "border-neutral-200 opacity-60 dark:border-neutral-800"
                  : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-800"
              }`}
            >
              <input
                type="checkbox"
                name="local"
                value={local.valor}
                disabled={local.jaRastreado}
                defaultChecked={local.jaRastreado}
                className="mt-1"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{local.titulo}</span>
                <span className="text-neutral-500">{local.endereco}</span>
                {local.categoria && (
                  <span className="text-xs text-neutral-500">
                    {local.categoria}
                  </span>
                )}
                {local.jaRastreado && (
                  <span className="text-xs text-neutral-500">
                    já rastreado
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {estado && "erro" in estado && (
        <p role="alert" className="text-sm text-red-600">
          {estado.erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pendente ? "Salvando…" : "Rastrear selecionados"}
      </button>
    </form>
  );
}

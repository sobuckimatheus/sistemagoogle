"use client";

import { useActionState, useState } from "react";

import { gerarRascunho, publicarResposta, type ResultadoAcao } from "./acoes";

export type AvaliacaoView = {
  id: string;
  autor: string | null;
  estrelas: number | null;
  comentario: string | null;
  resposta: string | null;
  respondidaEm: string | null;
  rascunhoIa: string | null;
  criadaEm: string | null;
};

export function CartaoAvaliacao({ a }: { a: AvaliacaoView }) {
  const [texto, setTexto] = useState(a.resposta ?? a.rascunhoIa ?? "");

  const [estadoRascunho, acaoRascunho, gerando] = useActionState<
    ResultadoAcao | null,
    FormData
  >(async (anterior, fd) => {
    const r = await gerarRascunho(anterior, fd);
    if ("ok" in r && r.texto) setTexto(r.texto);
    return r;
  }, null);

  const [estadoPublicar, acaoPublicar, publicando] = useActionState<
    ResultadoAcao | null,
    FormData
  >(publicarResposta, null);

  const erro =
    (estadoRascunho && "erro" in estadoRascunho && estadoRascunho.erro) ||
    (estadoPublicar && "erro" in estadoPublicar && estadoPublicar.erro) ||
    null;

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{a.autor ?? "Anônimo"}</span>
          <span className="text-xs text-neutral-500">
            {a.estrelas ? "★".repeat(a.estrelas) + "☆".repeat(5 - a.estrelas) : "sem nota"}
            {a.criadaEm && ` · ${a.criadaEm}`}
          </span>
        </div>
        {a.respondidaEm && (
          <span className="text-xs text-green-700 dark:text-green-400">
            respondida
          </span>
        )}
      </div>

      {a.comentario && (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {a.comentario}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Escreva a resposta ou gere um rascunho…"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />

        <div className="flex flex-wrap items-center gap-2">
          <form action={acaoRascunho}>
            <input type="hidden" name="reviewId" value={a.id} />
            <button
              type="submit"
              disabled={gerando}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
            >
              {gerando ? "Gerando…" : "Gerar rascunho com IA"}
            </button>
          </form>

          <form action={acaoPublicar}>
            <input type="hidden" name="reviewId" value={a.id} />
            <input type="hidden" name="texto" value={texto} />
            <button
              type="submit"
              disabled={publicando || !texto.trim()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              {publicando
                ? "Publicando…"
                : a.respondidaEm
                  ? "Atualizar resposta"
                  : "Publicar resposta"}
            </button>
          </form>

          {a.rascunhoIa && !a.resposta && (
            <span className="text-xs text-neutral-500">
              rascunho gerado por IA — revise antes de publicar
            </span>
          )}
        </div>

        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
      </div>
    </li>
  );
}

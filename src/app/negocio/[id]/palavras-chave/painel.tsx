"use client";

import { useActionState, useState } from "react";

import {
  adicionarPalavra,
  removerPalavra,
  revalidarVolumes,
  sugerirComIa,
  type EstadoKeywords,
} from "./acoes";

export type PalavraView = {
  id: string;
  termo: string;
  volume: number | null;
  volumeAtualizadoEm: string | null;
};

export function PainelPalavrasChave({
  businessId,
  palavras,
  limite,
  usadas,
}: {
  businessId: string;
  palavras: PalavraView[];
  limite: number;
  usadas: number;
}) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  const [estadoAdd, acaoAdd, adicionando] = useActionState<
    EstadoKeywords,
    FormData
  >(adicionarPalavra, null);

  const [estadoIa, acaoIa, sugerindo] = useActionState<EstadoKeywords, FormData>(
    sugerirComIa,
    null,
  );

  const [estadoVolume, acaoVolume, atualizandoVolume] = useActionState<
    EstadoKeywords,
    FormData
  >(revalidarVolumes, null);

  const sugestoes =
    estadoIa && "sugestoes" in estadoIa ? estadoIa.sugestoes : [];

  const mensagem =
    (estadoAdd && "erro" in estadoAdd && estadoAdd.erro) ||
    (estadoIa && "erro" in estadoIa && estadoIa.erro) ||
    (estadoVolume && "erro" in estadoVolume && estadoVolume.erro) ||
    null;

  const sucesso =
    (estadoAdd && "ok" in estadoAdd && estadoAdd.ok) ||
    (estadoVolume && "ok" in estadoVolume && estadoVolume.ok) ||
    null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Adicionar termos</h2>
          <span className="text-xs text-neutral-500">
            {usadas} de {limite} no plano
          </span>
        </div>

        <form action={acaoAdd} className="flex flex-wrap gap-2">
          <input type="hidden" name="businessId" value={businessId} />
          <input
            name="termo"
            required
            placeholder="barbearia no centro"
            className="min-w-56 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={adicionando}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {adicionando ? "Adicionando…" : "Adicionar"}
          </button>
        </form>

        <form action={acaoIa}>
          <input type="hidden" name="businessId" value={businessId} />
          <button
            type="submit"
            disabled={sugerindo}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
          >
            {sugerindo ? "Pensando…" : "Sugerir com IA"}
          </button>
        </form>

        {sugestoes.length > 0 && (
          <form action={acaoAdd} className="flex flex-col gap-3">
            <input type="hidden" name="businessId" value={businessId} />
            <p className="text-xs text-neutral-500">
              Selecione as que fazem sentido — o cliente digita do jeito dele,
              não do jeito do setor.
            </p>
            <div className="flex flex-wrap gap-2">
              {sugestoes.map((s) => {
                const ativa = selecionadas.includes(s);
                return (
                  <label
                    key={s}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                      ativa
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                        : "border-neutral-300 dark:border-neutral-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="termo"
                      value={s}
                      checked={ativa}
                      onChange={(e) =>
                        setSelecionadas((atual) =>
                          e.target.checked
                            ? [...atual, s]
                            : atual.filter((t) => t !== s),
                        )
                      }
                      className="sr-only"
                    />
                    {s}
                  </label>
                );
              })}
            </div>
            <button
              type="submit"
              disabled={selecionadas.length === 0 || adicionando}
              className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              Adicionar {selecionadas.length} selecionada(s)
            </button>
          </form>
        )}

        {mensagem && (
          <p role="alert" className="text-sm text-red-600">
            {mensagem}
          </p>
        )}
        {sucesso && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            {sucesso}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium">
            Termos monitorados ({palavras.length})
          </h2>
          {palavras.length > 0 && (
            <form action={acaoVolume}>
              <input type="hidden" name="businessId" value={businessId} />
              <button
                type="submit"
                disabled={atualizandoVolume}
                className="text-xs text-neutral-500 underline disabled:opacity-50"
              >
                {atualizandoVolume
                  ? "Consultando o Google Ads…"
                  : "Atualizar volumes"}
              </button>
            </form>
          )}
        </div>
        {palavras.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nenhum termo ainda. Eles são a base do rastreamento de posição.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {palavras.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <span className="font-medium">{p.termo}</span>
                <span className="flex items-center gap-4">
                  <span className="text-neutral-500 tabular-nums">
                    {p.volume !== null
                      ? `${p.volume.toLocaleString("pt-BR")} buscas/mês`
                      : "volume indisponível"}
                  </span>
                  <form action={removerPalavra}>
                    <input type="hidden" name="keywordId" value={p.id} />
                    <button className="text-xs text-neutral-500 underline">
                      remover
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-neutral-500">
          O volume é a média de buscas por mês, revalidada mensalmente. A
          origem é sempre o Keyword Planner do Google — direto pela API do
          Google Ads, quando configurada, ou por um provedor intermediário. Só
          a conta do Ads com investimento ativo abre o número fechado; as
          demais fontes entregam valores arredondados. Termo sem volume
          continua valendo para o rastreamento de posição.
        </p>
      </section>
    </div>
  );
}

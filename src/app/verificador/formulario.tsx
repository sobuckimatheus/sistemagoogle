"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FotoNegocio } from "@/components/foto-negocio";
import {
  SeletorDeNegocio,
  type NegocioSelecionado,
} from "@/components/seletor-de-negocio";

import { verificarPosicao, type EstadoVerificacao } from "./acoes";

export function VerificadorPublico() {
  const [negocio, setNegocio] = useState<NegocioSelecionado | null>(null);
  const [estado, acao, verificando] = useActionState<
    EstadoVerificacao | null,
    FormData
  >(verificarPosicao, null);

  return (
    <div className="flex flex-col gap-8">
      <form
        action={acao}
        className="flex flex-col gap-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 sm:p-8"
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Passo 1
          </span>
          <SeletorDeNegocio
            negocio={negocio}
            aoSelecionar={setNegocio}
            aoLimpar={() => setNegocio(null)}
            rotulo="Qual é a sua empresa?"
            placeholder="Digite o nome do seu negócio…"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Passo 2
          </span>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Que serviço seu cliente procura no Google?
            <input
              name="termo"
              required
              disabled={!negocio}
              placeholder="ex.: barbearia, clínica de estética, conserto de celular"
              className="rounded-lg border border-neutral-300 px-4 py-3 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <span className="text-xs text-neutral-500">
            Use as palavras que um cliente digitaria — não o nome da sua
            empresa.
          </span>
        </div>

        <input type="hidden" name="placeId" value={negocio?.placeId ?? ""} />
        <input type="hidden" name="nome" value={negocio?.nome ?? ""} />
        <input type="hidden" name="lat" value={negocio?.lat ?? ""} />
        <input type="hidden" name="lng" value={negocio?.lng ?? ""} />

        <button
          type="submit"
          disabled={verificando || !negocio}
          className="rounded-lg bg-neutral-900 px-6 py-3.5 text-base font-semibold text-white transition disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {verificando ? "Medindo sua região…" : "Ver minha posição grátis"}
        </button>

        <p className="text-center text-xs text-neutral-500">
          Grátis, sem cadastro e sem cartão. Medimos 25 pontos da sua região,
          então leva alguns segundos.
        </p>
      </form>

      {estado?.tipo === "erro" && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {estado.mensagem}
        </p>
      )}

      {estado?.tipo === "resultado" && <Resultado estado={estado} />}
    </div>
  );
}

/**
 * O resultado é a peça de venda.
 *
 * A manchete é a **posição média na região**, não a posição medida do
 * endereço do próprio negócio — essa dá sempre primeiro lugar, porque a
 * distância é zero e o Maps ordena por proximidade além de relevância.
 * "Você é o primeiro" não vende nada; "você é, em média, o 15º" é a dor, e é
 * verdade.
 *
 * Uma posição só, e não três. A posição típica e a da porta existiam nos
 * bastidores da medição, mas na tela competiam pela atenção com o número que
 * importa.
 */
function Resultado({
  estado,
}: {
  estado: Extract<EstadoVerificacao, { tipo: "resultado" }>;
}) {
  const m = estado.medicao;
  // Fora do top 3 é onde a lista do Maps já exige um clique a mais para ser
  // vista — é o limite prático de quem é encontrado.
  const fraco = m.posicaoMedia === null || m.posicaoMedia > 3;
  const ausente = m.pontosComMercado - m.pontosOndeAparece;

  return (
    <section className="flex flex-col gap-6">
      <div
        className={`flex flex-col gap-4 rounded-2xl border-2 p-6 sm:p-8 ${
          fraco
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
            : "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        }`}
      >
        <span className="text-sm text-neutral-600 dark:text-neutral-300">
          {estado.negocio} · &ldquo;{estado.termo}&rdquo;
        </span>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Sua posição média na região
          </span>
          <p className="text-5xl font-bold tabular-nums sm:text-6xl">
            {m.posicaoMedia ? `${m.posicaoMedia}º lugar` : "não aparece"}
          </p>
        </div>

        <p className="text-lg">
          {ausente > 0 ? (
            <>
              Em <strong>{ausente} dos {m.pontosComMercado} pontos</strong> que
              medimos na sua região, quem procura esse serviço{" "}
              <strong>não encontra você</strong> — encontra seus concorrentes.
            </>
          ) : (
            <>
              Você aparece nos {m.pontosComMercado} pontos medidos, mas a
              posição muda conforme o bairro de quem procura.
            </>
          )}
        </p>

        <p className="text-xs text-neutral-500">
          Média das suas posições em {m.totalPontos} pontos espalhados pela sua
          região — a posição no Maps muda conforme de onde a pessoa procura, e
          medir de um ponto só não diz nada. Onde você não aparece entre os 20
          primeiros, contamos como 21º. Pontos sem nenhum resultado, área sem
          esse tipo de negócio, ficam de fora da conta.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          O que o Google mostra a {m.kmDoPontoDaLista} km da sua empresa
        </h2>
        <ol className="flex flex-col gap-1.5 text-sm">
          {estado.medicao.ranking.slice(0, 10).map((r) => {
            const ehVoce = r.placeId
              ? r.placeId === estado.placeId
              : r.titulo.toLowerCase() === estado.negocio.toLowerCase();

            return (
              <li
                key={`${r.posicao}-${r.titulo}`}
                className={`flex items-center justify-between gap-4 rounded-lg border p-3 ${
                  ehVoce
                    ? "border-2 border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-900"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-10 shrink-0 text-neutral-500 tabular-nums">
                    {r.posicao}º
                  </span>
                  <FotoNegocio foto={r.foto} nome={r.titulo} tamanho="sm" />
                  <span className="flex min-w-0 flex-col">
                    <span className={ehVoce ? "font-bold" : "font-medium"}>
                      {r.titulo}
                      {ehVoce && (
                        <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] uppercase text-white dark:bg-white dark:text-neutral-900">
                          você
                        </span>
                      )}
                    </span>
                    {r.endereco && (
                      <span className="text-xs text-neutral-500">
                        {r.endereco}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-neutral-500 tabular-nums">
                  {r.nota ? `${r.nota} ★` : "—"}{" "}
                  {r.totalAvaliacoes ? `(${r.totalAvaliacoes})` : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-neutral-500">
          Busca real do Google, feita de um dos {m.totalPontos} pontos medidos
          — escolhemos justamente aquele onde você está na sua posição média,
          por isso o número acima é o mesmo que aparece aqui. Ordem exata
          devolvida pelo Google, sem reordenação nossa.
        </p>
      </div>

      <ChamadaParaAcao posicaoMedia={m.posicaoMedia} />
    </section>
  );
}

function ChamadaParaAcao({ posicaoMedia }: { posicaoMedia: number | null }) {
  const fraco = posicaoMedia === null || posicaoMedia > 3;

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-neutral-900 p-6 text-white dark:bg-white dark:text-neutral-900 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {fraco
            ? "Quem procura primeiro, encontra outro."
            : "Descobrir a posição foi a parte fácil. Mantê-la é o trabalho."}
        </h2>
        <p className="text-sm opacity-80">
          Posição no Maps é resultado de coisas que dá para medir e corrigir:
          perfil completo, avaliações respondidas, publicações frequentes e as
          palavras certas na descrição. O Painel GBP acompanha tudo isso todo
          dia e diz, em ordem, o que corrigir primeiro.
        </p>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {[
          "Acompanhamento diário da sua posição e da nota do perfil",
          "Lista priorizada do que está te segurando, com link direto para resolver",
          "Rascunhos de resposta às avaliações, escritos por IA e revisados por você",
          "Comparativo com os concorrentes que aparecem à sua frente",
          "Alerta quando algo muda — avaliação nova, queda de nota, perfil parado",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0">
              ✓
            </span>
            <span className="opacity-90">{item}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/cadastro"
          className="rounded-lg bg-white px-6 py-3.5 text-center text-base font-semibold text-neutral-900 dark:bg-neutral-900 dark:text-white"
        >
          Começar agora
        </Link>
        <span className="text-xs opacity-70">
          Teste sem cartão de crédito. Cancele quando quiser.
        </span>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

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
          {verificando ? "Consultando o Google…" : "Ver minha posição grátis"}
        </button>

        <p className="text-center text-xs text-neutral-500">
          Grátis, sem cadastro e sem cartão. O resultado aparece nesta tela.
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
 * O número sozinho não convence ninguém: "7º lugar" é abstrato. O que move é
 * a consequência — quantos concorrentes o cliente vê antes de ver você, e
 * quem são eles. Por isso o destaque é o número de concorrentes à frente, e
 * a lista mostra nome por nome.
 */
function Resultado({
  estado,
}: {
  estado: Extract<EstadoVerificacao, { tipo: "resultado" }>;
}) {
  const dentroDoTop3 = estado.posicao !== null && estado.posicao <= 3;

  return (
    <section className="flex flex-col gap-6">
      <div
        className={`flex flex-col gap-3 rounded-2xl border-2 p-6 sm:p-8 ${
          dentroDoTop3
            ? "border-green-600 bg-green-50 dark:bg-green-950/30"
            : "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
        }`}
      >
        <span className="text-sm text-neutral-600 dark:text-neutral-300">
          {estado.negocio} · &ldquo;{estado.termo}&rdquo;
        </span>

        {estado.posicao ? (
          <>
            <p className="text-5xl font-bold tabular-nums">
              {estado.posicao}º lugar
            </p>
            <p className="text-lg">
              {dentroDoTop3 ? (
                <>
                  Você está no <strong>top 3</strong> — a faixa que concentra a
                  maioria dos cliques. O desafio agora é continuar lá.
                </>
              ) : (
                <>
                  <strong>
                    {estado.concorrentesAcima} concorrentes aparecem antes de
                    você
                  </strong>{" "}
                  quando alguém procura esse serviço na sua região.
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl font-bold">Você não apareceu</p>
            <p className="text-lg">
              Seu perfil não entrou nos resultados que o Google mostrou para
              esse serviço. Na prática, esse cliente não te encontra.
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          Quem o Google mostra para esse serviço
        </h2>
        <ol className="flex flex-col gap-1.5 text-sm">
          {estado.ranking.slice(0, 10).map((r) => {
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
                <span className="flex items-center gap-3">
                  <span className="w-6 text-neutral-500 tabular-nums">
                    {r.posicao}
                  </span>
                  <span className="flex flex-col">
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
          Ordem exata devolvida pelo Google, medida a partir do endereço da sua
          empresa. Não existe primeira posição absoluta no Maps: ela muda
          conforme o bairro de quem procura.
        </p>
      </div>

      <ChamadaParaAcao posicao={estado.posicao} />
    </section>
  );
}

function ChamadaParaAcao({ posicao }: { posicao: number | null }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-neutral-900 p-6 text-white dark:bg-white dark:text-neutral-900 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {posicao && posicao <= 3
            ? "Descobrir a posição foi a parte fácil. Manter é o trabalho."
            : "Agora você sabe o número. O que muda ele?"}
        </h2>
        <p className="text-sm opacity-80">
          Sua posição no Maps é resultado de coisas que dá para medir e
          corrigir: perfil completo, avaliações respondidas, publicações
          frequentes e as palavras certas na descrição. O Painel GBP acompanha
          tudo isso todo dia e diz, em ordem, o que corrigir primeiro.
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

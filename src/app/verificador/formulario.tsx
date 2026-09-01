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
          {verificando ? "Medindo seu alcance…" : "Ver meu alcance grátis"}
        </button>

        <p className="text-center text-xs text-neutral-500">
          Grátis, sem cadastro e sem cartão. Medimos a várias distâncias, então
          leva alguns segundos.
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
 * O destaque não é a posição, é o **alcance** — até que distância o negócio
 * ainda é encontrado. Medir do endereço dele dá sempre primeiro lugar, porque
 * a distância é zero e o Maps ordena por proximidade também; esse número faz
 * todo mundo se sentir líder e não vende nada.
 *
 * "Você domina dois quarteirões e some a cinco quilômetros" é verdade, é
 * específico, e é a informação que o dono não tem.
 */
function Resultado({
  estado,
}: {
  estado: Extract<EstadoVerificacao, { tipo: "resultado" }>;
}) {
  const alcance = estado.alcanceKm;
  const nuncaAparece = alcance === null;
  const alcanceCurto = alcance !== null && alcance < 2;

  return (
    <section className="flex flex-col gap-6">
      <div
        className={`flex flex-col gap-4 rounded-2xl border-2 p-6 sm:p-8 ${
          nuncaAparece || alcanceCurto
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
            : "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        }`}
      >
        <span className="text-sm text-neutral-600 dark:text-neutral-300">
          {estado.negocio} · &ldquo;{estado.termo}&rdquo;
        </span>

        {nuncaAparece ? (
          <>
            <p className="text-4xl font-bold">Você não apareceu</p>
            <p className="text-lg">
              Seu perfil não entrou nos resultados nem para quem está na porta
              da sua empresa. Na prática, esse cliente não te encontra.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              Seu alcance
            </p>
            <p className="text-4xl font-bold sm:text-5xl">
              {alcance === 0
                ? "Só bem perto da sua porta"
                : `Cerca de ${alcance} km`}
            </p>
            <p className="text-lg">
              {alcance === 0 ? (
                <>
                  Já a <strong>2 km</strong> daqui, quem procura por esse
                  serviço encontra seus concorrentes antes de você.
                </>
              ) : (
                <>
                  A partir de <strong>{alcance} km</strong>, quem procura por
                  esse serviço passa a encontrar seus concorrentes primeiro.
                </>
              )}
            </p>
          </>
        )}

        <dl className="mt-2 flex flex-col divide-y divide-neutral-200 border-t border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-neutral-600 dark:text-neutral-400">
              Na porta da sua empresa
            </dt>
            <dd className="font-semibold tabular-nums">
              {estado.naPorta ? `${estado.naPorta}º lugar` : "não aparece"}
            </dd>
          </div>

          {estado.aneis.map((anel) => (
            <div
              key={anel.km}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <dt className="text-neutral-600 dark:text-neutral-400">
                A {anel.km} km daqui
              </dt>
              <dd className="text-right font-semibold tabular-nums">
                {anel.presencas === 0 ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    não aparece
                  </span>
                ) : (
                  <>
                    {anel.tipica}º lugar
                    {anel.presencas < anel.posicoes.length && (
                      <span className="ml-2 font-normal text-neutral-500">
                        (some em {anel.posicoes.length - anel.presencas} de{" "}
                        {anel.posicoes.length} direções)
                      </span>
                    )}
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-xs text-neutral-500">
          Medimos em quatro direções a cada distância, porque a posição muda
          conforme o lado da cidade de onde o cliente procura.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          Quem o Google mostra para quem está a {estado.kmDoRanking} km
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
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-6 shrink-0 text-neutral-500 tabular-nums">
                    {r.posicao}
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
          Ordem exata devolvida pelo Google. Não existe primeira posição
          absoluta no Maps: ela muda conforme de onde o cliente procura — por
          isso medimos a várias distâncias em vez de uma só.
        </p>
      </div>

      <ChamadaParaAcao alcanceKm={estado.alcanceKm} />
    </section>
  );
}

function ChamadaParaAcao({ alcanceKm }: { alcanceKm: number | null }) {
  const limitado = alcanceKm === null || alcanceKm < 5;

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-neutral-900 p-6 text-white dark:bg-white dark:text-neutral-900 sm:p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {limitado
            ? "Alcance pequeno é cliente que vai para o concorrente."
            : "Descobrir o alcance foi a parte fácil. Mantê-lo é o trabalho."}
        </h2>
        <p className="text-sm opacity-80">
          O quanto seu perfil alcança é resultado de coisas que dá para medir e
          corrigir: perfil completo, avaliações respondidas, publicações
          frequentes e as palavras certas na descrição. O Painel GBP acompanha
          tudo isso todo dia e diz, em ordem, o que corrigir primeiro.
        </p>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {[
          "Acompanhamento diário do seu alcance e da nota do perfil",
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

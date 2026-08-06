import Link from "next/link";

import { dinheiro, percentual } from "@/components/cartao-metrica";
import { GraficoLinha } from "@/components/grafico-linha";
import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { montarDashboard, periodoDeDias } from "@/lib/dashboard/agregacao";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PERIODOS = [30, 90];

/**
 * Relatório do período, desenhado para virar PDF pelo próprio navegador.
 *
 * Sem biblioteca de PDF de propósito: gerar PDF no servidor exigiria
 * headless browser (~50 MB, problemático em serverless) ou um renderizador
 * dedicado, e o PRD marca o template próprio como fora do MVP. Imprimir para
 * PDF resolve o caso de uso — mandar o relatório ao cliente no fim do mês —
 * sem essa dívida.
 */
export default async function RelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dias?: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  await exigirNegocioDaConta(id, conta.id);

  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;

  const d = await montarDashboard(id, dias);
  const periodo = periodoDeDias(dias);

  const linhas = await prisma.performanceDaily.findMany({
    where: { businessId: id, date: { gte: periodo.inicio, lt: periodo.fim } },
    orderBy: { date: "asc" },
  });

  const serie = linhas.map((l) => ({
    data: l.date,
    valor: l.viewsSearch + l.viewsMaps,
  }));

  const formatoData = new Intl.DateTimeFormat("pt-BR");
  const emitidoEm = new Date();

  return (
    <>
      {/* Esconde a navegação do app na impressão e ajusta a página */}
      <style>{`
        @media print {
          nav, .nao-imprimir { display: none !important; }
          body { background: white; }
          main { max-width: none !important; padding: 0 !important; }
          .quebra { break-inside: avoid; }
        }
        @page { margin: 16mm; }
      `}</style>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10 print:gap-6">
        <div className="nao-imprimir flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex gap-1 text-sm">
            {PERIODOS.map((p) => (
              <Link
                key={p}
                href={`/negocio/${id}/relatorio?dias=${p}`}
                className={`rounded-md px-3 py-1.5 ${
                  p === dias
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "border border-neutral-200 dark:border-neutral-800"
                }`}
              >
                últimos {p} dias
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a
              href={`/api/negocio/${id}/relatorio.csv?dias=${dias}`}
              className="underline"
            >
              Baixar CSV
            </a>
            <span className="text-neutral-500">
              Use Ctrl/Cmd+P para salvar em PDF
            </span>
          </div>
        </div>

        <header className="flex flex-col gap-1 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <h1 className="text-2xl font-semibold tracking-tight">
            {d.negocio.title}
          </h1>
          <p className="text-sm text-neutral-500">
            Relatório de desempenho no Google ·{" "}
            {formatoData.format(periodo.inicio)} a{" "}
            {formatoData.format(periodo.fim)}
          </p>
          <p className="text-xs text-neutral-400">
            Emitido em {emitidoEm.toLocaleString("pt-BR")}
          </p>
        </header>

        <section className="quebra flex flex-col gap-3">
          <h2 className="text-sm font-medium">Resumo do período</h2>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Visualizações", d.atual.visualizacoes, d.variacoes.visualizacoes],
                ["Ligações", d.atual.ligacoes, d.variacoes.ligacoes],
                ["Solicitações de rota", d.atual.rotas, d.variacoes.rotas],
                [
                  "Cliques no site",
                  d.atual.cliquesNoSite,
                  d.variacoes.cliquesNoSite,
                ],
              ].map(([rotulo, valor, variacao]) => (
                <tr
                  key={rotulo as string}
                  className="border-b border-neutral-200 dark:border-neutral-800"
                >
                  <td className="py-2 text-neutral-600 dark:text-neutral-400">
                    {rotulo as string}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {(valor as number).toLocaleString("pt-BR")}
                  </td>
                  <td className="w-40 py-2 text-right text-xs tabular-nums text-neutral-500">
                    {d.temHistorico && variacao !== null
                      ? `${(variacao as number) >= 0 ? "+" : ""}${percentual(
                          variacao as number,
                        )} vs. anterior`
                      : "sem base de comparação"}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-2 text-neutral-600 dark:text-neutral-400">
                  Nota do perfil
                </td>
                <td className="py-2 text-right tabular-nums">
                  {d.auditoria.score ?? "—"}/100
                </td>
                <td />
              </tr>
              <tr>
                <td className="py-2 text-neutral-600 dark:text-neutral-400">
                  Avaliações
                </td>
                <td className="py-2 text-right tabular-nums">
                  {d.avaliacoes.media?.toFixed(1) ?? "—"} ({d.avaliacoes.total})
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>

        {serie.length >= 2 && (
          <section className="quebra flex flex-col gap-3">
            <h2 className="text-sm font-medium">Evolução das visualizações</h2>
            <GraficoLinha serie={serie} rotulo="Visualizações" />
          </section>
        )}

        <section className="quebra flex flex-col gap-3">
          <h2 className="text-sm font-medium">Estimativa de resultado</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-2 text-neutral-600 dark:text-neutral-400">
                  Clientes estimados
                </td>
                <td className="py-2 text-right tabular-nums">
                  {d.estimativas.clientesEstimados.toFixed(0)}
                </td>
              </tr>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-2 text-neutral-600 dark:text-neutral-400">
                  Faturamento atribuído
                </td>
                <td className="py-2 text-right tabular-nums">
                  {dinheiro.format(d.estimativas.receitaAtual)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-neutral-600 dark:text-neutral-400">
                  Receita não capturada
                </td>
                <td className="py-2 text-right tabular-nums">
                  {dinheiro.format(d.estimativas.receitaPerdida)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-neutral-500">
            Estimativas calculadas sobre as ações reais do perfil, usando
            ticket médio de {dinheiro.format(d.estimativas.ticketUsado)}
            {d.estimativas.usouBenchmark.ticket
              ? " (referência do segmento)"
              : " (informado pelo negócio)"}{" "}
            e taxa de conversão de {percentual(d.estimativas.taxaUsada)}
            {d.estimativas.usouBenchmark.taxa
              ? " (referência do segmento)"
              : " (informada pelo negócio)"}
            . Não são valores medidos pelo Google.
          </p>
        </section>

        {d.pendencias.length > 0 && (
          <section className="quebra flex flex-col gap-3">
            <h2 className="text-sm font-medium">Recomendações</h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              {d.pendencias.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.title}</span>
                  {p.description && (
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {" "}
                      — {p.description}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
          Cliques no botão de WhatsApp não são rastreáveis pela API do Google e
          não estão neste relatório.
        </footer>
      </main>
    </>
  );
}

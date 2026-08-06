import Link from "next/link";

import { GraficoLinha } from "@/components/grafico-linha";
import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { periodoDeDias } from "@/lib/dashboard/agregacao";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

const METRICAS = {
  visualizacoes: { rotulo: "Visualizações", campos: ["viewsSearch", "viewsMaps"] },
  calls: { rotulo: "Ligações", campos: ["calls"] },
  directionRequests: { rotulo: "Rotas", campos: ["directionRequests"] },
  websiteClicks: { rotulo: "Cliques no site", campos: ["websiteClicks"] },
  conversations: { rotulo: "Conversas", campos: ["conversations"] },
  bookings: { rotulo: "Agendamentos", campos: ["bookings"] },
} as const;

type ChaveMetrica = keyof typeof METRICAS;

export default async function DesempenhoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dias?: string; metrica?: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const metrica: ChaveMetrica =
    sp.metrica && sp.metrica in METRICAS
      ? (sp.metrica as ChaveMetrica)
      : "visualizacoes";

  const periodo = periodoDeDias(dias);

  const linhas = await prisma.performanceDaily.findMany({
    where: { businessId: id, date: { gte: periodo.inicio, lt: periodo.fim } },
    orderBy: { date: "asc" },
  });

  const serie = linhas.map((l) => ({
    data: l.date,
    valor: METRICAS[metrica].campos.reduce(
      (s, campo) => s + (l[campo as keyof typeof l] as number),
      0,
    ),
  }));

  const total = serie.reduce((s, p) => s + p.valor, 0);
  const totalSearch = linhas.reduce((s, l) => s + l.viewsSearch, 0);
  const totalMaps = linhas.reduce((s, l) => s + l.viewsMaps, 0);
  const visualizacoes = totalSearch + totalMaps;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link
          href={`/negocio/${id}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {negocio.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Desempenho</h1>
        <p className="text-sm text-neutral-500">
          Série diária persistida no banco — comparar qualquer intervalo não
          consulta o Google de novo.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <nav className="flex gap-1 rounded-md border border-neutral-200 p-1 text-sm dark:border-neutral-800">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`/negocio/${id}/desempenho?dias=${p}&metrica=${metrica}`}
              className={`rounded px-3 py-1 ${
                p === dias
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 dark:text-neutral-400"
              }`}
            >
              {p}d
            </Link>
          ))}
        </nav>
      </div>

      <nav className="flex flex-wrap gap-1 text-sm">
        {(Object.keys(METRICAS) as ChaveMetrica[]).map((m) => (
          <Link
            key={m}
            href={`/negocio/${id}/desempenho?dias=${dias}&metrica=${m}`}
            className={`rounded-md px-3 py-1.5 ${
              m === metrica
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            {METRICAS[m].rotulo}
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">{METRICAS[metrica].rotulo}</h2>
          <span className="text-2xl font-semibold tabular-nums">
            {total.toLocaleString("pt-BR")}
          </span>
        </div>
        <GraficoLinha serie={serie} rotulo={METRICAS[metrica].rotulo} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Busca x Maps</h2>
        {visualizacoes > 0 ? (
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">
                Busca — quem procurou pelo nome ou pelo serviço
              </dt>
              <dd className="tabular-nums">
                {totalSearch.toLocaleString("pt-BR")} (
                {Math.round((totalSearch / visualizacoes) * 100)}%)
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">
                Maps — quem estava explorando o mapa
              </dt>
              <dd className="tabular-nums">
                {totalMaps.toLocaleString("pt-BR")} (
                {Math.round((totalMaps / visualizacoes) * 100)}%)
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">sem dados no período</p>
        )}
      </section>

      <p className="rounded-lg border border-neutral-200 p-4 text-xs text-neutral-500 dark:border-neutral-800">
        Cliques no botão de WhatsApp não aparecem aqui: a API do Google não
        expõe essa métrica. Se o WhatsApp é o seu canal principal, o número
        real de contatos é maior do que o exibido.
      </p>
    </main>
  );
}

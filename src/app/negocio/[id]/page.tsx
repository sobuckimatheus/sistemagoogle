import Link from "next/link";

import {
  CartaoMetrica,
  dinheiro,
  percentual,
} from "@/components/cartao-metrica";
import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { montarDashboard } from "@/lib/dashboard/agregacao";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

export default async function DashboardNegocio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dias?: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  await exigirNegocioDaConta(id, conta.id);

  const { dias: diasBruto } = await searchParams;
  const dias = PERIODOS.includes(Number(diasBruto)) ? Number(diasBruto) : 30;

  const d = await montarDashboard(id, dias);
  const semDados = d.atual.visualizacoes === 0 && d.atual.ligacoes === 0;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/" className="text-xs text-neutral-500 hover:underline">
            ← todos os negócios
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {d.negocio.title}
          </h1>
          <p className="text-sm text-neutral-500">
            {[d.negocio.primaryCategory, d.negocio.city]
              .filter(Boolean)
              .join(" · ") || "sem categoria definida"}
          </p>
        </div>
        <nav className="flex gap-1 rounded-md border border-neutral-200 p-1 text-sm dark:border-neutral-800">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`/negocio/${id}?dias=${p}`}
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
      </header>

      {semDados && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Ainda não há dados de desempenho. Eles aparecem depois do primeiro
          sync bem-sucedido — o que exige a aprovação do allowlist das Business
          Profile APIs pelo Google.
          {d.negocio.lastSyncedAt && (
            <> Último sync: {d.negocio.lastSyncedAt.toLocaleString("pt-BR")}.</>
          )}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <CartaoMetrica
          titulo="Nota do perfil"
          valor={d.auditoria.score}
          sufixo="/100"
          temHistorico={d.auditoria.variacao !== null}
          variacao={
            d.auditoria.variacao !== null && d.auditoria.score
              ? d.auditoria.variacao / d.auditoria.score
              : null
          }
        />
        <CartaoMetrica
          titulo="Visualizações"
          valor={d.atual.visualizacoes}
          variacao={d.variacoes.visualizacoes}
          temHistorico={d.temHistorico}
        />
        <CartaoMetrica
          titulo="Ligações"
          valor={d.atual.ligacoes}
          variacao={d.variacoes.ligacoes}
          temHistorico={d.temHistorico}
        />
        <CartaoMetrica
          titulo="Rotas"
          valor={d.atual.rotas}
          variacao={d.variacoes.rotas}
          temHistorico={d.temHistorico}
        />
        <CartaoMetrica
          titulo="Cliques no site"
          valor={d.atual.cliquesNoSite}
          variacao={d.variacoes.cliquesNoSite}
          temHistorico={d.temHistorico}
        />
        <CartaoMetrica
          titulo="Avaliações"
          valor={
            d.avaliacoes.media
              ? `${d.avaliacoes.media.toFixed(1)}`
              : d.avaliacoes.total
          }
          sufixo={d.avaliacoes.media ? ` (${d.avaliacoes.total})` : undefined}
          temHistorico={false}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Receita perdida (estimativa)</h2>
          <p className="text-3xl font-semibold tabular-nums">
            {dinheiro.format(d.estimativas.receitaPerdida)}
          </p>
          <p className="text-xs text-neutral-500">
            no período de {dias} dias, se o perfil convertesse como o topo do
            segmento
          </p>
          <Link
            href="/como-calculamos"
            className="text-xs underline text-neutral-500"
          >
            Entenda como calculamos isso
          </Link>
        </article>

        <article className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-medium">
            Desempenho financeiro estimado
          </h2>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Faturamento atribuído</dt>
              <dd className="tabular-nums">
                {dinheiro.format(d.estimativas.receitaAtual)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Clientes estimados</dt>
              <dd className="tabular-nums">
                {d.estimativas.clientesEstimados.toFixed(0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Ticket médio</dt>
              <dd className="tabular-nums">
                {dinheiro.format(d.estimativas.ticketUsado)}
                {d.estimativas.usouBenchmark.ticket && (
                  <span className="text-neutral-400"> (referência)</span>
                )}
              </dd>
            </div>
          </dl>
        </article>

        <article className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Fontes de visualização</h2>
          {d.atual.visualizacoes > 0 ? (
            <>
              <div className="flex h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="bg-neutral-900 dark:bg-white"
                  style={{
                    width: `${(d.atual.viewsSearch / d.atual.visualizacoes) * 100}%`,
                  }}
                />
              </div>
              <dl className="grid gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Busca</dt>
                  <dd className="tabular-nums">
                    {percentual(d.atual.viewsSearch / d.atual.visualizacoes, 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Maps</dt>
                  <dd className="tabular-nums">
                    {percentual(d.atual.viewsMaps / d.atual.visualizacoes, 0)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-neutral-500">sem dados no período</p>
          )}
        </article>

        <article className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Conversão do perfil</h2>
          {d.estimativas.conversaoDoPerfil === null ? (
            <p className="text-sm text-neutral-500">
              sem visualizações no período
            </p>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums">
                {percentual(d.estimativas.conversaoDoPerfil)}
              </p>
              <p className="text-xs text-neutral-500">
                média do segmento:{" "}
                {percentual(d.estimativas.conversaoDoSegmento)}
                {d.benchmarkUsado && ` (${d.benchmarkUsado})`}
              </p>
            </>
          )}
        </article>
      </section>

      {d.pendencias[0] && (
        <section className="flex flex-col gap-2 rounded-lg border-2 border-neutral-900 p-5 dark:border-white">
          <h2 className="text-xs uppercase tracking-wide text-neutral-500">
            Maior oportunidade agora
          </h2>
          <p className="text-lg font-medium">{d.pendencias[0].title}</p>
          {d.pendencias[0].description && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {d.pendencias[0].description}
            </p>
          )}
          <Link
            href={`/negocio/${id}/checklist`}
            className="self-start text-sm underline"
          >
            Ver o plano de ação completo
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Principais motivos</h2>
        {d.pendencias.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nenhuma pendência aberta — ou a auditoria ainda não rodou.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.pendencias.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      p.priority === "alta"
                        ? "bg-red-500"
                        : p.priority === "media"
                          ? "bg-amber-500"
                          : "bg-neutral-400"
                    }`}
                  />
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-neutral-500">{p.area}</span>
                </span>
                {p.description && (
                  <span className="pl-3.5 text-neutral-500">
                    {p.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

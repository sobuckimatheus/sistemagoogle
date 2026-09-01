import Link from "next/link";

import { CartaoMetrica } from "@/components/cartao-metrica";
import { Icone } from "@/components/lumora/icones";
import {
  ArcoDeNota,
  Cartao,
  corDaNota,
  dinheiro,
  dinheiroExato,
  faixaDaNota,
  FaixaDePosicao,
  LinhaDeFonte,
  MiniBarras,
  numero,
  percentual,
  Rotulo,
  Variacao,
} from "@/components/lumora/primitivos";
import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { montarDashboard } from "@/lib/dashboard/agregacao";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

const intervalo = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

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

  const { estimativas: e } = d;
  // Sem ação nenhuma, receitaPerdida dá zero pela fórmula — e zero aqui
  // significa "não há medição", não "converte acima do segmento". Tratar os
  // dois como o mesmo caso faria a tela elogiar um perfil sem dado.
  const semAcoes = e.acoesTotais === 0;
  // O último dia do intervalo é exclusivo na consulta; exibir o dia anterior
  // evita prometer um dia que ainda não fechou.
  const fimExibido = new Date(d.periodo.fim);
  fimExibido.setUTCDate(fimExibido.getUTCDate() - 1);

  return (
    <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-5 py-6 lg:px-8 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">
            Dashboard
          </h1>
          <p className="text-sm text-texto-suave">
            Como {d.negocio.title} está performando no Google
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-borda bg-superficie py-1.5 pl-3 pr-1.5">
            <Icone nome="calendario" className="size-4 text-texto-fraco" />
            <span className="text-sm text-texto-suave">
              {intervalo.format(d.periodo.inicio)} –{" "}
              {intervalo.format(fimExibido)}
            </span>
            <span className="flex gap-0.5 border-l border-borda pl-1.5">
              {PERIODOS.map((p) => (
                <Link
                  key={p}
                  href={`/negocio/${id}?dias=${p}`}
                  className={`numero rounded px-2 py-1 text-xs transition-colors ${
                    p === dias
                      ? "bg-ouro-fundo text-ouro-claro"
                      : "text-texto-fraco hover:text-texto"
                  }`}
                >
                  {p}d
                </Link>
              ))}
            </span>
          </div>

          <a
            href={`/api/negocio/${id}/relatorio.csv?dias=${dias === 90 ? 90 : 30}`}
            className="flex items-center gap-2 rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-alta hover:text-texto"
          >
            <Icone nome="baixar" className="size-4" />
            Exportar relatório
          </a>
        </div>
      </header>

      {semDados && (
        <p className="rounded-cartao border border-atencao/30 bg-atencao/10 px-4 py-3 text-sm leading-relaxed text-atencao">
          Ainda não há dados de desempenho no período. Eles aparecem depois do
          primeiro sync bem-sucedido — o que exige a aprovação do allowlist das
          Business Profile APIs pelo Google.
        </p>
      )}

      {/* Faixa de métricas: uma leitura contínua do período, não seis blocos.
          As divisórias são vãos de 1px sobre o fundo da borda — com border-b
          nas células, a última linha duplicava a borda do cartão. */}
      <Cartao className="overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-borda md:grid-cols-3 xl:grid-cols-6 [&>*]:bg-superficie">
          <div className="flex items-center justify-between gap-2 px-5 py-4">
            <div className="flex flex-col gap-2">
              <Rotulo dica="Nota da auditoria do perfil, de 0 a 100.">
                Nota geral
              </Rotulo>
              <p className="numero text-[28px] font-semibold leading-none text-texto">
                {d.auditoria.score ?? "—"}
                <span className="text-base font-normal text-texto-fraco">
                  /100
                </span>
              </p>
              <p
                className={`text-xs font-medium ${
                  d.auditoria.score === null
                    ? "text-texto-fraco"
                    : corDaNota(d.auditoria.score).texto
                }`}
              >
                {d.auditoria.score === null
                  ? "auditoria ainda não rodou"
                  : faixaDaNota(d.auditoria.score)}
              </p>
            </div>
            {d.auditoria.score !== null && (
              <ArcoDeNota nota={d.auditoria.score} />
            )}
          </div>

          <CartaoMetrica
            titulo="Visualizações"
            icone="olho"
            valor={d.atual.visualizacoes}
            variacao={d.variacoes.visualizacoes}
            temHistorico={d.temHistorico}
          />
          <CartaoMetrica
            titulo="Ligações"
            icone="telefone"
            valor={d.atual.ligacoes}
            variacao={d.variacoes.ligacoes}
            temHistorico={d.temHistorico}
          />
          <CartaoMetrica
            titulo="Rotas"
            icone="rota"
            valor={d.atual.rotas}
            variacao={d.variacoes.rotas}
            temHistorico={d.temHistorico}
          />
          <CartaoMetrica
            titulo="Cliques no site"
            icone="globo"
            valor={d.atual.cliquesNoSite}
            variacao={d.variacoes.cliquesNoSite}
            temHistorico={d.temHistorico}
          />
          <CartaoMetrica
            titulo="Avaliações"
            icone="estrela"
            valor={
              d.avaliacoes.media
                ? d.avaliacoes.media.toFixed(1).replace(".", ",")
                : "—"
            }
            temHistorico={false}
            rodape={
              <span className="flex items-center gap-2">
                <Estrelas nota={d.avaliacoes.media ?? 0} />
                <span className="numero text-xs text-texto-fraco">
                  {numero.format(d.avaliacoes.total)}
                </span>
              </span>
            }
          />
        </div>
      </Cartao>

      {/* O bloco que o painel existe para entregar. */}
      <Cartao className="grid gap-8 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:p-8">
        <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
          <div className="flex flex-col gap-4">
            <Rotulo dica="Estimativa a partir das suas ações de perfil, do seu ticket e do benchmark do segmento.">
              Receita perdida
            </Rotulo>
            <p className="max-w-[15ch] font-serif text-[34px] leading-[1.15] text-texto">
              {semAcoes ? (
                <>
                  Ainda não há{" "}
                  <span className="whitespace-nowrap text-texto-suave">
                    o que estimar
                  </span>{" "}
                  no período.
                </>
              ) : e.receitaPerdida > 0 ? (
                <>
                  Você está deixando{" "}
                  <span className="whitespace-nowrap text-baixa">
                    dinheiro na mesa
                  </span>{" "}
                  todo mês.
                </>
              ) : (
                <>
                  Seu perfil já converte{" "}
                  <span className="text-alta">acima do segmento</span>.
                </>
              )}
            </p>
            <Link
              href="/como-calculamos"
              className="flex w-fit items-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-alta hover:text-texto"
            >
              <Icone nome="info" className="size-4" />
              Entenda como calculamos isso
            </Link>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-center sm:text-center">
            <p className="text-xs uppercase tracking-[0.12em] text-texto-fraco">
              Estimativa em {dias} dias
            </p>
            <p
              className={`numero text-[44px] font-semibold leading-none ${
                semAcoes
                  ? "text-texto-fraco"
                  : e.receitaPerdida > 0
                    ? "text-baixa"
                    : "text-alta"
              }`}
            >
              {semAcoes ? "—" : dinheiro.format(e.receitaPerdida)}
            </p>
            {semAcoes ? (
              <p className="max-w-[28ch] text-xs leading-relaxed text-texto-fraco">
                Nenhuma ligação, rota ou clique no site foi registrada. A
                estimativa depende delas.
              </p>
            ) : (
              <Variacao
                valor={d.variacoesEstimadas.receitaPerdida}
                temHistorico={d.temHistorico}
                bomQuandoSobe={false}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:border-l lg:border-borda lg:pl-10">
          <Rotulo>Principais motivos</Rotulo>
          {d.pendencias.length === 0 ? (
            <p className="text-sm text-texto-fraco">
              Nenhuma pendência aberta — ou a auditoria ainda não rodou.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {d.pendencias.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      p.priority === "alta"
                        ? "bg-baixa"
                        : p.priority === "media"
                          ? "bg-atencao"
                          : "bg-texto-fraco"
                    }`}
                  />
                  <span className="text-texto-suave">{p.title}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/negocio/${id}/checklist`}
            className="mt-auto flex w-fit items-center gap-1.5 text-sm text-ouro transition-colors hover:text-ouro-claro"
          >
            Ver todos os motivos
            <Icone nome="seta" className="size-4" />
          </Link>
        </div>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao className="flex flex-col gap-4 p-5">
          <Rotulo dica="Ações do perfil × sua taxa de conversão × seu ticket médio.">
            Desempenho financeiro
          </Rotulo>
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-texto-fraco">
                Faturamento atribuído ao Google
              </p>
              <p className="numero text-[26px] font-semibold leading-none text-alta">
                {dinheiro.format(e.receitaAtual)}
              </p>
              <Variacao
                valor={d.variacoesEstimadas.receitaAtual}
                temHistorico={d.temHistorico}
              />
            </div>
            <MiniBarras
              serie={d.serie.map((p) => p.acoes)}
              className="w-24 shrink-0"
            />
          </div>

          <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-borda pt-4">
            <div>
              <dt className="text-xs text-texto-fraco">Clientes estimados</dt>
              <dd className="numero text-lg font-medium text-texto">
                {numero.format(Math.round(e.clientesEstimados))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-texto-fraco">
                Valor médio por cliente
              </dt>
              <dd className="numero text-lg font-medium text-texto">
                {dinheiroExato.format(e.ticketUsado)}
                {e.usouBenchmark.ticket && (
                  <span className="ml-1 text-[11px] font-normal text-texto-fraco">
                    referência
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Cartao>

        <Cartao className="flex flex-col gap-4 p-5">
          <Rotulo dica="Onde as pessoas encontraram seu perfil.">
            Fontes de visualização
          </Rotulo>
          {d.atual.visualizacoes === 0 ? (
            <p className="text-sm text-texto-fraco">
              Sem visualizações no período.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              <LinhaDeFonte
                icone="auditoria"
                rotulo="Google Busca"
                valor={numero.format(d.atual.viewsSearch)}
                fracao={d.atual.viewsSearch / d.atual.visualizacoes}
              />
              <LinhaDeFonte
                icone="rota"
                rotulo="Google Maps"
                valor={numero.format(d.atual.viewsMaps)}
                fracao={d.atual.viewsMaps / d.atual.visualizacoes}
              />
            </ul>
          )}
          <Link
            href={`/negocio/${id}/desempenho`}
            className="mt-auto flex w-fit items-center gap-1.5 text-sm text-ouro transition-colors hover:text-ouro-claro"
          >
            Ver evolução no período
            <Icone nome="seta" className="size-4" />
          </Link>
        </Cartao>

        <Cartao className="flex flex-col gap-4 p-5">
          <Rotulo dica="Quantas visualizações viram ligação, rota ou clique no site.">
            Conversão do perfil
          </Rotulo>
          {e.conversaoDoPerfil === null ? (
            <p className="text-sm text-texto-fraco">
              Sem visualizações no período para calcular conversão.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <p className="numero text-[26px] font-semibold leading-none text-texto">
                  {percentual(e.conversaoDoPerfil)}
                </p>
                <p className="text-xs text-texto-fraco">
                  das visualizações viram contato
                </p>
              </div>
              <FaixaDePosicao
                valor={e.conversaoDoPerfil}
                minimo={e.conversaoDoSegmento}
                maximo={e.conversaoDoTopo}
                rotuloMinimo="Média do segmento"
                rotuloMaximo="Melhores do segmento"
                formatar={(v) => percentual(v)}
              />
              {d.benchmarkUsado && (
                <p className="mt-auto text-[11px] text-texto-fraco">
                  Comparado com {d.benchmarkUsado}
                  {d.fonteBenchmark && ` · ${d.fonteBenchmark}`}
                </p>
              )}
            </>
          )}
        </Cartao>
      </div>

      {d.pendencias[0] && (
        <Cartao className="flex flex-wrap items-center gap-5 border-ouro/25 bg-gradient-to-r from-ouro-fundo/60 to-superficie p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ouro-fundo text-ouro">
            <Icone nome="alvo" className="size-5" />
          </span>
          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-ouro">
              Sua maior oportunidade agora
            </p>
            <p className="text-base font-medium text-texto">
              {d.pendencias[0].title}
            </p>
            {d.pendencias[0].description && (
              <p className="text-sm text-texto-suave">
                {d.pendencias[0].description}
              </p>
            )}
          </div>
          <Link
            href={`/negocio/${id}/checklist`}
            className="flex items-center gap-2 rounded-lg bg-ouro px-4 py-2.5 text-sm font-medium text-fundo transition-colors hover:bg-ouro-claro"
          >
            Ver plano de ação
            <Icone nome="seta" className="size-4" />
          </Link>
        </Cartao>
      )}
    </main>
  );
}

/** Estrelas da média — a fração é mostrada por recorte, não arredondada. */
function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="relative text-xs leading-none" aria-hidden="true">
      <span className="text-borda-forte">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden text-ouro"
        style={{ width: `${(Math.min(nota, 5) / 5) * 100}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

import Link from "next/link";

import { sair } from "@/app/actions/auth";
import { Icone } from "@/components/lumora/icones";
import { Cartao, numero, Rotulo } from "@/components/lumora/primitivos";
import { SeletorDeConta } from "@/components/seletor-de-conta";
import { contasDoUsuario, exigirContaAtiva } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Nível acima do painel: a conta e seus negócios.
 *
 * Sem barra lateral de propósito — a lateral é o contexto de um negócio, e
 * esta tela existe justamente para sair dele e trocar. Era o conteúdo da
 * raiz, que passou a levar direto ao dashboard.
 */
export default async function Negocios() {
  const { user, conta } = await exigirContaAtiva();

  const [contas, assinatura, negocios, palavrasChave] = await Promise.all([
    contasDoUsuario(user.id),
    prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    }),
    prisma.business.findMany({
      where: { accountId: conta.id },
      orderBy: { createdAt: "asc" },
      include: {
        auditSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { reviews: true, checklistItems: true } },
      },
    }),
    // O limite de palavras-chave é da conta inteira, então a contagem também
    // é — contar por negócio mostraria um número menor do que o cobrado.
    prisma.keyword.count({ where: { business: { accountId: conta.id } } }),
  ]);

  return (
    <div className="min-h-dvh bg-fundo">
      <main className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-5 py-8 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Icone nome="faisca" className="size-5 text-ouro" />
            <span className="font-serif text-2xl lowercase leading-none tracking-tight text-ouro">
              lumora
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <SeletorDeConta contas={contas} ativa={conta.id} />
            <Link
              href="/mercado"
              className="rounded-lg border border-borda px-3 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-alta hover:text-texto"
            >
              Verificador de posição
            </Link>
            <Link
              href="/conta"
              className="rounded-lg border border-borda px-3 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-alta hover:text-texto"
            >
              Conta
            </Link>
            <form action={sair}>
              <button
                type="submit"
                className="rounded-lg border border-borda px-3 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-alta hover:text-texto"
              >
                Sair
              </button>
            </form>
          </div>
        </header>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">
            {conta.name}
          </h1>
          <p className="text-sm text-texto-suave">{user.email}</p>
        </div>

        <Cartao className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Rotulo>Plano</Rotulo>
            <p className="text-sm text-texto">
              {assinatura?.plan.name ?? "—"}
              {assinatura && (
                <span className="ml-1.5 text-xs text-texto-fraco">
                  {assinatura.status.toLowerCase()}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Rotulo>Negócios</Rotulo>
            <p className="numero text-sm text-texto">
              {negocios.length} de {assinatura?.plan.maxBusinesses ?? "—"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Rotulo>Palavras-chave</Rotulo>
            <p className="numero text-sm text-texto">
              {palavrasChave} de {assinatura?.plan.maxKeywords ?? "—"}
            </p>
          </div>
        </Cartao>

        {negocios.length > 0 && (
          <section className="flex flex-col gap-3">
            <Rotulo>Seus negócios</Rotulo>
            <ul className="flex flex-col gap-2">
              {negocios.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/negocio/${n.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-cartao border border-borda bg-superficie p-4 transition-colors hover:border-borda-forte hover:bg-superficie-alta"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ouro-fundo text-sm font-semibold text-ouro">
                        {n.title.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-texto">
                          {n.title}
                        </span>
                        <span className="text-xs text-texto-fraco">
                          {[n.primaryCategory, n.city]
                            .filter(Boolean)
                            .join(" · ") || "sem categoria"}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-5 text-xs text-texto-suave">
                      <span className="numero">
                        {n.auditSnapshots[0]
                          ? `${n.auditSnapshots[0].score}/100`
                          : "sem auditoria"}
                      </span>
                      <span className="numero">
                        {numero.format(n._count.reviews)} avaliações
                      </span>
                      <Icone nome="seta" className="size-4 text-texto-fraco" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Cartao className="flex flex-col items-start gap-3 border-dashed p-5">
          <Rotulo>
            {negocios.length === 0
              ? "Próximo passo"
              : "Adicionar mais negócios"}
          </Rotulo>
          <p className="max-w-[62ch] text-sm leading-relaxed text-texto-suave">
            {negocios.length === 0
              ? "Conecte o Google Meu Negócio para começar a acompanhar métricas, avaliações e posição no mapa."
              : "Conecte outra conta Google ou selecione mais locais para rastrear."}
          </p>
          <Link
            href="/conectar"
            className="flex items-center gap-2 rounded-lg bg-ouro px-4 py-2.5 text-sm font-medium text-fundo transition-colors hover:bg-ouro-claro"
          >
            {negocios.length === 0
              ? "Conectar Google Meu Negócio"
              : "Gerenciar conexões"}
            <Icone nome="seta" className="size-4" />
          </Link>
        </Cartao>
      </main>
    </div>
  );
}

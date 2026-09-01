import Link from "next/link";

import { sair } from "@/app/actions/auth";
import { SeletorDeConta } from "@/components/seletor-de-conta";
import { contasDoUsuario, exigirContaAtiva } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

// Lê sessão e banco a cada requisição — não faz sentido pré-renderizar.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Resolve sessão, provisionamento e conta ativa (inclusive a escolhida no
  // seletor) em um lugar só. O middleware já barra acesso sem sessão; aqui
  // ainda há o redirect que cobre a corrida com a expiração do token.
  const { user, conta } = await exigirContaAtiva();

  const [contas, assinatura, listaNegocios, palavrasChave] = await Promise.all([
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

  const negocios = listaNegocios.length;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Painel GBP</h1>
          <p className="text-sm text-neutral-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
        <SeletorDeConta contas={contas} ativa={conta.id} />
        <Link href="/conta" className="text-sm underline text-neutral-600 dark:text-neutral-400">
          Conta
        </Link>
        <Link href="/mercado" className="text-sm underline text-neutral-600 dark:text-neutral-400">
          Verificador de Posição
        </Link>
        <form action={sair}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            Sair
          </button>
        </form>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Conta</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">Nome</dt>
            <dd>{conta.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Plano</dt>
            <dd>
              {assinatura?.plan.name ?? "—"}{" "}
              <span className="text-neutral-500">
                ({assinatura?.status.toLowerCase()})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Negócios conectados</dt>
            <dd>
              {negocios} de {assinatura?.plan.maxBusinesses ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Palavras-chave</dt>
            <dd className="tabular-nums">
              {palavrasChave} de {assinatura?.plan.maxKeywords ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      {negocios > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Seus negócios</h2>
          <ul className="flex flex-col gap-2">
            {listaNegocios.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/negocio/${n.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 text-sm hover:border-neutral-400 dark:border-neutral-800"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{n.title}</span>
                    <span className="text-neutral-500">
                      {[n.primaryCategory, n.city].filter(Boolean).join(" · ") ||
                        "sem categoria"}
                    </span>
                  </span>
                  <span className="flex items-center gap-4 text-neutral-500">
                    <span className="tabular-nums">
                      {n.auditSnapshots[0]
                        ? `${n.auditSnapshots[0].score}/100`
                        : "sem auditoria"}
                    </span>
                    <span className="tabular-nums">
                      {n._count.reviews} avaliações
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-neutral-300 p-5 dark:border-neutral-700">
        <h2 className="text-sm font-medium">
          {negocios === 0 ? "Próximo passo" : "Adicionar mais negócios"}
        </h2>
        <p className="text-sm text-neutral-500">
          {negocios === 0
            ? "Conecte o Google Meu Negócio para começar a acompanhar métricas, avaliações e posição no mapa."
            : "Conecte outra conta Google ou selecione mais locais para rastrear."}
        </p>
        <Link
          href="/conectar"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          {negocios === 0 ? "Conectar Google Meu Negócio" : "Gerenciar conexões"}
        </Link>
      </section>
    </main>
  );
}

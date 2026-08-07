import Link from "next/link";

import { exigirContaAtiva, papelNaConta } from "@/lib/auth/conta";
import { assinaturaDaConta } from "@/lib/billing/assinatura";
import { motivoDoBloqueio } from "@/lib/billing/plano";
import { billingConfigurado } from "@/lib/billing/stripe";
import { prisma } from "@/lib/prisma";

import { BotaoAssinar, BotaoPortal } from "./formularios";

export const dynamic = "force-dynamic";

const dinheiro = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    centavos / 100,
  );

const data = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(d);

const ROTULO_STATUS = {
  TRIALING: "em teste",
  ACTIVE: "ativa",
  PAST_DUE: "pagamento pendente",
  CANCELED: "cancelada",
} as const;

export default async function PlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { user, conta } = await exigirContaAtiva();
  const [papel, assinatura, planos, { checkout }] = await Promise.all([
    papelNaConta(conta.id, user.id),
    assinaturaDaConta(conta.id),
    prisma.plan.findMany({ orderBy: { priceCents: "asc" } }),
    searchParams,
  ]);

  const ehDono = papel === "OWNER";
  const bloqueio = assinatura ? motivoDoBloqueio(assinatura.status) : null;

  const [negocios, palavrasChave] = await Promise.all([
    prisma.business.count({ where: { accountId: conta.id } }),
    prisma.keyword.count({ where: { business: { accountId: conta.id } } }),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href="/conta" className="text-sm text-neutral-500 underline">
          ← Configurações da conta
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Plano</h1>
      </header>

      {checkout === "ok" && (
        <p
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
        >
          Pagamento recebido. A confirmação do Stripe pode levar alguns
          segundos para aparecer aqui — recarregue se o plano ainda estiver
          desatualizado.
        </p>
      )}

      {checkout === "cancelado" && (
        <p role="status" className="text-sm text-neutral-500">
          Checkout cancelado. Nada foi cobrado.
        </p>
      )}

      {bloqueio && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {bloqueio}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Assinatura atual</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">Plano</dt>
            <dd>{assinatura?.plan.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Situação</dt>
            <dd>{assinatura ? ROTULO_STATUS[assinatura.status] : "—"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Negócios</dt>
            <dd className="tabular-nums">
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

        {assinatura?.currentPeriodEnd && (
          <p className="text-xs text-neutral-500">
            {assinatura.cancelAtPeriodEnd
              ? `Cancelamento agendado: o acesso continua até ${data(assinatura.currentPeriodEnd)}.`
              : `Próxima cobrança em ${data(assinatura.currentPeriodEnd)}.`}
          </p>
        )}

        {ehDono && assinatura?.stripeCustomerId && <BotaoPortal />}
      </section>

      {!billingConfigurado() && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
          O Stripe ainda não está configurado neste ambiente
          (<code>STRIPE_SECRET_KEY</code>). Os planos aparecem abaixo, mas o
          checkout só funciona depois de criar os produtos no Stripe e
          preencher <code>Plan.stripePriceId</code>.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Planos</h2>
        <ul className="flex flex-col gap-3">
          {planos.map((p) => {
            const atual = assinatura?.planId === p.id;
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-4 rounded-lg border p-5 ${
                  atual
                    ? "border-neutral-900 dark:border-neutral-100"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    {p.name}
                    {atual && (
                      <span className="ml-2 text-xs text-neutral-500">
                        plano atual
                      </span>
                    )}
                  </span>
                  <span className="text-neutral-500">
                    {p.priceCents === 0 ? "Grátis" : `${dinheiro(p.priceCents)}/mês`} ·{" "}
                    {p.maxBusinesses} negócio(s) · {p.maxKeywords} palavras-chave
                  </span>
                </div>

                {ehDono && !atual && p.priceCents > 0 && (
                  <BotaoAssinar
                    planId={p.id}
                    rotulo={
                      (assinatura?.plan.priceCents ?? 0) < p.priceCents
                        ? "Assinar"
                        : "Mudar para este"
                    }
                    desabilitado={!billingConfigurado()}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {!ehDono && (
          <p className="text-sm text-neutral-500">
            Só o dono da conta pode alterar o plano.
          </p>
        )}
      </section>
    </main>
  );
}

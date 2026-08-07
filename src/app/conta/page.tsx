import Link from "next/link";

import { exigirContaAtiva, papelNaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

import {
  AcoesDoMembro,
  BotaoRevogar,
  FormularioConvite,
  FormularioNome,
  FormularioNotificacoes,
} from "./formularios";

export const dynamic = "force-dynamic";

const formatarData = (data: Date) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(data);

export default async function ContaPage() {
  const { user, conta } = await exigirContaAtiva();
  const papel = await papelNaConta(conta.id, user.id);
  const ehDono = papel === "OWNER";

  const [membros, convites, preferencia, assinatura] = await Promise.all([
    prisma.accountMember.findMany({
      where: { accountId: conta.id },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invite.findMany({
      where: { accountId: conta.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-neutral-500 underline">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Configurações da conta
        </h1>
        <p className="text-sm text-neutral-500">
          {ehDono
            ? "Você administra esta conta."
            : "Você participa como membro — a configuração é somente leitura."}
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Identificação</h2>
        <FormularioNome nome={conta.name} podeEditar={ehDono} />
        <p className="text-xs text-neutral-500">
          Plano {assinatura?.plan.name ?? "—"} ·{" "}
          {assinatura?.status.toLowerCase() ?? "sem assinatura"} ·{" "}
          <Link href="/conta/plano" className="underline">
            ver planos e faturas
          </Link>
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Membros</h2>

        <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
          {membros.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {m.user.name ?? m.user.email}
                  {m.userId === user.id && (
                    <span className="text-neutral-500"> (você)</span>
                  )}
                </span>
                <span className="text-neutral-500">
                  {m.user.email} · {m.role === "OWNER" ? "dono" : "membro"} ·
                  desde {formatarData(m.createdAt)}
                </span>
              </span>

              {ehDono && (
                <AcoesDoMembro
                  memberId={m.id}
                  papel={m.role}
                  ehVoce={m.userId === user.id}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {ehDono && (
        <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Convidar</h2>
            <p className="text-sm text-neutral-500">
              O convidado recebe um link válido por 7 dias e entra na conta ao
              aceitar com uma sessão do Painel.
            </p>
          </div>

          <FormularioConvite />

          {convites.length > 0 && (
            <ul className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
              {convites.map((c) => {
                const expirado = c.expiresAt < new Date();
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{c.email}</span>
                      <span className="text-neutral-500">
                        {c.role === "OWNER" ? "dono" : "membro"} ·{" "}
                        {expirado
                          ? `expirou em ${formatarData(c.expiresAt)}`
                          : `expira em ${formatarData(c.expiresAt)}`}
                      </span>
                    </span>
                    <BotaoRevogar inviteId={c.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Notificações</h2>
          <p className="text-sm text-neutral-500">
            Alertas críticos são os que travam a operação — sync quebrado, por
            exemplo. Os demais ficam só na central de alertas.
          </p>
        </div>
        <FormularioNotificacoes
          receber={preferencia?.emailOnCriticalAlert ?? true}
        />
      </section>
    </main>
  );
}

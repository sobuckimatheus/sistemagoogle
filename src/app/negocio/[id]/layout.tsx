import { CascaDoPainel, itensDoNegocio } from "@/components/lumora/casca";
import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

/**
 * Casca do painel do negócio.
 *
 * Fica no layout para carregar uma vez só ao trocar de aba — e para
 * centralizar a checagem de que o negócio pertence à conta.
 */
export default async function NegocioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const [naoLidos, pendentes, assinatura] = await Promise.all([
    prisma.alert.count({ where: { businessId: id, readAt: null } }),
    prisma.checklistItem.count({ where: { businessId: id, status: "OPEN" } }),
    prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    }),
  ]);

  return (
    <CascaDoPainel
      itens={itensDoNegocio(id, { pendentes, naoLidos })}
      rodape={{
        negocio: negocio.title,
        plano: assinatura ? `Plano ${assinatura.plan.name}` : "Sem assinatura",
        ativo:
          assinatura?.status === "ACTIVE" || assinatura?.status === "TRIALING",
      }}
      sincronizadoEm={
        negocio.lastSyncedAt
          ? negocio.lastSyncedAt.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null
      }
    >
      {children}
    </CascaDoPainel>
  );
}

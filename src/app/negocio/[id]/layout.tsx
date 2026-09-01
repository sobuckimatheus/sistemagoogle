import {
  BarraLateral,
  type ItemDeNavegacao,
} from "@/components/lumora/barra-lateral";
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

  const itens: ItemDeNavegacao[] = [
    { href: `/negocio/${id}`, rotulo: "Dashboard", icone: "painel" },
    { href: `/negocio/${id}/desempenho`, rotulo: "Desempenho", icone: "visao" },
    {
      href: `/negocio/${id}/perfil`,
      rotulo: "Auditoria do perfil",
      icone: "auditoria",
    },
    {
      href: `/negocio/${id}/avaliacoes`,
      rotulo: "Avaliações",
      icone: "estrela",
    },
    {
      href: `/negocio/${id}/postagens`,
      rotulo: "Postagens",
      icone: "postagem",
    },
    {
      href: `/negocio/${id}/concorrentes`,
      rotulo: "Concorrentes",
      icone: "concorrentes",
    },
    {
      href: `/negocio/${id}/palavras-chave`,
      rotulo: "Palavras-chave",
      icone: "receita",
    },
    {
      href: `/negocio/${id}/checklist`,
      rotulo: "Plano de ação",
      icone: "checklist",
      contador: pendentes,
    },
    {
      href: `/negocio/${id}/alertas`,
      rotulo: "Alertas",
      icone: "alerta",
      contador: naoLidos,
    },
    {
      href: `/negocio/${id}/relatorio`,
      rotulo: "Relatório",
      icone: "relatorio",
    },
    { href: "/conta", rotulo: "Configurações", icone: "config" },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-fundo lg:flex-row">
      <BarraLateral
        itens={itens}
        rodape={{
          negocio: negocio.title,
          plano: assinatura
            ? `Plano ${assinatura.plan.name}`
            : "Sem assinatura",
          ativo:
            assinatura?.status === "ACTIVE" ||
            assinatura?.status === "TRIALING",
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
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

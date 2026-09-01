import { redirect } from "next/navigation";

import { PaginaIsca } from "@/components/isca";
import { CascaDoPainel, itensDoNegocio } from "@/components/lumora/casca";
import { PrimeirosPassos } from "@/components/lumora/primeiros-passos";
import { contaAtivaOuNulo } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

// Lê sessão e banco a cada requisição — não faz sentido pré-renderizar.
export const dynamic = "force-dynamic";

/**
 * A raiz serve três destinos.
 *
 * Sem sessão, ela é a isca: a pergunta "em que posição minha empresa
 * aparece?" é o que traz a pessoa, e mandá-la para um formulário de login
 * antes de responder perde a visita. Por isso a raiz saiu da proteção do
 * middleware — e a comparação lá é por igualdade, não por prefixo, para não
 * abrir o resto do app junto.
 *
 * Com sessão e negócio conectado, ela leva direto ao dashboard: quem entra no
 * painel quer ver os números, não uma antessala com o nome da conta. A lista
 * de negócios continua existindo em `/negocios`, para quem tem mais de um.
 *
 * Com sessão e nenhum negócio, ela é a orientação para conectar o Google.
 */
export default async function Home() {
  const sessao = await contaAtivaOuNulo();

  if (!sessao) return <PaginaIsca />;

  const { conta } = sessao;

  const [primeiroNegocio, conexoes, assinatura] = await Promise.all([
    prisma.business.findFirst({
      where: { accountId: conta.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.googleConnection.findMany({
      where: { accountId: conta.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    }),
    prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    }),
  ]);

  if (primeiroNegocio) {
    redirect(`/negocio/${primeiroNegocio.id}`);
  }

  // Autorizar o Google e escolher os locais são etapas separadas — quem já
  // autorizou não deve ser mandado de volta ao começo.
  const conexao = conexoes[0];

  return (
    <CascaDoPainel
      itens={itensDoNegocio(null)}
      rodape={{
        negocio: conta.name,
        plano: assinatura ? `Plano ${assinatura.plan.name}` : "Sem assinatura",
        ativo:
          assinatura?.status === "ACTIVE" || assinatura?.status === "TRIALING",
      }}
    >
      <PrimeirosPassos
        etapa={conexao ? 2 : 1}
        linkDosLocais={
          conexao ? `/conectar/locais?conexao=${conexao.id}` : null
        }
      />
    </CascaDoPainel>
  );
}

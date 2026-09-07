import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";
import { localidadeDoNegocio } from "@/lib/volume/localidade";

import { PainelPalavrasChave, type PalavraView } from "./painel";

export const dynamic = "force-dynamic";

export default async function PalavrasChavePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const [palavras, assinatura, usadas] = await Promise.all([
    prisma.keyword.findMany({
      where: { businessId: id, active: true },
      orderBy: { createdAt: "desc" },
      include: {
        // A última medição de cada termo. Exibimos o que já foi medido em vez
        // de disparar 25 consultas por termo ao abrir a tela: cada verificação
        // custa dinheiro, e posição não muda de hora em hora.
        rankChecks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            avgPosition: true,
            myPosition: true,
            coverage: true,
            totalPoints: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    }),
    prisma.keyword.count({ where: { business: { accountId: conta.id } } }),
  ]);

  const localidade = localidadeDoNegocio(negocio);

  const views: PalavraView[] = palavras.map((p) => {
    const medicao = p.rankChecks[0];
    return {
      id: p.id,
      termo: p.term,
      volume: p.volume,
      volumeAtualizadoEm: p.volumeSyncedAt?.toLocaleDateString("pt-BR") ?? null,
      posicao: medicao
        ? {
            // A média é o número honesto numa grade; `myPosition` cobre a
            // medição de ponto único, que não tem média.
            valor: medicao.avgPosition ?? medicao.myPosition,
            cobertura: medicao.coverage,
            pontos: medicao.totalPoints,
            medidoEm: medicao.createdAt.toLocaleDateString("pt-BR"),
          }
        : null,
    };
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Palavras-chave
        </h1>
        <p className="text-sm text-neutral-500">
          Os termos que você quer acompanhar no Maps. São a base do
          rastreamento de posição.
        </p>
        {localidade ? (
          <p className="text-sm text-neutral-500">
            Volume de buscas em <strong>{localidade.rotulo}</strong> — a cidade
            do seu perfil no Google.
          </p>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-500">
            Não reconhecemos a cidade do seu perfil, e o volume só faz sentido
            por cidade. Confira o endereço no Google Meu Negócio.
          </p>
        )}
      </header>

      <PainelPalavrasChave
        businessId={id}
        palavras={views}
        limite={assinatura?.plan.maxKeywords ?? 0}
        usadas={usadas}
      />
    </main>
  );
}

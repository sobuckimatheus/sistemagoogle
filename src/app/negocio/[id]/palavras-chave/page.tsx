import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

import { PainelPalavrasChave, type PalavraView } from "./painel";

export const dynamic = "force-dynamic";

export default async function PalavrasChavePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  await exigirNegocioDaConta(id, conta.id);

  const [palavras, assinatura, usadas] = await Promise.all([
    prisma.keyword.findMany({
      where: { businessId: id, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    }),
    prisma.keyword.count({ where: { business: { accountId: conta.id } } }),
  ]);

  const views: PalavraView[] = palavras.map((p) => ({
    id: p.id,
    termo: p.term,
    volume: p.volume,
    volumeAtualizadoEm: p.volumeSyncedAt?.toLocaleDateString("pt-BR") ?? null,
  }));

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

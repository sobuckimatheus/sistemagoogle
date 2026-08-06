import Link from "next/link";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

import { CartaoAvaliacao, type AvaliacaoView } from "./cartao";

export const dynamic = "force-dynamic";

const FILTROS = {
  todas: {},
  "sem-resposta": { replyText: null },
  negativas: { starRating: { lte: 3 } },
} as const;

type Filtro = keyof typeof FILTROS;

export default async function AvaliacoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  const negocio = await exigirNegocioDaConta(id, conta.id);

  const { filtro: filtroBruto } = await searchParams;
  const filtro: Filtro =
    filtroBruto && filtroBruto in FILTROS ? (filtroBruto as Filtro) : "todas";

  const [avaliacoes, total, semResposta, respondidasEm48h] = await Promise.all([
    prisma.review.findMany({
      where: { businessId: id, ...FILTROS[filtro] },
      orderBy: { createTime: "desc" },
      take: 50,
    }),
    prisma.review.count({ where: { businessId: id } }),
    prisma.review.count({ where: { businessId: id, replyText: null } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM reviews
      WHERE "businessId" = ${id}
        AND "repliedAt" IS NOT NULL
        AND "createTime" IS NOT NULL
        AND "repliedAt" - "createTime" <= INTERVAL '48 hours'
    `,
  ]);

  const emDia = Number(respondidasEm48h[0]?.count ?? 0);
  const respondidas = total - semResposta;

  const views: AvaliacaoView[] = avaliacoes.map((a) => ({
    id: a.id,
    autor: a.reviewerName,
    estrelas: a.starRating,
    comentario: a.comment,
    resposta: a.replyText,
    respondidaEm: a.repliedAt?.toLocaleDateString("pt-BR") ?? null,
    rascunhoIa: a.aiDraftReply,
    criadaEm: a.createTime?.toLocaleDateString("pt-BR") ?? null,
  }));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <Link
          href={`/negocio/${id}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          ← {negocio.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
      </header>

      <section className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="text-xs text-neutral-500">Total</div>
          <div className="text-xl font-semibold tabular-nums">{total}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="text-xs text-neutral-500">Sem resposta</div>
          <div className="text-xl font-semibold tabular-nums">{semResposta}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="text-xs text-neutral-500">Respondidas em 48h</div>
          <div className="text-xl font-semibold tabular-nums">
            {respondidas > 0
              ? `${Math.round((emDia / respondidas) * 100)}%`
              : "—"}
          </div>
        </div>
      </section>

      <nav className="flex gap-1 text-sm">
        {(
          [
            ["todas", "Todas"],
            ["sem-resposta", "Sem resposta"],
            ["negativas", "Nota ≤ 3"],
          ] as const
        ).map(([valor, rotulo]) => (
          <Link
            key={valor}
            href={`/negocio/${id}/avaliacoes?filtro=${valor}`}
            className={`rounded-md px-3 py-1.5 ${
              filtro === valor
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      {views.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Nenhuma avaliação em cache. Elas chegam pelo sync, que depende da API
          v4 do Google — cujo allowlist é separado das demais APIs e pode
          continuar negando mesmo com as outras liberadas.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {views.map((a) => (
            <CartaoAvaliacao key={a.id} a={a} />
          ))}
        </ul>
      )}
    </main>
  );
}

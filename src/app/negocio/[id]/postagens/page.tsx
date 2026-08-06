import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

import { excluirPost, publicarAgora } from "./acoes";
import { EditorPost } from "./editor";

export const dynamic = "force-dynamic";

const ROTULO_ESTADO = {
  DRAFT: "rascunho",
  SCHEDULED: "agendado",
  PUBLISHED: "publicado",
  FAILED: "falhou",
} as const;

export default async function PostagensPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { conta } = await exigirContaAtiva();
  const { id } = await params;
  await exigirNegocioDaConta(id, conta.id);

  const [posts, publicadosNoMes] = await Promise.all([
    prisma.post.findMany({
      where: { businessId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.post.count({
      where: {
        businessId: id,
        state: "PUBLISHED",
        publishedAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Postagens</h1>
        <p className="text-sm text-neutral-500">
          {publicadosNoMes === 0
            ? "Nenhuma postagem nos últimos 30 dias — frequência de postagem conta para o ranqueamento."
            : `${publicadosNoMes} postagem(ns) nos últimos 30 dias.`}
        </p>
      </header>

      <EditorPost businessId={id} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Histórico ({posts.length})</h2>

        {posts.length === 0 ? (
          <p className="text-sm text-neutral-500">Nada publicado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {posts.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="flex-1 whitespace-pre-wrap">{p.summary}</p>
                  <span
                    className={`whitespace-nowrap text-xs ${
                      p.state === "PUBLISHED"
                        ? "text-green-700 dark:text-green-400"
                        : p.state === "FAILED"
                          ? "text-red-600"
                          : "text-neutral-500"
                    }`}
                  >
                    {ROTULO_ESTADO[p.state]}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                  {p.publishedAt && (
                    <span>
                      publicado em {p.publishedAt.toLocaleString("pt-BR")}
                    </span>
                  )}
                  {p.scheduledFor && p.state === "SCHEDULED" && (
                    <span>
                      agendado para {p.scheduledFor.toLocaleString("pt-BR")}
                    </span>
                  )}
                  {p.errorMessage && (
                    <span className="text-red-600">{p.errorMessage}</span>
                  )}

                  {p.state !== "PUBLISHED" && (
                    <>
                      <form action={publicarAgora}>
                        <input type="hidden" name="postId" value={p.id} />
                        <button className="underline">publicar agora</button>
                      </form>
                      <form action={excluirPost}>
                        <input type="hidden" name="postId" value={p.id} />
                        <button className="underline">excluir</button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

import "server-only";

import { ApiV4IndisponivelError } from "@/lib/google/avaliacoes";
import { accessTokenValido } from "@/lib/google/conexao";
import { publicarPost } from "@/lib/google/posts";
import { prisma } from "@/lib/prisma";
import { rodarAuditoria } from "@/lib/sync/negocio";

/**
 * Publica um post e atualiza o estado.
 *
 * Compartilhado entre a ação da tela e o cron de agendados, para que os dois
 * caminhos tratem erro do mesmo jeito — um post que falha precisa ficar
 * FAILED com a mensagem, e não sumir.
 */
export async function publicarPostSalvo(postId: string): Promise<
  { ok: true } | { erro: string }
> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { business: true },
  });

  if (!post) return { erro: "Post não encontrado." };
  if (post.state === "PUBLISHED") return { ok: true };
  if (!post.business.gbpAccountName) {
    return { erro: "Negócio sem conta GBP associada." };
  }

  try {
    const token = await accessTokenValido(post.business.googleConnectionId);

    const gbpPostId = await publicarPost(
      token,
      post.business.gbpAccountName,
      post.business.locationName,
      {
        resumo: post.summary,
        tipo: post.postType,
        urlDaMidia: post.mediaUrl,
      },
    );

    await prisma.post.update({
      where: { id: postId },
      data: {
        state: "PUBLISHED",
        gbpPostId,
        publishedAt: new Date(),
        errorMessage: null,
      },
    });

    // Frequência de postagem entra na auditoria; recalcular aqui faz a nota
    // subir no mesmo instante em que o usuário publica.
    await rodarAuditoria(post.businessId).catch(() => {});

    return { ok: true };
  } catch (erro) {
    const mensagem =
      erro instanceof ApiV4IndisponivelError
        ? "A API v4 do Google, que publica postagens, ainda não está liberada para este projeto."
        : (erro as Error).message;

    await prisma.post.update({
      where: { id: postId },
      data: { state: "FAILED", errorMessage: mensagem },
    });

    return { erro: mensagem };
  }
}

"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import {
  ApiV4IndisponivelError,
  publicarResposta as publicarNoGoogle,
} from "@/lib/google/avaliacoes";
import { accessTokenValido } from "@/lib/google/conexao";
import { IaIndisponivelError, rascunhoDeResposta } from "@/lib/ia";
import { prisma } from "@/lib/prisma";
import { consumirCota, LIMITES } from "@/lib/rate-limit";

export type ResultadoAcao = { ok: true; texto?: string } | { erro: string };

/** Carrega a avaliação garantindo que ela pertence à conta do usuário. */
async function avaliacaoDaConta(reviewId: string) {
  const { conta } = await exigirContaAtiva();
  const avaliacao = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { business: true },
  });

  if (!avaliacao) return null;
  await exigirNegocioDaConta(avaliacao.businessId, conta.id);
  return avaliacao;
}

export async function gerarRascunho(
  _anterior: ResultadoAcao | null,
  formData: FormData,
): Promise<ResultadoAcao> {
  const reviewId = String(formData.get("reviewId") ?? "");
  const avaliacao = await avaliacaoDaConta(reviewId);
  if (!avaliacao) return { erro: "Avaliação não encontrada." };

  const bloqueio = await bloqueioDeEscrita(avaliacao.business.accountId);
  if (bloqueio) return { erro: bloqueio };

  const cota = await consumirCota(LIMITES.ia, avaliacao.business.accountId);
  if (!cota.permitido) return { erro: cota.mensagem };

  try {
    const texto = await rascunhoDeResposta({
      nomeDoNegocio: avaliacao.business.title,
      categoria: avaliacao.business.primaryCategory,
      autor: avaliacao.reviewerName,
      estrelas: avaliacao.starRating,
      comentario: avaliacao.comment,
      tomDeVoz: avaliacao.business.tomDeVoz,
    });

    // Guarda o rascunho para não perder a geração se a aba fechar — e para
    // não pagar duas vezes pela mesma resposta.
    await prisma.review.update({
      where: { id: reviewId },
      data: { aiDraftReply: texto },
    });

    revalidatePath(`/negocio/${avaliacao.businessId}/avaliacoes`);
    return { ok: true, texto };
  } catch (erro) {
    if (erro instanceof IaIndisponivelError) {
      return {
        erro: "IA não configurada. Defina ANTHROPIC_API_KEY nas variáveis de ambiente.",
      };
    }
    return { erro: (erro as Error).message };
  }
}

export async function publicarResposta(
  _anterior: ResultadoAcao | null,
  formData: FormData,
): Promise<ResultadoAcao> {
  const reviewId = String(formData.get("reviewId") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();

  if (!texto) return { erro: "Escreva uma resposta antes de publicar." };

  const avaliacao = await avaliacaoDaConta(reviewId);
  if (!avaliacao) return { erro: "Avaliação não encontrada." };
  if (!avaliacao.business.gbpAccountName) {
    return { erro: "Negócio sem conta GBP associada." };
  }

  const bloqueio = await bloqueioDeEscrita(avaliacao.business.accountId);
  if (bloqueio) return { erro: bloqueio };

  try {
    const token = await accessTokenValido(avaliacao.business.googleConnectionId);

    await publicarNoGoogle(
      token,
      avaliacao.business.gbpAccountName,
      avaliacao.business.locationName,
      avaliacao.gbpReviewId,
      texto,
    );

    await prisma.review.update({
      where: { id: reviewId },
      data: { replyText: texto, repliedAt: new Date() },
    });

    revalidatePath(`/negocio/${avaliacao.businessId}/avaliacoes`);
    return { ok: true };
  } catch (erro) {
    if (erro instanceof ApiV4IndisponivelError) {
      return {
        erro:
          "A API v4 do Google, que publica respostas, ainda não está liberada " +
          "para este projeto. O allowlist dela é separado das demais.",
      };
    }
    return { erro: (erro as Error).message };
  }
}

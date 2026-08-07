"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import { IaIndisponivelError, textoDePostagem } from "@/lib/ia";
import { prisma } from "@/lib/prisma";
import { consumirCota, LIMITES } from "@/lib/rate-limit";
import { publicarPostSalvo } from "@/lib/sync/publicar";

export type EstadoPost =
  | { ok: string }
  | { erro: string }
  | { texto: string }
  | null;

export async function gerarTexto(
  _anterior: EstadoPost,
  formData: FormData,
): Promise<EstadoPost> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  const negocio = await exigirNegocioDaConta(businessId, conta.id);

  const assunto = String(formData.get("assunto") ?? "").trim();
  if (!assunto) return { erro: "Diga sobre o que é o post." };

  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  const cota = await consumirCota(LIMITES.ia, conta.id);
  if (!cota.permitido) return { erro: cota.mensagem };

  try {
    const texto = await textoDePostagem(
      negocio.title,
      negocio.primaryCategory,
      assunto,
      negocio.tomDeVoz,
    );
    return { texto };
  } catch (erro) {
    if (erro instanceof IaIndisponivelError) {
      return { erro: "IA não configurada. Defina ANTHROPIC_API_KEY." };
    }
    return { erro: (erro as Error).message };
  }
}

export async function salvarPost(
  _anterior: EstadoPost,
  formData: FormData,
): Promise<EstadoPost> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  await exigirNegocioDaConta(businessId, conta.id);

  const summary = String(formData.get("summary") ?? "").trim();
  const acao = String(formData.get("acao") ?? "rascunho");
  const agendadoPara = String(formData.get("scheduledFor") ?? "").trim();

  if (!summary) return { erro: "Escreva o texto do post." };
  if (summary.length > 1500) {
    return { erro: "O Google aceita no máximo 1500 caracteres." };
  }

  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  if (acao === "agendar") {
    if (!agendadoPara) return { erro: "Escolha data e hora do agendamento." };
    const quando = new Date(agendadoPara);
    if (Number.isNaN(quando.getTime())) {
      return { erro: "Data de agendamento inválida." };
    }
    if (quando.getTime() < Date.now()) {
      return { erro: "A data de agendamento já passou." };
    }

    await prisma.post.create({
      data: {
        businessId,
        summary,
        postType: "STANDARD",
        state: "SCHEDULED",
        scheduledFor: quando,
      },
    });

    revalidatePath(`/negocio/${businessId}/postagens`);
    return { ok: "Post agendado." };
  }

  const post = await prisma.post.create({
    data: { businessId, summary, postType: "STANDARD", state: "DRAFT" },
  });

  if (acao === "publicar") {
    const resultado = await publicarPostSalvo(post.id);
    revalidatePath(`/negocio/${businessId}/postagens`);
    return "erro" in resultado
      ? { erro: resultado.erro }
      : { ok: "Post publicado no Google." };
  }

  revalidatePath(`/negocio/${businessId}/postagens`);
  return { ok: "Rascunho salvo." };
}

export async function publicarAgora(formData: FormData) {
  const { conta } = await exigirContaAtiva();
  const postId = String(formData.get("postId") ?? "");

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { businessId: true },
  });
  if (!post) return;

  await exigirNegocioDaConta(post.businessId, conta.id);

  // Publicar escreve no perfil público do cliente: fica bloqueado enquanto a
  // cobrança não estiver em dia.
  if (await bloqueioDeEscrita(conta.id)) return;

  await publicarPostSalvo(postId);

  revalidatePath(`/negocio/${post.businessId}/postagens`);
}

export async function excluirPost(formData: FormData) {
  const { conta } = await exigirContaAtiva();
  const postId = String(formData.get("postId") ?? "");

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { businessId: true, state: true },
  });
  if (!post) return;

  await exigirNegocioDaConta(post.businessId, conta.id);

  // Post já publicado existe no Google; apagar só a nossa linha daria a
  // impressão falsa de que ele saiu do ar.
  if (post.state === "PUBLISHED") return;

  await prisma.post.delete({ where: { id: postId } });
  revalidatePath(`/negocio/${post.businessId}/postagens`);
}

"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import { accessTokenValido } from "@/lib/google/conexao";
import { listarFotos, type FotoGbp } from "@/lib/google/midia";
import { IaIndisponivelError, sugerirPostagem, textoDePostagem } from "@/lib/ia";
import { prisma } from "@/lib/prisma";
import { consumirCota, LIMITES } from "@/lib/rate-limit";
import { publicarPostSalvo } from "@/lib/sync/publicar";

export type EstadoPost =
  | { ok: string }
  | { erro: string }
  | { texto: string }
  | null;

export type FotoEscolhivel = {
  url: string;
  miniatura: string;
  largura: number | null;
  altura: number | null;
  categoria: string | null;
};

export type EstadoSugestao =
  | { erro: string }
  | {
      assunto: string;
      texto: string;
      fotos: FotoEscolhivel[];
      /** Por que não há fotos, quando não há — a tela explica em vez de calar. */
      motivoSemFotos: "nenhuma" | "v4-indisponivel" | null;
    }
  | null;

/**
 * Busca as fotos do perfil no Google, degradando em silêncio.
 *
 * A v4 tem allowlist próprio (ver `ApiV4IndisponivelError`), então um projeto
 * sem ela liberada simplesmente não vê a opção. Distinguimos "não tem foto" de
 * "não temos acesso" porque as duas pedem ações diferentes do usuário: subir
 * uma foto no Google, ou usar o campo de URL.
 */
async function fotosDoPerfil(negocio: {
  id: string;
  googleConnectionId: string;
  gbpAccountName: string | null;
  locationName: string;
}): Promise<{ fotos: FotoGbp[]; indisponivel: boolean }> {
  if (!negocio.gbpAccountName) return { fotos: [], indisponivel: true };

  try {
    const token = await accessTokenValido(negocio.googleConnectionId);
    const fotos = await listarFotos(
      token,
      negocio.gbpAccountName,
      negocio.locationName,
    );
    return { fotos, indisponivel: false };
  } catch {
    // Falha aqui não pode derrubar a sugestão de texto, que é o principal.
    return { fotos: [], indisponivel: true };
  }
}

/**
 * Propõe um post inteiro: assunto, texto e as fotos do próprio perfil.
 *
 * É o "Gerar postagem" de um clique. Tudo o que sai daqui é sugestão — o
 * usuário edita texto e troca imagem antes de qualquer coisa ir ao ar, e a
 * ação sequer grava no banco.
 */
export async function gerarSugestao(
  _anterior: EstadoSugestao,
  formData: FormData,
): Promise<EstadoSugestao> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  const negocio = await exigirNegocioDaConta(businessId, conta.id);

  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  const cota = await consumirCota(LIMITES.ia, conta.id);
  if (!cota.permitido) return { erro: cota.mensagem };

  // Os termos de maior volume ancoram o assunto no que o cliente busca de
  // fato; os posts recentes evitam a sugestão repetir o assunto da semana.
  const [termos, recentes] = await Promise.all([
    prisma.keyword.findMany({
      where: { businessId, active: true },
      select: { term: true },
      orderBy: { volume: "desc" },
      take: 8,
    }),
    prisma.post.findMany({
      where: { businessId },
      select: { summary: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  try {
    const [sugestao, midia] = await Promise.all([
      sugerirPostagem(
        negocio.title,
        negocio.primaryCategory,
        negocio.city,
        termos.map((t) => t.term),
        negocio.tomDeVoz,
        recentes.map((p) => p.summary.slice(0, 80)),
      ),
      fotosDoPerfil(negocio),
    ]);

    return {
      assunto: sugestao.assunto,
      texto: sugestao.texto,
      fotos: midia.fotos.map((f) => ({
        url: f.url,
        miniatura: f.miniatura,
        largura: f.largura,
        altura: f.altura,
        categoria: f.categoria,
      })),
      motivoSemFotos:
        midia.fotos.length > 0
          ? null
          : midia.indisponivel
            ? "v4-indisponivel"
            : "nenhuma",
    };
  } catch (erro) {
    if (erro instanceof IaIndisponivelError) {
      return { erro: "IA não configurada. Defina ANTHROPIC_API_KEY." };
    }
    return { erro: (erro as Error).message };
  }
}

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
  const mediaUrl = String(formData.get("mediaUrl") ?? "").trim() || null;

  if (!summary) return { erro: "Escreva o texto do post." };
  if (summary.length > 1500) {
    return { erro: "O Google aceita no máximo 1500 caracteres." };
  }

  // O Google baixa a imagem desta URL (`sourceUrl` em posts.ts). Endereço que
  // não seja http(s) público faz a publicação falhar lá, longe daqui, com
  // mensagem obscura — recusar cedo é mais barato de entender.
  if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) {
    return { erro: "A imagem precisa ter um endereço https público." };
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
        mediaUrl,
        postType: "STANDARD",
        state: "SCHEDULED",
        scheduledFor: quando,
      },
    });

    revalidatePath(`/negocio/${businessId}/postagens`);
    return { ok: "Post agendado." };
  }

  const post = await prisma.post.create({
    data: { businessId, summary, mediaUrl, postType: "STANDARD", state: "DRAFT" },
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

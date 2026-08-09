"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import { IaIndisponivelError, sugerirPalavrasChave } from "@/lib/ia";
import { prisma } from "@/lib/prisma";
import { consumirCota, LIMITES } from "@/lib/rate-limit";
import { atualizarVolumes } from "@/lib/sync/volume";

export type EstadoKeywords =
  | { ok: string }
  | { erro: string }
  | { sugestoes: string[] }
  | null;

export async function adicionarPalavra(
  _anterior: EstadoKeywords,
  formData: FormData,
): Promise<EstadoKeywords> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  await exigirNegocioDaConta(businessId, conta.id);

  const termos = formData
    .getAll("termo")
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);

  if (termos.length === 0) return { erro: "Digite ao menos um termo." };

  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  const assinatura = await prisma.subscription.findUnique({
    where: { accountId: conta.id },
    include: { plan: true },
  });
  if (!assinatura) return { erro: "Assinatura não encontrada." };

  // O limite é da conta inteira, não do negócio: é assim que o plano é
  // vendido, e contar por negócio deixaria o limite furado em conta de
  // agência.
  const jaExistentes = await prisma.keyword.count({
    where: { business: { accountId: conta.id } },
  });

  if (jaExistentes + termos.length > assinatura.plan.maxKeywords) {
    return {
      erro:
        `Seu plano ${assinatura.plan.name} permite ${assinatura.plan.maxKeywords} ` +
        `palavras-chave e você já tem ${jaExistentes}.`,
    };
  }

  await prisma.keyword.createMany({
    data: termos.map((term) => ({ businessId, term })),
    // Termo repetido no mesmo negócio viola o índice único; ignorar é o
    // comportamento esperado ao colar uma lista com duplicatas.
    skipDuplicates: true,
  });

  // Busca o volume dos termos recém-criados. Falha aqui não desfaz nada: o
  // termo vale por si, o volume é enriquecimento.
  const criados = await prisma.keyword.findMany({
    where: { businessId, term: { in: termos }, volumeSyncedAt: null },
    select: { id: true },
  });
  await atualizarVolumes(criados.map((k) => k.id));

  revalidatePath(`/negocio/${businessId}/palavras-chave`);
  return { ok: `${termos.length} termo(s) adicionado(s).` };
}

export async function removerPalavra(formData: FormData) {
  const { conta } = await exigirContaAtiva();
  const keywordId = String(formData.get("keywordId") ?? "");

  const palavra = await prisma.keyword.findUnique({
    where: { id: keywordId },
    select: { businessId: true },
  });
  if (!palavra) return;

  await exigirNegocioDaConta(palavra.businessId, conta.id);
  await prisma.keyword.delete({ where: { id: keywordId } });

  revalidatePath(`/negocio/${palavra.businessId}/palavras-chave`);
}

export async function sugerirComIa(
  _anterior: EstadoKeywords,
  formData: FormData,
): Promise<EstadoKeywords> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  const negocio = await exigirNegocioDaConta(businessId, conta.id);

  if (!negocio.primaryCategory || !negocio.city) {
    return {
      erro:
        "Para sugerir termos preciso da categoria e da cidade do negócio. " +
        "Elas chegam no sync do perfil.",
    };
  }

  // Geração de IA custa por chamada: entra na mesma guarda das criações.
  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  const cota = await consumirCota(LIMITES.ia, conta.id);
  if (!cota.permitido) return { erro: cota.mensagem };

  try {
    const sugestoes = await sugerirPalavrasChave(
      negocio.primaryCategory,
      negocio.city,
    );
    return { sugestoes };
  } catch (erro) {
    if (erro instanceof IaIndisponivelError) {
      return {
        erro: "IA não configurada. Defina ANTHROPIC_API_KEY para usar sugestões.",
      };
    }
    return { erro: (erro as Error).message };
  }
}

/**
 * Atualiza o volume de busca de todos os termos do negócio, sob demanda.
 *
 * Existe porque o job mensal é lento demais para quem acabou de configurar a
 * conta de Ads e quer ver o número aparecer.
 */
export async function revalidarVolumes(
  _anterior: EstadoKeywords,
  formData: FormData,
): Promise<EstadoKeywords> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  await exigirNegocioDaConta(businessId, conta.id);

  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  const cota = await consumirCota(LIMITES.volume, conta.id);
  if (!cota.permitido) return { erro: cota.mensagem };

  const palavras = await prisma.keyword.findMany({
    where: { businessId, active: true },
    select: { id: true },
  });

  if (palavras.length === 0) return { erro: "Nenhum termo para atualizar." };

  const resultado = await atualizarVolumes(palavras.map((p) => p.id));

  revalidatePath(`/negocio/${businessId}/palavras-chave`);

  if (resultado.erro) return { erro: resultado.erro };

  return {
    ok:
      `${resultado.atualizados} termo(s) com volume via ${resultado.fonte}` +
      (resultado.semDado > 0
        ? `; ${resultado.semDado} sem dado na fonte.`
        : "."),
  };
}

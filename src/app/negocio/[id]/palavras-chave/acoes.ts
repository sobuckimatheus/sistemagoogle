"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { IaIndisponivelError, sugerirPalavrasChave } from "@/lib/ia";
import { prisma } from "@/lib/prisma";

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

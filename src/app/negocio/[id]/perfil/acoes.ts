"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import { accessTokenValido } from "@/lib/google/conexao";
import { AllowlistPendenteError } from "@/lib/google/locais";
import { atualizarPerfil, EdicaoRecusadaError } from "@/lib/google/perfil";
import { prisma } from "@/lib/prisma";
import { rodarAuditoria } from "@/lib/sync/negocio";

export type EstadoPerfil = { ok: string } | { erro: string } | null;

export async function salvarPerfil(
  _anterior: EstadoPerfil,
  formData: FormData,
): Promise<EstadoPerfil> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  const negocio = await exigirNegocioDaConta(businessId, conta.id);

  const title = String(formData.get("title") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const website = String(formData.get("website") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!title) return { erro: "O nome do negócio não pode ficar vazio." };
  if (description && description.length > 750) {
    return { erro: "A descrição do Google aceita no máximo 750 caracteres." };
  }

  // Escreve no perfil público via API do Google — recurso pago.
  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  try {
    const token = await accessTokenValido(negocio.googleConnectionId);

    await atualizarPerfil(token, negocio.locationName, {
      title,
      phone,
      website,
      description,
    });

    // O cache local só é atualizado depois que o Google aceita — assim a tela
    // nunca mostra um valor que não está no perfil real.
    await prisma.business.update({
      where: { id: businessId },
      data: { title, phone, website, description, lastSyncedAt: new Date() },
    });

    // A nota depende destes campos; recalcular agora evita o usuário achar
    // que a correção não teve efeito.
    await rodarAuditoria(businessId);

    revalidatePath(`/negocio/${businessId}/perfil`);
    revalidatePath(`/negocio/${businessId}`);

    return { ok: "Perfil atualizado no Google." };
  } catch (erro) {
    if (erro instanceof EdicaoRecusadaError) {
      return { erro: `O Google recusou a alteração: ${erro.detalhe}` };
    }
    if (erro instanceof AllowlistPendenteError) {
      return {
        erro:
          "A Business Information API ainda não está liberada para este projeto.",
      };
    }
    return { erro: (erro as Error).message };
  }
}

export async function salvarParametros(
  _anterior: EstadoPerfil,
  formData: FormData,
): Promise<EstadoPerfil> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  await exigirNegocioDaConta(businessId, conta.id);

  const ticketBruto = String(formData.get("ticketMedio") ?? "").replace(",", ".");
  const taxaBruta = String(formData.get("taxaConversao") ?? "").replace(",", ".");
  const tomDeVoz = String(formData.get("tomDeVoz") ?? "").trim() || null;

  // O tom entra no system prompt; texto longo demais dilui as regras que
  // realmente importam ali e ainda encarece cada geração.
  if (tomDeVoz && tomDeVoz.length > 500) {
    return { erro: "Descreva o tom de voz em até 500 caracteres." };
  }

  const ticketMedio = ticketBruto ? Number(ticketBruto) : null;
  const taxaPercentual = taxaBruta ? Number(taxaBruta) : null;

  if (ticketMedio !== null && (!Number.isFinite(ticketMedio) || ticketMedio < 0)) {
    return { erro: "Ticket médio inválido." };
  }
  if (
    taxaPercentual !== null &&
    (!Number.isFinite(taxaPercentual) || taxaPercentual < 0 || taxaPercentual > 100)
  ) {
    return { erro: "A taxa de conversão deve estar entre 0 e 100." };
  }

  await prisma.business.update({
    where: { id: businessId },
    data: {
      ticketMedio,
      // O usuário digita percentual; o banco guarda fração de 0 a 1.
      taxaConversaoManual: taxaPercentual === null ? null : taxaPercentual / 100,
      tomDeVoz,
    },
  });

  revalidatePath(`/negocio/${businessId}`);
  revalidatePath(`/negocio/${businessId}/perfil`);

  return { ok: "Parâmetros salvos. As estimativas do dashboard já usam eles." };
}

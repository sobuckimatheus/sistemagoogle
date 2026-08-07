"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import {
  buscarConcorrentes,
  PlacesIndisponivelError,
  type Concorrente,
} from "@/lib/google/places";
import { prisma } from "@/lib/prisma";
import { consumirCota, LIMITES } from "@/lib/rate-limit";

export type EstadoBusca =
  | { resultados: Concorrente[] }
  | { erro: string }
  | null;

export async function procurar(
  _anterior: EstadoBusca,
  formData: FormData,
): Promise<EstadoBusca> {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  const negocio = await exigirNegocioDaConta(businessId, conta.id);

  // Cada busca consome cota paga da Places API.
  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

  const cota = await consumirCota(LIMITES.places, conta.id);
  if (!cota.permitido) return { erro: cota.mensagem };

  const consulta =
    String(formData.get("consulta") ?? "").trim() ||
    [negocio.primaryCategory, negocio.city].filter(Boolean).join(" ");

  if (!consulta) {
    return {
      erro:
        "Informe o que buscar. O padrão usa categoria e cidade do negócio, " +
        "que ainda não estão preenchidas.",
    };
  }

  try {
    const centro =
      negocio.lat !== null && negocio.lng !== null
        ? { lat: negocio.lat, lng: negocio.lng }
        : undefined;

    const resultados = await buscarConcorrentes(consulta, centro);

    // O próprio negócio aparece na busca — filtrar evita comparar com ele
    // mesmo.
    return {
      resultados: resultados.filter((r) => r.placeId !== negocio.placeId),
    };
  } catch (erro) {
    if (erro instanceof PlacesIndisponivelError) {
      return { erro: erro.detalhe };
    }
    return { erro: (erro as Error).message };
  }
}

/** Passa a acompanhar um concorrente e grava o primeiro snapshot. */
export async function rastrear(formData: FormData) {
  const { conta } = await exigirContaAtiva();
  const businessId = String(formData.get("businessId") ?? "");
  await exigirNegocioDaConta(businessId, conta.id);

  const dados = JSON.parse(String(formData.get("dados") ?? "{}")) as Concorrente;
  if (!dados.placeId) return;
  if (await bloqueioDeEscrita(conta.id)) return;

  const existente = await prisma.competitor.findFirst({
    where: { businessId, placeId: dados.placeId },
  });
  if (existente) return;

  const concorrente = await prisma.competitor.create({
    data: {
      businessId,
      placeId: dados.placeId,
      name: dados.nome,
      category: dados.categoria,
      address: dados.endereco,
    },
  });

  // Snapshot imediato: sem ele o gráfico de evolução só começaria na semana
  // seguinte, quando o cron rodasse.
  await prisma.competitorSnapshot.create({
    data: {
      competitorId: concorrente.id,
      rating: dados.nota,
      reviewCount: dados.totalAvaliacoes,
      hasWebsite: Boolean(dados.site),
      hasHours: dados.temHorarios,
    },
  });

  revalidatePath(`/negocio/${businessId}/concorrentes`);
}

export async function deixarDeRastrear(formData: FormData) {
  const { conta } = await exigirContaAtiva();
  const competitorId = String(formData.get("competitorId") ?? "");

  const concorrente = await prisma.competitor.findUnique({
    where: { id: competitorId },
    select: { businessId: true },
  });
  if (!concorrente) return;

  await exigirNegocioDaConta(concorrente.businessId, conta.id);
  await prisma.competitor.delete({ where: { id: competitorId } });

  revalidatePath(`/negocio/${concorrente.businessId}/concorrentes`);
}

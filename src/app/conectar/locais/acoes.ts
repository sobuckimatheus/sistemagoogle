"use server";

import { redirect } from "next/navigation";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

export type ResultadoSalvar = { erro: string } | never;

/**
 * Cria um Business por local selecionado, respeitando o limite do plano.
 *
 * Não faz o sync inicial aqui: a chamada às APIs do Google leva tempo e não
 * cabe no ciclo de uma Server Action. Isso fica para a E2-08.
 */
export async function salvarLocais(
  _estadoAnterior: ResultadoSalvar | null,
  formData: FormData,
): Promise<ResultadoSalvar | null> {
  const { conta } = await exigirContaAtiva();

  const conexaoId = String(formData.get("conexaoId") ?? "");
  const selecionados = formData.getAll("local").map(String);

  if (!conexaoId) return { erro: "Conexão não informada." };
  if (selecionados.length === 0) {
    return { erro: "Selecione ao menos um local." };
  }

  // A conexão precisa ser desta conta — caso contrário um id vazado permitiria
  // criar negócios sob a conexão de outro tenant.
  const conexao = await prisma.googleConnection.findFirst({
    where: { id: conexaoId, accountId: conta.id, status: "ACTIVE" },
  });
  if (!conexao) return { erro: "Conexão inválida ou inativa." };

  const assinatura = await prisma.subscription.findUnique({
    where: { accountId: conta.id },
    include: { plan: true },
  });
  if (!assinatura) return { erro: "Assinatura não encontrada." };

  const jaRastreados = await prisma.business.count({
    where: { accountId: conta.id },
  });

  if (jaRastreados + selecionados.length > assinatura.plan.maxBusinesses) {
    return {
      erro:
        `Seu plano ${assinatura.plan.name} permite ${assinatura.plan.maxBusinesses} ` +
        `negócio(s) e você já tem ${jaRastreados}. Selecione menos locais ou mude de plano.`,
    };
  }

  for (const bruto of selecionados) {
    const local = JSON.parse(bruto) as {
      name: string;
      title: string;
      placeId?: string;
      contaGbp: string;
      categoria?: string;
      telefone?: string;
      site?: string;
      cidade?: string;
      estado?: string;
    };

    // locationName é único no schema: se o local já é rastreado por qualquer
    // conta, o upsert evita violar a constraint.
    await prisma.business.upsert({
      where: { locationName: local.name },
      update: {},
      create: {
        accountId: conta.id,
        googleConnectionId: conexao.id,
        gbpAccountName: local.contaGbp,
        locationName: local.name,
        placeId: local.placeId ?? null,
        title: local.title,
        primaryCategory: local.categoria ?? null,
        phone: local.telefone ?? null,
        website: local.site ?? null,
        city: local.cidade ?? null,
        state: local.estado ?? null,
      },
    });
  }

  redirect("/");
}

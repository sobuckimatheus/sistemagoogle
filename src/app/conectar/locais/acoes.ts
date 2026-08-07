"use server";

import { redirect } from "next/navigation";

import { exigirContaAtiva } from "@/lib/auth/conta";
import { bloqueioDeEscrita } from "@/lib/billing/assinatura";
import { prisma } from "@/lib/prisma";
import { sincronizarNegocio } from "@/lib/sync/negocio";

export type ResultadoSalvar = { erro: string } | never;

/**
 * Cria um Business por local selecionado, respeitando o limite do plano, e
 * dispara o sync inicial de cada um.
 *
 * O sync roda depois da gravação, e não junto: o negócio precisa existir mesmo
 * que as APIs do Google estejam bloqueadas por allowlist.
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

  const bloqueio = await bloqueioDeEscrita(conta.id);
  if (bloqueio) return { erro: bloqueio };

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

  const criados: string[] = [];

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
    const negocio = await prisma.business.upsert({
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

    criados.push(negocio.id);
  }

  // Sync inicial: puxa o histórico disponível para o dashboard não abrir
  // vazio. Cada negócio é isolado — allowlist pendente faz o sync falhar, e
  // isso não pode impedir o cadastro do negócio, que já está gravado.
  for (const businessId of criados) {
    try {
      await sincronizarNegocio(businessId, { diasDeHistorico: 30 });
    } catch {
      // O job diário tenta de novo; o alerta SYNC_FAILED já é criado quando
      // o problema é de conexão.
    }
  }

  redirect("/");
}

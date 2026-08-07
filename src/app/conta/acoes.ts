"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirOwner } from "@/lib/auth/conta";
import { enviarEmail } from "@/lib/email";
import { clientEnv } from "@/lib/env/client";
import { prisma } from "@/lib/prisma";

export type EstadoConta = { ok: string } | { erro: string } | null;

/** Prazo de validade do convite. */
const DIAS_DE_VALIDADE = 7;

export async function renomearConta(
  _anterior: EstadoConta,
  formData: FormData,
): Promise<EstadoConta> {
  const { user, conta } = await exigirContaAtiva();

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { erro: "O nome da conta não pode ficar vazio." };
  if (nome.length > 120) return { erro: "Nome muito longo (máx. 120)." };

  try {
    await exigirOwner(conta.id, user.id);
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  await prisma.account.update({ where: { id: conta.id }, data: { name: nome } });

  revalidatePath("/conta");
  revalidatePath("/");
  return { ok: "Nome da conta atualizado." };
}

/**
 * Convida alguém por e-mail.
 *
 * O token é o segredo do link — 32 bytes aleatórios, comparado por índice
 * único no banco. Se o envio do e-mail falhar, o convite continua válido e a
 * tela mostra o link para copiar: perder o convite porque o provedor de
 * e-mail está fora seria pior do que exibir o link.
 */
export async function convidarMembro(
  _anterior: EstadoConta,
  formData: FormData,
): Promise<EstadoConta> {
  const { user, conta } = await exigirContaAtiva();

  try {
    await exigirOwner(conta.id, user.id);
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = formData.get("role") === "OWNER" ? "OWNER" : "MEMBER";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "E-mail inválido." };
  }

  const jaMembro = await prisma.accountMember.findFirst({
    where: { accountId: conta.id, user: { email } },
  });
  if (jaMembro) return { erro: `${email} já faz parte desta conta.` };

  const pendente = await prisma.invite.findFirst({
    where: {
      accountId: conta.id,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pendente) {
    return { erro: `Já existe um convite pendente para ${email}.` };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DIAS_DE_VALIDADE * 86400000);

  await prisma.invite.create({
    data: {
      accountId: conta.id,
      email,
      role,
      token,
      invitedBy: user.id,
      expiresAt,
    },
  });

  const link = `${clientEnv.NEXT_PUBLIC_APP_URL}/convite/${token}`;

  const envio = await enviarEmail({
    para: email,
    assunto: `Convite para a conta ${conta.name} no Painel GBP`,
    texto: [
      `${user.email} convidou você para a conta "${conta.name}" no Painel GBP.`,
      "",
      `Aceite em: ${link}`,
      "",
      `O convite expira em ${DIAS_DE_VALIDADE} dias.`,
    ].join("\n"),
  });

  revalidatePath("/conta");

  return envio.enviado
    ? { ok: `Convite enviado para ${email}.` }
    : {
        ok: `Convite criado, mas o e-mail não saiu (${envio.motivo}). Envie o link manualmente: ${link}`,
      };
}

export async function revogarConvite(
  _anterior: EstadoConta,
  formData: FormData,
): Promise<EstadoConta> {
  const { user, conta } = await exigirContaAtiva();

  try {
    await exigirOwner(conta.id, user.id);
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  const inviteId = String(formData.get("inviteId") ?? "");

  // O `accountId` no where é o que impede revogar convite de outra conta com
  // um id adivinhado.
  const { count } = await prisma.invite.deleteMany({
    where: { id: inviteId, accountId: conta.id, acceptedAt: null },
  });

  revalidatePath("/conta");
  return count > 0
    ? { ok: "Convite revogado." }
    : { erro: "Convite não encontrado." };
}

export async function alterarPapel(
  _anterior: EstadoConta,
  formData: FormData,
): Promise<EstadoConta> {
  const { user, conta } = await exigirContaAtiva();

  try {
    await exigirOwner(conta.id, user.id);
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  const memberId = String(formData.get("memberId") ?? "");
  const role = formData.get("role") === "OWNER" ? "OWNER" : "MEMBER";

  const membro = await prisma.accountMember.findFirst({
    where: { id: memberId, accountId: conta.id },
  });
  if (!membro) return { erro: "Membro não encontrado." };

  if (membro.role === "OWNER" && role === "MEMBER") {
    const donos = await prisma.accountMember.count({
      where: { accountId: conta.id, role: "OWNER" },
    });
    // Conta sem OWNER não teria quem convidar, renomear ou administrar
    // billing — e não há caminho no produto para recuperar disso.
    if (donos <= 1) return { erro: "A conta precisa de pelo menos um dono." };
  }

  await prisma.accountMember.update({ where: { id: memberId }, data: { role } });

  revalidatePath("/conta");
  return { ok: "Papel atualizado." };
}

export async function removerMembro(
  _anterior: EstadoConta,
  formData: FormData,
): Promise<EstadoConta> {
  const { user, conta } = await exigirContaAtiva();

  try {
    await exigirOwner(conta.id, user.id);
  } catch (erro) {
    return { erro: (erro as Error).message };
  }

  const memberId = String(formData.get("memberId") ?? "");

  const membro = await prisma.accountMember.findFirst({
    where: { id: memberId, accountId: conta.id },
  });
  if (!membro) return { erro: "Membro não encontrado." };

  if (membro.userId === user.id) {
    return { erro: "Você não pode remover a si mesmo." };
  }

  if (membro.role === "OWNER") {
    const donos = await prisma.accountMember.count({
      where: { accountId: conta.id, role: "OWNER" },
    });
    if (donos <= 1) return { erro: "A conta precisa de pelo menos um dono." };
  }

  await prisma.accountMember.delete({ where: { id: memberId } });

  revalidatePath("/conta");
  return { ok: "Membro removido." };
}

/**
 * Preferência de e-mail para alerta crítico (E8-08).
 *
 * Sem linha na tabela vale o padrão do produto — todo OWNER recebe. Só quem
 * mexe aqui ganha registro próprio.
 */
export async function salvarNotificacoes(
  _anterior: EstadoConta,
  formData: FormData,
): Promise<EstadoConta> {
  const { user } = await exigirContaAtiva();
  const receber = formData.get("emailOnCriticalAlert") === "on";

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: { emailOnCriticalAlert: receber },
    create: { userId: user.id, emailOnCriticalAlert: receber },
  });

  revalidatePath("/conta");
  return {
    ok: receber
      ? "Você receberá e-mail de alerta crítico."
      : "E-mail de alerta crítico desativado.",
  };
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_CONTA_ATIVA } from "@/lib/auth/conta";
import { provisionarUsuario } from "@/lib/auth/provisionar";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoConvite = { erro: string } | null;

/**
 * Aceita o convite e vincula o usuário logado à conta.
 *
 * O e-mail da sessão precisa bater com o do convite. O link é o segredo, mas
 * link circula: vai por e-mail, é reencaminhado, fica no histórico. Exigir a
 * coincidência garante que quem entra na conta é quem o dono quis convidar, e
 * não quem recebeu a mensagem por acaso.
 *
 * Tudo em uma transação: sem ela, um erro entre criar o vínculo e marcar o
 * convite deixaria o convite reutilizável.
 */
export async function aceitarConvite(
  _anterior: EstadoConvite,
  formData: FormData,
): Promise<EstadoConvite> {
  const token = String(formData.get("token") ?? "");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?proximo=/convite/${token}`);

  // Garante a linha em `users` antes do vínculo: quem chega direto pelo link
  // do convite pode nunca ter passado pela home.
  await provisionarUsuario(user);

  const convite = await prisma.invite.findUnique({ where: { token } });

  if (!convite || convite.acceptedAt) {
    return { erro: "Este convite não é mais válido." };
  }
  if (convite.expiresAt < new Date()) {
    return { erro: "Este convite expirou. Peça um novo ao dono da conta." };
  }
  if (convite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return {
      erro: `Este convite é para ${convite.email}. Entre com essa conta para aceitar.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.accountMember.upsert({
      where: {
        accountId_userId: { accountId: convite.accountId, userId: user.id },
      },
      update: { role: convite.role },
      create: {
        accountId: convite.accountId,
        userId: user.id,
        role: convite.role,
      },
    });

    await tx.invite.update({
      where: { id: convite.id },
      data: { acceptedAt: new Date() },
    });
  });

  // Entra já olhando a conta em que acabou de entrar — é o motivo de ter
  // clicado no link.
  (await cookies()).set(COOKIE_CONTA_ATIVA, convite.accountId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/");
}

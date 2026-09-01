import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { provisionarUsuario } from "@/lib/auth/provisionar";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cookie que guarda qual conta o usuário está olhando (E1-07). */
export const COOKIE_CONTA_ATIVA = "conta_ativa";

/**
 * Resolve o usuário autenticado e a conta ativa dele.
 *
 * Toda página e ação privada deve começar por aqui — é o ponto único onde
 * sessão vira tenant.
 *
 * Com convite de equipe, uma pessoa pode participar de várias contas; o
 * cookie diz qual está em foco. O vínculo é reconferido a cada requisição em
 * vez de confiar no cookie: cookie é dado do cliente, e quem for removido da
 * conta precisa perder o acesso na requisição seguinte, não no próximo login.
 */
export async function exigirContaAtiva() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const padrao = await provisionarUsuario(user);

  const escolhida = (await cookies()).get(COOKIE_CONTA_ATIVA)?.value;
  if (escolhida && escolhida !== padrao.id) {
    const vinculo = await prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: escolhida, userId: user.id } },
      include: { account: true },
    });

    if (vinculo) return { user, conta: vinculo.account };
  }

  return { user, conta: padrao };
}

/**
 * Conta ativa quando existe sessão, `null` quando não existe.
 *
 * Diferente de `exigirContaAtiva`, que redireciona para o login: as telas
 * públicas precisam saber quem é o visitante sem expulsá-lo. É o que permite
 * a mesma rota servir o visitante anônimo com limite apertado e o assinante
 * com limite folgado.
 */
export async function contaAtivaOuNulo() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  try {
    const padrao = await provisionarUsuario(user);

    const escolhida = (await cookies()).get(COOKIE_CONTA_ATIVA)?.value;
    if (escolhida && escolhida !== padrao.id) {
      const vinculo = await prisma.accountMember.findUnique({
        where: { accountId_userId: { accountId: escolhida, userId: user.id } },
        include: { account: true },
      });
      if (vinculo) return { user, conta: vinculo.account };
    }

    return { user, conta: padrao };
  } catch {
    // Sessão válida mas provisionamento falhou não pode derrubar uma página
    // pública — o visitante segue como anônimo.
    return null;
  }
}

/** Contas às quais o usuário pertence, para o seletor de conta ativa. */
export async function contasDoUsuario(userId: string) {
  const vinculos = await prisma.accountMember.findMany({
    where: { userId },
    include: { account: true },
    orderBy: { createdAt: "asc" },
  });

  return vinculos.map((v) => ({
    id: v.account.id,
    nome: v.account.name,
    papel: v.role,
  }));
}

/**
 * Papel do usuário na conta ativa.
 *
 * OWNER administra (convida, muda papel, remove); MEMBER só visualiza a
 * configuração. Quem não é membro não deveria chegar aqui — `exigirContaAtiva`
 * resolve a conta pelo próprio vínculo —, então a ausência é tratada como
 * inexistência.
 */
export async function papelNaConta(
  accountId: string,
  userId: string,
): Promise<"OWNER" | "MEMBER"> {
  const vinculo = await prisma.accountMember.findUnique({
    where: { accountId_userId: { accountId, userId } },
    select: { role: true },
  });

  if (!vinculo) notFound();

  return vinculo.role;
}

/** Barra a ação de quem não é OWNER da conta. */
export async function exigirOwner(accountId: string, userId: string) {
  if ((await papelNaConta(accountId, userId)) !== "OWNER") {
    throw new Error("Só o dono da conta pode fazer esta alteração.");
  }
}

/**
 * Confirma que um negócio pertence à conta informada.
 *
 * ATENÇÃO: o Prisma se conecta como dono do banco e **ignora RLS**. A
 * política de linha do Supabase não protege nada neste caminho — todo o
 * isolamento entre tenants depende deste tipo de checagem em código.
 *
 * Devolve 404 em vez de 403 de propósito: responder "não autorizado" já
 * confirmaria que o id existe.
 */
export async function exigirNegocioDaConta(
  businessId: string,
  accountId: string,
) {
  const negocio = await prisma.business.findFirst({
    where: { id: businessId, accountId },
  });

  if (!negocio) {
    notFound();
  }

  return negocio;
}

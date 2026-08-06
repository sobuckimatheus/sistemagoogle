import "server-only";

import { notFound, redirect } from "next/navigation";

import { provisionarUsuario } from "@/lib/auth/provisionar";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolve o usuário autenticado e a conta ativa dele.
 *
 * Toda página e ação privada deve começar por aqui — é o ponto único onde
 * sessão vira tenant.
 */
export async function exigirContaAtiva() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const conta = await provisionarUsuario(user);
  return { user, conta };
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

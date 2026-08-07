"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_CONTA_ATIVA } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Troca a conta ativa (E1-07).
 *
 * Grava o cookie só depois de confirmar o vínculo — sem essa checagem, o
 * cookie viraria um seletor de tenant controlado pelo cliente, que é
 * exatamente o vazamento que o E1-06 existe para evitar.
 *
 * Redireciona para a home porque a tela anterior costuma ser de um negócio
 * que pertence à conta antiga.
 */
export async function trocarConta(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const vinculo = await prisma.accountMember.findUnique({
    where: { accountId_userId: { accountId, userId: user.id } },
    select: { id: true },
  });

  if (!vinculo) redirect("/");

  (await cookies()).set(COOKIE_CONTA_ATIVA, accountId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/");
}

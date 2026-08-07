import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { FormularioAceite } from "./formulario";

export const dynamic = "force-dynamic";

/**
 * Tela de aceite do convite.
 *
 * Acessível sem sessão de propósito: o convidado pode não ter conta ainda, e
 * mandá-lo para o login sem explicar o que é o link seria um beco sem saída.
 * O vínculo em si só acontece na ação, com sessão e e-mail conferidos.
 */
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const convite = await prisma.invite.findUnique({
    where: { token },
    include: { account: true },
  });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const invalido =
    !convite || convite.acceptedAt !== null || convite.expiresAt < new Date();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Convite</h1>

      {invalido ? (
        <>
          <p className="text-sm text-neutral-500">
            {convite?.acceptedAt
              ? "Este convite já foi aceito."
              : "Este convite expirou ou não existe. Peça um novo ao dono da conta."}
          </p>
          <Link href="/" className="text-sm underline">
            Ir para o painel
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            Você foi convidado para a conta{" "}
            <strong className="text-neutral-900 dark:text-neutral-100">
              {convite.account.name}
            </strong>{" "}
            como {convite.role === "OWNER" ? "dono" : "membro"}. O convite é
            para <strong>{convite.email}</strong>.
          </p>

          {user ? (
            <FormularioAceite
              token={token}
              nomeDaConta={convite.account.name}
            />
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <p className="text-neutral-500">
                Entre ou crie uma conta com esse e-mail para aceitar.
              </p>
              <div className="flex gap-3">
                <Link
                  href={`/login?proximo=/convite/${token}`}
                  className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-white dark:text-neutral-900"
                >
                  Entrar
                </Link>
                <Link
                  href="/cadastro"
                  className="rounded-md border border-neutral-300 px-4 py-2 dark:border-neutral-700"
                >
                  Criar conta
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

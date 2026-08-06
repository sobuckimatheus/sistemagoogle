import { redirect } from "next/navigation";

import { sair } from "@/app/actions/auth";
import { provisionarUsuario } from "@/lib/auth/provisionar";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Lê sessão e banco a cada requisição — não faz sentido pré-renderizar.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O middleware já barra acesso sem sessão; isto cobre a corrida entre
  // expiração do token e renderização.
  if (!user) {
    redirect("/login");
  }

  // Provisiona também aqui, e não só no callback: quem entra por login direto
  // (sem passar por confirmação de e-mail) nunca toca o callback.
  const conta = await provisionarUsuario(user);

  const [assinatura, negocios] = await Promise.all([
    prisma.subscription.findUnique({
      where: { accountId: conta.id },
      include: { plan: true },
    }),
    prisma.business.count({ where: { accountId: conta.id } }),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Painel GBP</h1>
          <p className="text-sm text-neutral-500">{user.email}</p>
        </div>
        <form action={sair}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            Sair
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Conta</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">Nome</dt>
            <dd>{conta.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Plano</dt>
            <dd>
              {assinatura?.plan.name ?? "—"}{" "}
              <span className="text-neutral-500">
                ({assinatura?.status.toLowerCase()})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Negócios conectados</dt>
            <dd>
              {negocios} de {assinatura?.plan.maxBusinesses ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Palavras-chave</dt>
            <dd>0 de {assinatura?.plan.maxKeywords ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-dashed border-neutral-300 p-5 dark:border-neutral-700">
        <h2 className="text-sm font-medium">Próximo passo</h2>
        <p className="text-sm text-neutral-500">
          Conectar o Google Meu Negócio. Essa é a épica E2 e depende da
          aprovação do allowlist das Business Profile APIs — ver TASKS.md.
        </p>
      </section>
    </main>
  );
}

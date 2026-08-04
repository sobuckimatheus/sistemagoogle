import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Lê sessão e banco a cada requisição — não faz sentido pré-renderizar.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [planos, benchmarks, negocios] = await Promise.all([
    prisma.plan.count(),
    prisma.segmentBenchmark.count(),
    prisma.business.count(),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Painel GBP</h1>
        <p className="text-sm text-neutral-500">
          Fundação instalada. Autenticação e onboarding entram nas próximas
          épicas — ver TASKS.md.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Sessão</h2>
        <p className="font-mono text-sm text-neutral-600 dark:text-neutral-400">
          {user ? user.email : "sem usuário autenticado"}
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-sm font-medium">Banco de dados</h2>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-neutral-500">Planos</dt>
            <dd className="font-mono text-lg">{planos}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Benchmarks</dt>
            <dd className="font-mono text-lg">{benchmarks}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Negócios</dt>
            <dd className="font-mono text-lg">{negocios}</dd>
          </div>
        </dl>
        <p className="text-xs text-neutral-500">
          Números vindos do Postgres pelo pooler de transação. 3 planos e 12
          benchmarks confirmam que o seed está aplicado e que a conexão de
          runtime funciona.
        </p>
      </section>
    </main>
  );
}

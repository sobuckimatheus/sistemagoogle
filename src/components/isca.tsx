import Link from "next/link";

import { VerificadorPublico } from "@/app/verificador/formulario";

/**
 * Página isca — a porta de entrada do produto.
 *
 * Serve tanto a raiz (`/`) para quem não está logado quanto a rota
 * `/verificador`, que continua existindo para campanhas e links diretos.
 *
 * A página é só a pergunta e a resposta: manchete e verificador, sem nada
 * entre a visita e o número. Pedir cadastro antes da resposta mataria a
 * conversão, que é a razão de a página existir; o convite para criar conta
 * fica no cabeçalho, ao alcance de quem já se convenceu.
 */
export function PaginaIsca() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <span className="font-semibold tracking-tight">Painel GBP</span>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/login"
              className="text-neutral-600 hover:underline dark:text-neutral-300"
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-12 px-6 py-12 sm:py-16">
        <section className="flex flex-col gap-4 text-center">
          <span className="mx-auto rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
            Grátis · sem cadastro
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Em que posição sua empresa aparece no Google?
          </h1>
          <p className="mx-auto max-w-xl text-base text-neutral-600 dark:text-neutral-400 sm:text-lg">
            Medimos 25 pontos espalhados pela sua cidade e mostramos a posição
            média em que você aparece quando alguém procura o serviço que você
            vende — e quem aparece antes.
          </p>
        </section>

        <VerificadorPublico />
      </main>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500 dark:border-neutral-800">
        Painel GBP · dados públicos do Google Maps · não somos afiliados ao
        Google
      </footer>
    </div>
  );
}

import Link from "next/link";

import { VerificadorPublico } from "./formulario";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verificador de Posição no Google — grátis | Painel GBP",
  description:
    "Descubra em que posição sua empresa aparece no Google Maps para o serviço que você vende. Grátis, sem cadastro.",
};

/**
 * Página isca: pública, sem login.
 *
 * A pergunta "em que posição eu apareço?" é o que traz a pessoa, e cobrar
 * cadastro antes de responder mata a conversão. O caminho é responder
 * primeiro, mostrar a consequência — quantos concorrentes vêm antes dela — e
 * só então oferecer o produto que resolve.
 */
export default function VerificadorPage() {
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
            Quando alguém procura o serviço que você vende, o Google mostra uma
            lista. Descubra em que lugar dessa lista você está — e quem aparece
            antes.
          </p>
        </section>

        <VerificadorPublico />

        <section className="grid gap-6 border-t border-neutral-200 pt-10 dark:border-neutral-800 sm:grid-cols-3">
          {[
            {
              titulo: "Quase ninguém passa do terceiro",
              texto:
                "A lista do Maps mostra três negócios antes de exigir um clique a mais. Estar em quarto já é ficar escondido atrás de um botão.",
            },
            {
              titulo: "Posição não é sorte",
              texto:
                "Ela vem de sinais que dá para medir: perfil completo, avaliações respondidas, publicações recentes, categoria certa.",
            },
            {
              titulo: "E muda sem avisar",
              texto:
                "Concorrente que passa a responder avaliações sobe. Quem parou de publicar cai. Sem acompanhar, você descobre tarde.",
            },
          ].map((bloco) => (
            <div key={bloco.titulo} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{bloco.titulo}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {bloco.texto}
              </p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-6 border-t border-neutral-200 pt-10 dark:border-neutral-800">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Perguntas que sempre aparecem
            </h2>
          </div>

          <dl className="flex flex-col gap-5">
            {[
              {
                p: "De onde vem esse número?",
                r: "Da mesma lista que o Google mostra ao seu cliente, consultada a partir do endereço da sua empresa. Nós não reordenamos nada.",
              },
              {
                p: "Por que a posição muda dependendo de quem busca?",
                r: "Porque o Maps é local por natureza: quem está a dois quarteirões de você vê uma lista diferente de quem está do outro lado da cidade. Por isso medimos sempre a partir do seu endereço — assim a comparação ao longo do tempo faz sentido.",
              },
              {
                p: "Preciso conectar minha conta do Google para testar?",
                r: "Não. A verificação usa dados públicos do Maps. A conexão com o Google Meu Negócio só é necessária depois, quando você quiser editar o perfil e responder avaliações por aqui.",
              },
              {
                p: "Em quanto tempo eu subo de posição?",
                r: "Não existe garantia, e desconfie de quem promete. O que dá para garantir é o método: corrigir o que está incompleto, responder avaliações e publicar com constância. O painel mostra o que falta e mede o efeito.",
              },
            ].map((item) => (
              <div key={item.p} className="flex flex-col gap-1">
                <dt className="text-sm font-semibold">{item.p}</dt>
                <dd className="text-sm text-neutral-600 dark:text-neutral-400">
                  {item.r}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-2xl font-semibold tracking-tight">
            Saber a posição é o começo. Melhorar é o trabalho.
          </h2>
          <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">
            O Painel GBP acompanha seu perfil todos os dias, aponta o que está
            te segurando e mostra se o que você fez teve efeito.
          </p>
          <Link
            href="/cadastro"
            className="rounded-lg bg-neutral-900 px-6 py-3.5 text-base font-semibold text-white dark:bg-white dark:text-neutral-900"
          >
            Criar minha conta
          </Link>
          <span className="text-xs text-neutral-500">
            Já tem conta?{" "}
            <Link href="/login" className="underline">
              Entrar
            </Link>
          </span>
        </section>
      </main>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500 dark:border-neutral-800">
        Painel GBP · dados públicos do Google Maps · não somos afiliados ao
        Google
      </footer>
    </div>
  );
}

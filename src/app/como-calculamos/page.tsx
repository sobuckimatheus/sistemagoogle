import Link from "next/link";

export const metadata = { title: "Como calculamos — Painel GBP" };

export default function ComoCalculamosPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Como calculamos as estimativas
        </h1>
        <p className="text-sm text-neutral-500">
          Estes números não vêm do Google. São estimativas calculadas sobre
          dados reais do seu perfil, e esta página existe para você poder
          conferir cada conta.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">O que vem do Google</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Visualizações, ligações, solicitações de rota, cliques no site,
          conversas e agendamentos são medidos pelo Google e apenas
          armazenados por nós. Nota do perfil e checklist são cálculo nosso,
          sobre os dados do seu perfil.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Clientes estimados</h2>
        <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-4 text-xs dark:bg-neutral-900">
{`clientes = (ligações + rotas + cliques no site) × taxa de conversão`}
        </pre>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Essas três são as ações que indicam intenção de compra. A taxa de
          conversão é a que você configurou no negócio; se não configurou,
          usamos a referência da sua categoria.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Faturamento atribuído</h2>
        <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-4 text-xs dark:bg-neutral-900">
{`faturamento = clientes estimados × ticket médio`}
        </pre>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Receita perdida</h2>
        <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-4 text-xs dark:bg-neutral-900">
{`potencial = ações × taxa de conversão do topo do segmento × ticket médio
perdida  = potencial − faturamento atribuído`}
        </pre>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          A comparação usa a <strong>mesma</strong> audiência que você já tem,
          convertendo melhor — não uma audiência maior. O que está em jogo é a
          eficiência do perfil, não investimento em mídia. Quando não temos o
          número do topo do segmento, usamos 1,5× a média, um fator
          deliberadamente conservador: superestimar o potencial inflaria este
          valor e tornaria a estimativa inútil.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Conversão do perfil</h2>
        <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-4 text-xs dark:bg-neutral-900">
{`conversão = (ligações + rotas + cliques no site) ÷ visualizações`}
        </pre>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950">
        <h2 className="text-sm font-medium">Limites que você deve conhecer</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
          <li>
            As taxas de referência por categoria são valores iniciais, não
            medições da sua base de clientes. Configure seu ticket médio e sua
            taxa de conversão real no negócio para os números ficarem seus.
          </li>
          <li>
            Cliques no botão de WhatsApp não são rastreáveis pela API do
            Google. Se o seu perfil usa WhatsApp como contato principal, o
            número de ações reais é maior do que o exibido.
          </li>
          <li>
            Uma ação no perfil não é uma venda. A taxa de conversão traduz uma
            na outra, e é justamente a parte mais sensível da estimativa.
          </li>
        </ul>
      </section>

      <Link href="/" className="text-sm underline">
        Voltar
      </Link>
    </main>
  );
}

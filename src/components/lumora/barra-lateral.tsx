"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icone, type NomeDeIcone } from "@/components/lumora/icones";

export type ItemDeNavegacao = {
  href: string;
  rotulo: string;
  icone: NomeDeIcone;
  /** Contagem que merece atenção; some quando é zero. */
  contador?: number;
  /** Selo de recurso novo, para o que acabou de entrar no produto. */
  novo?: boolean;
  /** Rota que ainda não existe para esta conta — visível, mas sem link. */
  desabilitado?: boolean;
};

export type Rodape = {
  negocio: string;
  plano: string;
  ativo: boolean;
};

/**
 * Navegação do painel.
 *
 * Cliente por um motivo só: marcar a rota atual. O resto é estático e vem
 * pronto do servidor.
 */
export function BarraLateral({
  itens,
  rodape,
  sincronizadoEm,
}: {
  itens: ItemDeNavegacao[];
  rodape: Rodape;
  sincronizadoEm: string | null;
}) {
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-borda bg-superficie lg:flex">
        <Marca />

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="flex flex-col gap-0.5">
            {itens.map((item) => (
              <li key={item.rotulo}>
                <ItemLateral item={item} />
              </li>
            ))}
          </ul>
        </nav>

        {sincronizadoEm && (
          <p className="mx-3 mb-3 rounded-lg border border-borda bg-fundo px-3 py-2.5 text-[11px] leading-relaxed text-texto-fraco">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-alta align-middle" />
            Dados do Google atualizados em{" "}
            <span className="text-texto-suave">{sincronizadoEm}</span>
          </p>
        )}

        <Identidade rodape={rodape} />
      </aside>

      {/* Abaixo de lg a lateral vira uma faixa rolável, para o conteúdo ficar
          com a largura inteira da tela. */}
      <div className="sticky top-0 z-20 border-b border-borda bg-superficie lg:hidden">
        <Marca compacta />
        <nav className="overflow-x-auto px-2 pb-2">
          <ul className="flex w-max gap-1">
            {itens.map((item) => (
              <li key={item.rotulo}>
                <ItemLateral item={item} horizontal />
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 px-6 ${compacta ? "py-3" : "py-7"}`}
    >
      <Icone nome="faisca" className="size-5 text-ouro" />
      <span className="font-serif text-2xl lowercase leading-none tracking-tight text-ouro">
        lumora
      </span>
    </div>
  );
}

function ItemLateral({
  item,
  horizontal = false,
}: {
  item: ItemDeNavegacao;
  horizontal?: boolean;
}) {
  const caminho = usePathname();
  // Só igualdade exata: o Dashboard é prefixo de todas as outras rotas do
  // negócio e ficaria aceso o tempo inteiro com startsWith.
  const ativo = caminho === item.href;

  const classes = `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
    horizontal ? "whitespace-nowrap" : ""
  } ${
    item.desabilitado
      ? "cursor-not-allowed text-texto-fraco/60"
      : ativo
        ? "bg-ouro-fundo text-ouro-claro"
        : "text-texto-suave hover:bg-superficie-alta hover:text-texto"
  }`;

  const conteudo = (
    <>
      <Icone nome={item.icone} className="size-[18px] shrink-0" />
      {item.rotulo}
      {item.novo && (
        <span className="rounded bg-ouro/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ouro">
          Novo
        </span>
      )}
      {item.contador ? (
        <span className="numero ml-auto rounded-md bg-superficie-alta px-1.5 py-0.5 text-[11px] font-medium text-texto-suave">
          {item.contador}
        </span>
      ) : null}
    </>
  );

  // Sem negócio conectado o item não vira link: apontar para uma rota que não
  // existe para esta conta entregaria um 404 no lugar de uma orientação.
  if (item.desabilitado) {
    return (
      <span className={classes} aria-disabled="true">
        {conteudo}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={classes}
    >
      {conteudo}
    </Link>
  );
}

function Identidade({ rodape }: { rodape: Rodape }) {
  return (
    <Link
      href="/negocios"
      className="m-3 flex items-center gap-3 rounded-lg border border-borda px-3 py-2.5 text-left transition-colors hover:bg-superficie-alta"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ouro-fundo text-sm font-semibold text-ouro">
        {rodape.negocio.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-texto">
          {rodape.negocio}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-texto-fraco">
          <span
            className={`size-1.5 rounded-full ${rodape.ativo ? "bg-alta" : "bg-atencao"}`}
          />
          {rodape.plano}
        </span>
      </span>
      <Icone nome="seta" className="size-4 shrink-0 text-texto-fraco" />
    </Link>
  );
}

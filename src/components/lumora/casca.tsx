import {
  BarraLateral,
  type ItemDeNavegacao,
  type Rodape,
} from "@/components/lumora/barra-lateral";

/**
 * Casca do painel: barra lateral mais a área de conteúdo.
 *
 * Existe fora do layout de `/negocio/[id]` porque a tela de primeiros passos
 * também precisa dela — quem ainda não conectou o Google vê a mesma moldura,
 * com a orientação no lugar dos dados, em vez de cair numa página solta que
 * não parece o produto.
 */
export function CascaDoPainel({
  itens,
  rodape,
  sincronizadoEm = null,
  children,
}: {
  itens: ItemDeNavegacao[];
  rodape: Rodape;
  sincronizadoEm?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-fundo lg:flex-row">
      <BarraLateral
        itens={itens}
        rodape={rodape}
        sincronizadoEm={sincronizadoEm}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Itens da navegação do negócio.
 *
 * Sem negócio conectado (`id` nulo) os itens continuam visíveis, porém
 * desabilitados: esconder a navegação faria a tela de primeiros passos
 * parecer outro produto, e deixá-la clicável levaria a rotas que ainda não
 * existem para esta conta.
 */
export function itensDoNegocio(
  id: string | null,
  contagens: { pendentes: number; naoLidos: number } = {
    pendentes: 0,
    naoLidos: 0,
  },
): ItemDeNavegacao[] {
  const base = (sufixo: string) => (id ? `/negocio/${id}${sufixo}` : "#");
  const desabilitado = id === null;

  return [
    { href: base(""), rotulo: "Dashboard", icone: "painel", desabilitado },
    {
      href: base("/desempenho"),
      rotulo: "Desempenho",
      icone: "visao",
      desabilitado,
    },
    {
      href: base("/perfil"),
      rotulo: "Auditoria do perfil",
      icone: "auditoria",
      desabilitado,
    },
    {
      href: base("/avaliacoes"),
      rotulo: "Avaliações",
      icone: "estrela",
      desabilitado,
    },
    {
      href: base("/postagens"),
      rotulo: "Postagens",
      icone: "postagem",
      desabilitado,
    },
    {
      href: base("/concorrentes"),
      rotulo: "Concorrentes",
      icone: "concorrentes",
      desabilitado,
    },
    {
      href: base("/palavras-chave"),
      rotulo: "Palavras-chave",
      icone: "receita",
      desabilitado,
    },
    {
      href: base("/checklist"),
      rotulo: "Plano de ação",
      icone: "checklist",
      contador: contagens.pendentes,
      desabilitado,
    },
    {
      href: base("/alertas"),
      rotulo: "Alertas",
      icone: "alerta",
      contador: contagens.naoLidos,
      desabilitado,
    },
    {
      href: base("/relatorio"),
      rotulo: "Relatório",
      icone: "relatorio",
      desabilitado,
    },
    // Configurações da conta não dependem de negócio nenhum.
    { href: "/conta", rotulo: "Configurações", icone: "config" },
  ];
}

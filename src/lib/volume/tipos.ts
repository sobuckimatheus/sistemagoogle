/**
 * Contrato das fontes de volume de busca.
 *
 * Existe porque a fonte é uma decisão de operação, não de arquitetura: o
 * Google Ads depende de MCC e de aprovação do developer token, e enquanto
 * isso não sai o produto precisa de número na tela. Com o contrato, trocar a
 * fonte é mudar uma variável de ambiente — o job mensal, o botão de atualizar
 * e a tela não sabem nem precisam saber quem respondeu.
 */

export type VolumeDeTermo = {
  termo: string;
  /** Média de buscas por mês. Nulo quando a fonte não tem dado para o termo. */
  volume: number | null;
  /** 0–100. Concorrência entre anunciantes, não dificuldade de SEO. */
  concorrencia: number | null;
};

export type FonteDeVolume = {
  /** Identificador curto, usado em log e mensagem de erro. */
  nome: string;
  configurada: () => boolean;
  /**
   * Devolve uma entrada por termo pedido, na ordem original, mesmo quando não
   * há dado — quem chama precisa distinguir "não perguntamos" de "perguntamos
   * e não há dado", senão volume nulo vira retentativa eterna.
   */
  buscar: (termos: string[]) => Promise<VolumeDeTermo[]>;
};

/**
 * Alvo geográfico e idioma padrão.
 *
 * As duas fontes usam os mesmos identificadores do Google (geo target e
 * language constant), o que é coincidência feliz: o Mangools também é
 * alimentado por dados do Keyword Planner.
 */
export const BRASIL = 2076;
export const PORTUGUES = 1014;

/**
 * Lê um identificador numérico vindo de variável de ambiente.
 *
 * Variável declarada e vazia é o caso comum — `.env` costuma ter a chave
 * presente com valor em branco. `??` não cobre isso, porque string vazia não
 * é nulo, e `Number("")` é `0`: a API aceita, não reclama, e devolve resposta
 * vazia. Falha silenciosa é pior que erro.
 */
export function idNumerico(
  valor: string | undefined,
  padrao: number,
): number {
  if (!valor?.trim()) return padrao;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/**
 * Um resultado do ranking local, independente de quem o forneceu.
 *
 * Fica separado dos provedores para que trocar a fonte de posição não obrigue
 * a mexer nas telas — foi exatamente o que aconteceu ao sair do SerpApi.
 */
export type ResultadoLocal = {
  posicao: number;
  titulo: string;
  placeId: string | null;
  nota: number | null;
  totalAvaliacoes: number | null;
  endereco: string | null;
  tipo: string | null;
  /** URL da imagem principal, quando a fonte entrega. */
  foto: string | null;
};

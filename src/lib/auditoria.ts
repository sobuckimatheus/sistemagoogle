/**
 * Auditoria do perfil: nota 0–100 e checklist acionável.
 *
 * Função pura de propósito — nenhuma chamada de banco ou de API. Isso a torna
 * testável isoladamente e permite recalcular a nota sobre dados históricos sem
 * refazer sync.
 *
 * Os pesos vêm da seção 5.3 do PRD. Somam 100.
 */

export type EntradaAuditoria = {
  primaryCategory: string | null;
  additionalCategories: string[];
  description: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  city: string | null;
  temHorarios: boolean;
  temServicos: boolean;
  totalAvaliacoes: number;
  notaMedia: number | null;
  avaliacoesRespondidas: number;
  postagensUltimos30Dias: number;
};

export type StatusItem = "ok" | "atencao" | "pendente";

export type ItemChecklist = {
  area: string;
  label: string;
  status: StatusItem;
  peso: number;
  /** Fração do peso conquistada, de 0 a 1. */
  pontuacao: number;
  prioridade: "alta" | "media" | "baixa";
  dica: string;
};

const PESOS = {
  categoria: 12,
  descricao: 10,
  horarios: 10,
  servicos: 8,
  endereco: 8,
  telefone: 6,
  site: 6,
  volumeAvaliacoes: 15,
  notaMedia: 15,
  respostas: 10,
} as const;

/** Referências de volume de avaliações — abaixo de 10 o perfil é frágil. */
const AVALIACOES_MINIMO = 10;
const AVALIACOES_BOM = 50;

export function auditar(entrada: EntradaAuditoria): {
  score: number;
  itens: ItemChecklist[];
} {
  const itens: ItemChecklist[] = [];

  const add = (
    area: string,
    label: string,
    peso: number,
    pontuacao: number,
    prioridade: ItemChecklist["prioridade"],
    dica: string,
  ) => {
    const status: StatusItem =
      pontuacao >= 1 ? "ok" : pontuacao > 0 ? "atencao" : "pendente";
    itens.push({ area, label, status, peso, pontuacao, prioridade, dica });
  };

  add(
    "Categorias",
    "Categoria principal definida",
    PESOS.categoria,
    entrada.primaryCategory ? (entrada.additionalCategories.length > 0 ? 1 : 0.7) : 0,
    "alta",
    "A categoria principal é o que mais pesa para aparecer nas buscas certas. Categorias secundárias ampliam o alcance.",
  );

  const tamanhoDescricao = entrada.description?.trim().length ?? 0;
  add(
    "Descrição",
    "Descrição preenchida",
    PESOS.descricao,
    tamanhoDescricao >= 250 ? 1 : tamanhoDescricao > 0 ? 0.5 : 0,
    "media",
    "Descrições acima de 250 caracteres aproveitam melhor o espaço e cabem mais termos de busca.",
  );

  add(
    "Horários",
    "Horário de funcionamento",
    PESOS.horarios,
    entrada.temHorarios ? 1 : 0,
    "alta",
    "Perfil sem horário perde destaque nas buscas por 'aberto agora'.",
  );

  add(
    "Serviços",
    "Serviços cadastrados",
    PESOS.servicos,
    entrada.temServicos ? 1 : 0,
    "media",
    "Serviços listados aparecem na busca e ajudam a casar com o que o cliente digitou.",
  );

  add(
    "Endereço",
    "Endereço completo",
    PESOS.endereco,
    entrada.addressLine1 && entrada.city ? 1 : 0,
    "alta",
    "Endereço incompleto prejudica o ranqueamento local e a rota no Maps.",
  );

  add(
    "Contato",
    "Telefone cadastrado",
    PESOS.telefone,
    entrada.phone ? 1 : 0,
    "media",
    "Sem telefone você perde a métrica de ligações — que é a ação mais valiosa do perfil.",
  );

  add(
    "Contato",
    "Site cadastrado",
    PESOS.site,
    entrada.website ? 1 : 0,
    "baixa",
    "O clique no site é uma das três ações que o Google mede.",
  );

  const volume =
    entrada.totalAvaliacoes >= AVALIACOES_BOM
      ? 1
      : entrada.totalAvaliacoes >= AVALIACOES_MINIMO
        ? 0.6
        : entrada.totalAvaliacoes > 0
          ? 0.3
          : 0;
  add(
    "Avaliações",
    `Volume de avaliações (${entrada.totalAvaliacoes})`,
    PESOS.volumeAvaliacoes,
    volume,
    "alta",
    `Abaixo de ${AVALIACOES_MINIMO} avaliações o perfil transmite pouca confiança. A partir de ${AVALIACOES_BOM} o ganho é marginal.`,
  );

  const nota = entrada.notaMedia ?? 0;
  add(
    "Avaliações",
    `Nota média (${entrada.notaMedia?.toFixed(1) ?? "sem avaliações"})`,
    PESOS.notaMedia,
    nota >= 4.5 ? 1 : nota >= 4 ? 0.7 : nota >= 3 ? 0.3 : 0,
    "alta",
    "Abaixo de 4,0 a nota vira objeção de compra. Responder avaliação negativa costuma render revisão da nota.",
  );

  const proporcaoRespostas =
    entrada.totalAvaliacoes > 0
      ? entrada.avaliacoesRespondidas / entrada.totalAvaliacoes
      : 1;
  add(
    "Avaliações",
    `Avaliações respondidas (${Math.round(proporcaoRespostas * 100)}%)`,
    PESOS.respostas,
    proporcaoRespostas >= 0.9 ? 1 : proporcaoRespostas >= 0.5 ? 0.5 : 0,
    "alta",
    "Responder avaliação é sinal de atividade para o Google e reduz o peso de uma crítica isolada.",
  );

  const pesoTotal = itens.reduce((s, i) => s + i.peso, 0);
  const conquistado = itens.reduce((s, i) => s + i.peso * i.pontuacao, 0);
  const score = Math.round((conquistado / pesoTotal) * 100);

  return { score, itens };
}

/**
 * Itens que ainda rendem pontos, do mais valioso para o menos.
 *
 * É o que alimenta o bloco "Principais motivos" e a "Maior oportunidade
 * agora" no dashboard: ordenar por peso perdido responde direto à pergunta
 * "o que fazer primeiro".
 */
export function oportunidades(itens: ItemChecklist[]): ItemChecklist[] {
  return itens
    .filter((i) => i.pontuacao < 1)
    .sort((a, b) => b.peso * (1 - b.pontuacao) - a.peso * (1 - a.pontuacao));
}

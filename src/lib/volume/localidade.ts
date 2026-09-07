import { CIDADES } from "@/lib/volume/dados/cidades-br";

/**
 * Resolve a cidade do negócio para o código de geo target do Google.
 *
 * O volume de busca só é acionável se for **da cidade do negócio**. "Barbearia"
 * tem dezenas de milhares de buscas no Brasil e algumas centenas numa cidade
 * média: quem decide em cima do número nacional escolhe o termo errado, e o
 * erro só aparece meses depois, quando o tráfego não vem.
 *
 * A cidade vem do perfil vinculado no Google (`Business.city` / `state`), não
 * de configuração — é o endereço que o próprio Google reconhece para o
 * negócio.
 */

/** Estados como o GBP costuma devolver, e como aparecem por extenso. */
const UFS: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "federal district": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

/**
 * Sem acento, sem caixa, sem espaço sobrando.
 *
 * O CSV do Google grava "Sao Paulo"; o perfil GBP devolve "São Paulo". Sem
 * normalizar, toda cidade acentuada falharia — e falharia calada, caindo num
 * padrão que ninguém percebe estar errado.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Aceita "SP", "São Paulo", "State of São Paulo". */
export function siglaDoEstado(estado: string | null): string | null {
  if (!estado?.trim()) return null;

  const limpo = normalizar(estado).replace(/^state of\s+/, "");
  if (/^[a-z]{2}$/.test(limpo)) return limpo.toUpperCase();

  return UFS[limpo] ?? null;
}

export type Localidade = {
  /** Código de geo target do Google, aceito pelas duas fontes. */
  codigo: number;
  /** Como resolvemos, para a tela poder dizer de onde vem o número. */
  rotulo: string;
};

/**
 * Devolve a localidade do negócio, ou `null` quando não dá para determiná-la.
 *
 * `null` é resposta legítima e importante: sem cidade reconhecida **não
 * buscamos volume**. Cair para o número nacional em silêncio seria devolver um
 * dado que parece certo e não é — pior que devolver nada, porque ninguém
 * desconfia de um número preenchido.
 */
export function localidadeDoNegocio(negocio: {
  city: string | null;
  state: string | null;
}): Localidade | null {
  if (!negocio.city?.trim()) return null;

  const cidade = normalizar(negocio.city);
  const uf = siglaDoEstado(negocio.state);

  if (uf) {
    const codigo = CIDADES[`${cidade}|${uf}`];
    if (codigo) return { codigo, rotulo: `${negocio.city.trim()}, ${uf}` };
  }

  // Sem UF, só aceitamos nome que exista em um único estado. Doze nomes de
  // cidade se repetem entre estados, e chutar um deles daria o volume de
  // outra cidade sem nenhum aviso.
  const candidatos = Object.keys(CIDADES).filter((k) =>
    k.startsWith(`${cidade}|`),
  );
  if (candidatos.length === 1) {
    return {
      codigo: CIDADES[candidatos[0]],
      rotulo: `${negocio.city.trim()}, ${candidatos[0].split("|")[1]}`,
    };
  }

  return null;
}

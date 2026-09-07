/**
 * Regera `src/lib/volume/dados/cidades-br.ts` a partir da lista do DataForSEO.
 *
 * Rode com `pnpm cidades:gerar`. O CSV é público e o endpoint equivalente
 * (`/v3/keywords_data/google_ads/locations/BR`) não é cobrado, então isto não
 * gasta saldo — mas também não precisa rodar com frequência: código de geo
 * target de cidade não muda.
 *
 * O formato do CSV é `code,"Cidade,State of X,Brazil",parent,ISO,tipo`, e a
 * parte do estado **falta em metade das linhas** (a mesma cidade aparece duas
 * vezes, com e sem). Por isso o estado de cada cidade é deduzido pelo `parent`,
 * que aponta para o estado e está sempre presente.
 */

const CSV =
  "https://cdn.dataforseo.com/v3/locations/locations_kwrd_2026_09_01.csv";

const UFS: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
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

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Divide uma linha de CSV respeitando as aspas do campo do nome. */
function colunas(linha: string): string[] {
  const saida: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (const c of linha) {
    if (c === '"') dentroDeAspas = !dentroDeAspas;
    else if (c === "," && !dentroDeAspas) {
      saida.push(atual);
      atual = "";
    } else atual += c;
  }
  saida.push(atual);
  return saida;
}

async function main() {
  const resposta = await fetch(CSV);
  if (!resposta.ok) throw new Error(`CSV respondeu ${resposta.status}`);

  const linhas = (await resposta.text()).split("\n");

  type Cidade = { codigo: number; nome: string; estado: string | null; pai: string };
  const cidades: Cidade[] = [];

  for (const linha of linhas) {
    const c = colunas(linha.trim());
    if (c.length < 5 || c[3] !== "BR" || c[4] !== "City") continue;
    const partes = c[1].split(",").map((p) => p.trim());
    cidades.push({
      codigo: Number(c[0]),
      nome: partes[0],
      estado: partes.length === 3 ? partes[1] : null,
      pai: c[2],
    });
  }

  // O `parent` é o mesmo para toda cidade de um estado; as linhas que trazem o
  // estado no nome ensinam a quem cada `parent` corresponde.
  const paiParaUf = new Map<string, string>();
  for (const cidade of cidades) {
    if (!cidade.estado) continue;
    const nome = normalizar(cidade.estado).replace(/^state of\s+/, "");
    const uf = UFS[nome];
    if (uf) paiParaUf.set(cidade.pai, uf);
  }

  const mapa = new Map<string, number>();
  for (const cidade of cidades) {
    const uf = paiParaUf.get(cidade.pai);
    if (!uf) continue;
    const chave = `${normalizar(cidade.nome)}|${uf}`;
    // Menor código é a entrada canônica; a duplicata costuma ser um alias.
    const atual = mapa.get(chave);
    if (atual === undefined || cidade.codigo < atual) {
      mapa.set(chave, cidade.codigo);
    }
  }

  const entradas = [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));

  const conteudo = `/**
 * Cidades brasileiras e seus códigos de geo target do Google.
 *
 * ARQUIVO GERADO — não edite à mão. Origem:
 * ${CSV}
 * (o endpoint \`/v3/keywords_data/google_ads/locations/BR\` devolve o mesmo, e
 * não é cobrado). Para atualizar, rode \`pnpm cidades:gerar\`.
 *
 * A chave é \`cidade|UF\` com a cidade **sem acento e em minúsculas**: o CSV do
 * Google grava "Sao Paulo", e o que vem do perfil GBP é "São Paulo". Casar sem
 * normalizar falharia em silêncio para toda cidade acentuada — que é a maioria
 * das grandes.
 *
 * A UF entra na chave porque 12 nomes de cidade se repetem em estados
 * diferentes. Sem ela, uma barbearia em Rio Claro de São Paulo receberia o
 * volume da homônima do Rio de Janeiro.
 */
export const CIDADES: Record<string, number> = {
${entradas.map(([k, v]) => `  "${k}": ${v},`).join("\n")}
};
`;

  const destino = new URL(
    "../src/lib/volume/dados/cidades-br.ts",
    import.meta.url,
  );
  await (await import("node:fs/promises")).writeFile(destino, conteudo);

  console.log(`${entradas.length} cidades gravadas em ${destino.pathname}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});

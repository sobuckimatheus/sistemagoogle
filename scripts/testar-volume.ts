/**
 * Verifica a fonte de volume de busca de ponta a ponta.
 *
 *   pnpm volume:testar               usa o termo "barbearia"
 *   pnpm volume:testar "pizzaria bh" outro termo
 *
 * Testa a fonte que a aplicação usaria: `VOLUME_PROVIDER` quando definida,
 * senão Google Ads se configurado, senão Mangools.
 *
 * Autocontido de propósito: não importa o código do app (que depende de
 * `server-only` e só roda dentro do Next). Assim ele serve para diagnosticar
 * credencial mesmo com o app quebrado, e o que ele testa é exatamente o que a
 * aplicação faz — mesmos endpoints e cabeçalhos.
 *
 * Traduz os erros mais comuns em causa provável, em vez de despejar o JSON
 * cru do provedor.
 */

const VERSAO = "v21";

/**
 * Variável declarada e vazia é o caso comum no `.env`, e `Number("")` é `0` —
 * o provedor aceita, não reclama e devolve resposta vazia. Mesma lógica de
 * `idNumerico` em src/lib/volume/tipos.ts.
 */
function idNumerico(valor: string | undefined, padrao: number): number {
  if (!valor?.trim()) return padrao;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

const LOCATION = idNumerico(process.env.VOLUME_LOCATION_ID, 2076); // Brasil
const LANGUAGE = idNumerico(process.env.VOLUME_LANGUAGE_ID, 1014); // português

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`✗ ${nome} não está definida no .env`);
    process.exit(1);
  }
  return valor;
}

const digitos = (v: string) => v.replace(/\D/g, "");

async function accessToken(): Promise<string> {
  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: exigir("GOOGLE_CLIENT_ID"),
      client_secret: exigir("GOOGLE_CLIENT_SECRET"),
      refresh_token: exigir("GOOGLE_ADS_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const corpo = await resposta.text();

  if (!resposta.ok) {
    console.error(`✗ Não consegui renovar o access token (${resposta.status}).`);
    if (corpo.includes("invalid_grant")) {
      console.error(
        "  Causa provável: refresh token expirado ou revogado.\n" +
          "  Se a tela de consentimento do projeto está em 'Testing', o refresh\n" +
          "  token expira em 7 dias — publique o app ou gere outro.",
      );
    }
    if (corpo.includes("invalid_client")) {
      console.error(
        "  Causa provável: GOOGLE_CLIENT_ID/SECRET não são os mesmos usados\n" +
          "  para gerar o refresh token.",
      );
    }
    console.error(`  Resposta: ${corpo.slice(0, 300)}`);
    process.exit(1);
  }

  return (JSON.parse(corpo) as { access_token: string }).access_token;
}

/** Qual fonte a aplicação usaria, com o mesmo critério de `src/lib/volume`. */
function fonteEscolhida(): "google-ads" | "mangools" {
  const explicita = process.env.VOLUME_PROVIDER;
  if (explicita === "google-ads" || explicita === "mangools") return explicita;

  const adsPronto =
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (adsPronto) return "google-ads";
  if (process.env.MANGOOLS_API_TOKEN) return "mangools";

  console.error(
    "✗ Nenhuma fonte configurada.\n" +
      "  Defina MANGOOLS_API_TOKEN (mais rápido) ou as variáveis do Google Ads.",
  );
  process.exit(1);
}

async function testarMangools(termo: string) {
  const token = exigir("MANGOOLS_API_TOKEN");

  console.log("Fonte          : Mangools (KWFinder)");
  console.log(`Local / idioma : ${LOCATION} / ${LANGUAGE}`);
  console.log(`Termo de teste : "${termo}"\n`);

  const resposta = await fetch(
    "https://api.mangools.com/v3/kwfinder/keyword-imports",
    {
      method: "POST",
      headers: { "x-access-token": token, "content-type": "application/json" },
      body: JSON.stringify({
        keywords: [termo],
        location_id: LOCATION,
        language_id: LANGUAGE,
      }),
    },
  );

  const corpo = await resposta.text();

  if (!resposta.ok) {
    console.error(`✗ Mangools respondeu ${resposta.status}.\n`);

    if (resposta.status === 401 || resposta.status === 403) {
      console.error(
        "Causa provável: token inválido, ou o plano da conta não inclui\n" +
          "acesso à API. O token existir no painel não garante que o plano\n" +
          "permita chamadas — confira em mangools.com/api-token.",
      );
    }
    if (resposta.status === 429) {
      console.error(
        "Causa provável: limite de keyword lookups do plano atingido.\n" +
          "Requisições idênticas em 24h não contam de novo — repita a mesma\n" +
          "consulta em vez de variar o termo enquanto testa.",
      );
    }

    console.error(`\nResposta crua:\n${corpo.slice(0, 600)}`);
    process.exit(1);
  }

  const dados = JSON.parse(corpo) as {
    data?: { kw?: string; keyword?: string; sv?: number | null }[];
  };

  const itens = dados.data ?? [];
  console.log("✓ Chamada aceita.\n");

  if (itens.length === 0) {
    console.log("A resposta veio vazia — termo sem dado na base do KWFinder.");
    return;
  }

  for (const item of itens) {
    const nome = item.kw ?? item.keyword ?? "(sem termo)";
    console.log(
      `"${nome}": ${
        typeof item.sv === "number"
          ? `${item.sv.toLocaleString("pt-BR")} buscas/mês`
          : "sem volume"
      }`,
    );
  }

  console.log(
    "\nLembre que o Mangools revende dado do Keyword Planner público —\n" +
      "os números costumam vir arredondados. É ponte, não destino: com o\n" +
      "developer token do Google Ads aprovado, troque VOLUME_PROVIDER.",
  );
}

async function testarGoogleAds(termo: string) {
  const customerId = digitos(exigir("GOOGLE_ADS_CUSTOMER_ID"));
  const developerToken = exigir("GOOGLE_ADS_DEVELOPER_TOKEN");
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  console.log("Fonte            : Google Ads (Keyword Planner)");
  console.log(`Conta consultada : ${customerId}`);
  console.log(
    `Conta de login   : ${loginCustomerId ? digitos(loginCustomerId) : "(nenhuma — conta sem MCC)"}`,
  );
  console.log(`Versão da API    : ${VERSAO}`);
  console.log(`Termo de teste   : "${termo}"\n`);

  const token = await accessToken();
  console.log("✓ Access token renovado.\n");

  const cabecalhos: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "content-type": "application/json",
  };
  if (loginCustomerId) {
    cabecalhos["login-customer-id"] = digitos(loginCustomerId);
  }

  const resposta = await fetch(
    `https://googleads.googleapis.com/${VERSAO}/customers/${customerId}:generateKeywordIdeas`,
    {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({
        keywordSeed: { keywords: [termo] },
        geoTargetConstants: [`geoTargetConstants/${LOCATION}`],
        language: `languageConstants/${LANGUAGE}`,
        keywordPlanNetwork: "GOOGLE_SEARCH",
        includeAdultKeywords: false,
      }),
    },
  );

  const corpo = await resposta.text();

  if (!resposta.ok) {
    console.error(`✗ Google Ads respondeu ${resposta.status}.\n`);

    const dicas: [RegExp, string][] = [
      [
        /SERVICE_DISABLED|has not been used in project/i,
        "A Google Ads API não está ativada no projeto do Google Cloud.\n" +
          "Ative na Biblioteca de APIs do projeto indicado na mensagem e\n" +
          "espere alguns minutos para propagar. Nada de errado com as\n" +
          "credenciais — elas já foram aceitas para chegar até aqui.",
      ],
      [
        /DEVELOPER_TOKEN_NOT_APPROVED|explorer access|test account/i,
        "Developer token em nível Explorer (o inicial, dado automaticamente).\n" +
          "Ele não libera o Keyword Planner. Peça ACESSO BÁSICO em\n" +
          "Ferramentas e configurações → Central de API, na conta MCC.\n" +
          "Enquanto não sair, nenhuma configuração aqui resolve.",
      ],
      [
        /DEVELOPER_TOKEN_INVALID|invalid developer token/i,
        "Developer token inválido. Confira se copiou o da MCC, sem espaços.",
      ],
      [
        /USER_PERMISSION_DENIED|not permitted/i,
        "A conta Google do refresh token não tem acesso a esse customer id,\n" +
          "ou falta o login-customer-id da MCC que gerencia a conta.",
      ],
      [
        /UNSUPPORTED_VERSION|not found.*version|404/i,
        `A versão ${VERSAO} pode ter sido aposentada. Confira a versão corrente\n` +
          "na documentação e atualize VERSAO aqui e em src/lib/google/ads.ts.",
      ],
      [
        /CUSTOMER_NOT_FOUND|customer not found/i,
        "Customer id não encontrado. Use só os dígitos, sem hífen.",
      ],
      [
        /authentication|UNAUTHENTICATED/i,
        "Escopo errado no refresh token: precisa ser\n" +
          "https://www.googleapis.com/auth/adwords",
      ],
    ];

    const dica = dicas.find(([padrao]) => padrao.test(corpo))?.[1];
    if (dica) console.error(`Causa provável:\n${dica}\n`);

    console.error(`Resposta crua:\n${corpo.slice(0, 800)}`);
    process.exit(1);
  }

  const dados = JSON.parse(corpo) as {
    results?: {
      text?: string;
      keywordIdeaMetrics?: {
        avgMonthlySearches?: string;
        competitionIndex?: string;
      };
    }[];
  };

  const resultados = dados.results ?? [];
  const exato = resultados.find(
    (r) => r.text?.toLowerCase() === termo.toLowerCase(),
  );

  console.log("✓ Chamada aceita.\n");

  if (exato?.keywordIdeaMetrics?.avgMonthlySearches) {
    console.log(
      `"${termo}": ${Number(
        exato.keywordIdeaMetrics.avgMonthlySearches,
      ).toLocaleString("pt-BR")} buscas/mês ` +
        `(concorrência ${exato.keywordIdeaMetrics.competitionIndex ?? "—"}/100)`,
    );
  } else {
    console.log(
      `O Google não devolveu volume para "${termo}" — pode ser termo sem dado.\n` +
        "Se todos os termos vierem sem volume, suspeite do nível do developer token.",
    );
  }

  console.log(`\nIdeias relacionadas recebidas: ${resultados.length}`);
  console.log(
    "\nSe o número acima veio arredondado em faixa (ex.: sempre 1000, 10000),\n" +
      "a conta não tem investimento suficiente para o Keyword Planner abrir a\n" +
      "média fechada — use a conta que de fato gasta.",
  );
}

async function main() {
  const termo = process.argv[2] ?? "barbearia";
  const fonte = fonteEscolhida();

  if (fonte === "mangools") await testarMangools(termo);
  else await testarGoogleAds(termo);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});

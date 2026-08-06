import "server-only";

const ACCOUNT_MANAGEMENT = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFORMATION = "https://mybusinessbusinessinformation.googleapis.com/v1";

/**
 * Erro de allowlist.
 *
 * As Business Profile APIs vêm com cota zero até o Google aprovar o pedido de
 * acesso — o pedido é por projeto do Cloud, mas cada API ainda precisa ser
 * ativada na Biblioteca. Enquanto isso, tudo responde 403.
 */
export class AllowlistPendenteError extends Error {
  constructor(readonly api: string) {
    super(`Acesso à ${api} ainda não liberado pelo Google.`);
    this.name = "AllowlistPendenteError";
  }
}

async function buscar<T>(url: string, accessToken: string, api: string) {
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Dados de conta mudam pouco e a cota é escassa.
    next: { revalidate: 60 },
  });

  if (resposta.status === 403 || resposta.status === 429) {
    throw new AllowlistPendenteError(api);
  }

  if (!resposta.ok) {
    throw new Error(
      `${api} respondeu ${resposta.status}: ${await resposta.text()}`,
    );
  }

  return (await resposta.json()) as T;
}

export type ContaGbp = {
  name: string; // accounts/123
  accountName: string;
  type?: string;
};

export async function listarContas(accessToken: string): Promise<ContaGbp[]> {
  const contas: ContaGbp[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${ACCOUNT_MANAGEMENT}/accounts`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const dados = await buscar<{
      accounts?: ContaGbp[];
      nextPageToken?: string;
    }>(url.toString(), accessToken, "Account Management API");

    contas.push(...(dados.accounts ?? []));
    pageToken = dados.nextPageToken;
  } while (pageToken);

  return contas;
}

export type LocalGbp = {
  name: string; // locations/456
  title: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  categories?: { primaryCategory?: { name?: string; displayName?: string } };
  phoneNumbers?: { primaryPhone?: string };
  websiteUri?: string;
  metadata?: { placeId?: string };
};

/**
 * `readMask` é obrigatório nesta API — sem ele a resposta vem vazia em vez de
 * erro, o que rende uma sessão inteira de depuração à toa.
 */
const CAMPOS_LOCAL = [
  "name",
  "title",
  "storefrontAddress",
  "categories",
  "phoneNumbers",
  "websiteUri",
  "metadata",
].join(",");

export async function listarLocais(
  accessToken: string,
  contaGbp: string,
): Promise<LocalGbp[]> {
  const locais: LocalGbp[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${BUSINESS_INFORMATION}/${contaGbp}/locations`);
    url.searchParams.set("readMask", CAMPOS_LOCAL);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const dados = await buscar<{
      locations?: LocalGbp[];
      nextPageToken?: string;
    }>(url.toString(), accessToken, "Business Information API");

    locais.push(...(dados.locations ?? []));
    pageToken = dados.nextPageToken;
  } while (pageToken);

  return locais;
}

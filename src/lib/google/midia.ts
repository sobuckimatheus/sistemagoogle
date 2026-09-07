import "server-only";

import { ApiV4IndisponivelError } from "./avaliacoes";

const V4 = "https://mybusiness.googleapis.com/v4";

/**
 * Fotos do perfil — API v4, a legada.
 *
 * São a melhor fonte de imagem para uma postagem: já pertencem ao cliente, já
 * retratam o estabelecimento dele e já estão hospedadas pelo Google. Nada de
 * upload, storage ou filtro de licença — os três problemas que qualquer
 * acervo de terceiros traz junto.
 *
 * Mesmo allowlist das avaliações, e por isso o mesmo erro: um projeto sem a v4
 * liberada não recebe fotos, e a interface esconde a opção em vez de quebrar.
 */

export type FotoGbp = {
  /** `name` do recurso na v4, estável entre sincronizações. */
  nome: string;
  /** URL pública da imagem em tamanho cheio — é o que vai para o post. */
  url: string;
  /** Miniatura, quando o Google devolve; cai para `url` se não vier. */
  miniatura: string;
  largura: number | null;
  altura: number | null;
  /** PROFILE, COVER, LOGO, EXTERIOR, INTERIOR… */
  categoria: string | null;
  criadaEm: Date | null;
};

/** O Google recomenda paisagem no card; retrato aparece cortado. */
const PROPORCAO_MINIMA = 1.2;
const LARGURA_MINIMA = 400;

type RespostaMidia = {
  mediaItems?: {
    name?: string;
    googleUrl?: string;
    thumbnailUrl?: string;
    mediaFormat?: string;
    locationAssociation?: { category?: string };
    dimensions?: { widthPixels?: number; heightPixels?: number };
    createTime?: string;
  }[];
  nextPageToken?: string;
};

/**
 * Lista as fotos do perfil, das mais recentes para as mais antigas.
 *
 * Só PHOTO: vídeo não serve de imagem de post. Fotos pequenas ou em retrato
 * ficam de fora porque o card do Google as exibe borradas ou cortadas — e uma
 * sugestão ruim custa mais do que uma sugestão a menos.
 */
export async function listarFotos(
  accessToken: string,
  gbpAccountName: string,
  locationName: string,
  limite = 24,
): Promise<FotoGbp[]> {
  const fotos: FotoGbp[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${V4}/${gbpAccountName}/${locationName}/media`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (resposta.status === 403 || resposta.status === 404) {
      throw new ApiV4IndisponivelError();
    }
    if (!resposta.ok) {
      throw new Error(
        `API v4 respondeu ${resposta.status}: ${await resposta.text()}`,
      );
    }

    const dados = (await resposta.json()) as RespostaMidia;

    for (const item of dados.mediaItems ?? []) {
      if (item.mediaFormat !== "PHOTO") continue;
      const imagem = item.googleUrl ?? item.thumbnailUrl;
      if (!imagem || !item.name) continue;

      const largura = item.dimensions?.widthPixels ?? null;
      const altura = item.dimensions?.heightPixels ?? null;
      if (largura !== null && largura < LARGURA_MINIMA) continue;
      if (
        largura !== null &&
        altura !== null &&
        altura > 0 &&
        largura / altura < PROPORCAO_MINIMA
      ) {
        continue;
      }

      fotos.push({
        nome: item.name,
        url: imagem,
        miniatura: item.thumbnailUrl ?? imagem,
        largura,
        altura,
        categoria: item.locationAssociation?.category ?? null,
        criadaEm: item.createTime ? new Date(item.createTime) : null,
      });
    }

    pageToken = dados.nextPageToken;
  } while (pageToken && fotos.length < limite);

  // Mais recentes primeiro: foto nova costuma ser a mais representativa do
  // estado atual do negócio.
  fotos.sort((a, b) => (b.criadaEm?.getTime() ?? 0) - (a.criadaEm?.getTime() ?? 0));

  return fotos.slice(0, limite);
}

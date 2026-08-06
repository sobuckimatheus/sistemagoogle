import "server-only";

import { AllowlistPendenteError } from "@/lib/google/locais";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

/**
 * Edição do Perfil de Empresa.
 *
 * O Google valida e às vezes coloca alterações em revisão manual — a resposta
 * pode ser 200 com o campo ainda pendente. Por isso a interface mostra o
 * retorno do Google em vez de assumir sucesso silencioso.
 */

export class EdicaoRecusadaError extends Error {
  constructor(readonly detalhe: string) {
    super(detalhe);
    this.name = "EdicaoRecusadaError";
  }
}

export type CamposEditaveis = {
  title?: string;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
};

/** Traduz nossos campos para o formato da API e monta o updateMask. */
function corpoEMascara(campos: CamposEditaveis) {
  const corpo: Record<string, unknown> = {};
  const mascara: string[] = [];

  if (campos.title !== undefined) {
    corpo.title = campos.title;
    mascara.push("title");
  }
  if (campos.phone !== undefined) {
    // A API espera um objeto; string vazia não limpa o campo, null limpa.
    corpo.phoneNumbers = campos.phone ? { primaryPhone: campos.phone } : {};
    mascara.push("phoneNumbers");
  }
  if (campos.website !== undefined) {
    corpo.websiteUri = campos.website ?? "";
    mascara.push("websiteUri");
  }
  if (campos.description !== undefined) {
    corpo.profile = { description: campos.description ?? "" };
    mascara.push("profile");
  }

  return { corpo, mascara: mascara.join(",") };
}

export async function atualizarPerfil(
  accessToken: string,
  locationName: string,
  campos: CamposEditaveis,
): Promise<void> {
  const { corpo, mascara } = corpoEMascara(campos);
  if (!mascara) return;

  const url = new URL(`${BASE}/${locationName}`);
  url.searchParams.set("updateMask", mascara);

  const resposta = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  if (resposta.status === 403 || resposta.status === 429) {
    throw new AllowlistPendenteError("Business Information API");
  }

  if (!resposta.ok) {
    const texto = await resposta.text();
    // 400 costuma trazer o motivo real: telefone fora do padrão do país,
    // descrição com termo proibido, nome que exige revisão.
    if (resposta.status === 400) {
      throw new EdicaoRecusadaError(extrairMensagem(texto));
    }
    throw new Error(`Business Information API respondeu ${resposta.status}: ${texto}`);
  }
}

function extrairMensagem(corpoBruto: string): string {
  try {
    const json = JSON.parse(corpoBruto) as {
      error?: { message?: string; details?: { errorDetails?: { message?: string }[] }[] };
    };
    const detalhe = json.error?.details?.[0]?.errorDetails?.[0]?.message;
    return detalhe ?? json.error?.message ?? corpoBruto;
  } catch {
    return corpoBruto;
  }
}

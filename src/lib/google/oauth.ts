import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env/server";

/**
 * OAuth do Google para as Business Profile APIs.
 *
 * O escopo `business.manage` é o único que dá acesso de escrita (responder
 * avaliação, editar perfil, publicar post) e leitura dos dados privados
 * (Performance, avaliações próprias). Não existe alternativa pública.
 */

const ESCOPO = "https://www.googleapis.com/auth/business.manage";
const AUTORIZACAO_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type CredenciaisGoogle = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Lê as credenciais, falhando com mensagem útil se a épica foi iniciada sem
 * elas configuradas.
 */
export function credenciaisGoogle(): CredenciaisGoogle {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
    serverEnv;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error(
      "Credenciais do Google ausentes. Defina GOOGLE_CLIENT_ID, " +
        "GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI.",
    );
  }

  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: GOOGLE_REDIRECT_URI,
  };
}

/**
 * `state` assinado com HMAC.
 *
 * Protege contra CSRF: sem assinatura, um terceiro poderia induzir o usuário
 * a completar um fluxo OAuth que vincula a conta Google do atacante.
 */
export function criarState(accountId: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${accountId}.${nonce}`;
  const assinatura = createHmac("sha256", serverEnv.ENCRYPTION_KEY)
    .update(payload)
    .digest("base64url");
  return `${payload}.${assinatura}`;
}

export function validarState(state: string): { accountId: string } | null {
  const partes = state.split(".");
  if (partes.length !== 3) return null;

  const [accountId, nonce, assinatura] = partes;
  const esperada = createHmac("sha256", serverEnv.ENCRYPTION_KEY)
    .update(`${accountId}.${nonce}`)
    .digest("base64url");

  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { accountId };
}

export function urlDeAutorizacao(state: string): string {
  const { clientId, redirectUri } = credenciaisGoogle();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPO,
    // offline + consent garantem refresh_token. Sem `prompt=consent`, o
    // Google só devolve refresh_token na primeiríssima autorização — e uma
    // reconexão depois viria sem ele, quebrando o sync silenciosamente.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${AUTORIZACAO_URL}?${params}`;
}

export type TokensGoogle = {
  accessToken: string;
  refreshToken: string | null;
  expiraEm: Date;
  escopos: string | null;
};

export async function trocarCodePorTokens(code: string): Promise<TokensGoogle> {
  const { clientId, clientSecret, redirectUri } = credenciaisGoogle();

  const resposta = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Falha ao trocar code por token (${resposta.status}): ${corpo}`);
  }

  const dados = (await resposta.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  return {
    accessToken: dados.access_token,
    refreshToken: dados.refresh_token ?? null,
    expiraEm: new Date(Date.now() + dados.expires_in * 1000),
    escopos: dados.scope ?? null,
  };
}

export async function renovarAccessToken(
  refreshToken: string,
): Promise<TokensGoogle> {
  const { clientId, clientSecret } = credenciaisGoogle();

  const resposta = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    // 400 com invalid_grant significa que o usuário revogou o acesso ou a
    // senha da conta Google mudou. Não adianta repetir: exige reconexão.
    const erro = new Error(
      `Falha ao renovar token (${resposta.status}): ${corpo}`,
    ) as Error & { revogado?: boolean };
    erro.revogado = resposta.status === 400 && corpo.includes("invalid_grant");
    throw erro;
  }

  const dados = (await resposta.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };

  return {
    accessToken: dados.access_token,
    // O refresh não devolve novo refresh_token — o antigo continua valendo.
    refreshToken: null,
    expiraEm: new Date(Date.now() + dados.expires_in * 1000),
    escopos: dados.scope ?? null,
  };
}

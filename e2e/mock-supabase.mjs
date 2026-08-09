import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

/**
 * Supabase Auth de mentira, para o E2E (E10-03).
 *
 * O onboarding só é testável ponta a ponta se houver um provedor de
 * identidade respondendo. Apontar o teste para o Supabase real seria pior de
 * três formas: exigiria segredo no CI, criaria usuários de verdade a cada
 * execução e deixaria a suíte à mercê de um serviço externo.
 *
 * Só os três endpoints que o fluxo usa estão implementados. Não há validação
 * de assinatura do token: o `access_token` é uma chave opaca de sessão, e quem
 * decide se ela vale é este processo — que é exatamente o papel que o Supabase
 * cumpre em produção.
 */

const PORTA = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);

/** token -> usuário */
const sessoes = new Map();
/** email -> usuário */
const usuarios = new Map();

function usuarioNovo(email, metadata = {}) {
  return {
    id: randomUUID(),
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: metadata,
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function sessao(user) {
  const access_token = randomUUID();
  sessoes.set(access_token, user);

  return {
    access_token,
    token_type: "bearer",
    // Longo de propósito: renovação no meio do teste só adicionaria uma
    // fonte de instabilidade sem cobrir nada do produto.
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: randomUUID(),
    user,
  };
}

function responder(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  });
  res.end(texto);
}

function lerCorpo(req) {
  return new Promise((resolve) => {
    let bruto = "";
    req.on("data", (pedaco) => (bruto += pedaco));
    req.on("end", () => {
      try {
        resolve(bruto ? JSON.parse(bruto) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORTA}`);
  const rota = url.pathname;

  if (req.method === "OPTIONS") return responder(res, 200, {});

  // Cadastro: devolve sessão direto, como um projeto com confirmação de
  // e-mail desligada. O caminho com confirmação é coberto por teste de
  // unidade, não vale a complexidade aqui.
  if (rota === "/auth/v1/signup" && req.method === "POST") {
    const { email, data } = await lerCorpo(req);
    const user = usuarioNovo(email, data ?? {});
    usuarios.set(email, user);
    return responder(res, 200, { ...sessao(user) });
  }

  if (rota === "/auth/v1/token" && req.method === "POST") {
    const { email } = await lerCorpo(req);
    const user = usuarios.get(email) ?? usuarioNovo(email);
    usuarios.set(email, user);
    return responder(res, 200, { ...sessao(user) });
  }

  if (rota === "/auth/v1/user") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const user = sessoes.get(token);
    if (!user) {
      return responder(res, 401, { message: "invalid token", code: 401 });
    }
    return responder(res, 200, user);
  }

  if (rota === "/auth/v1/logout") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    sessoes.delete(token);
    return responder(res, 204, {});
  }

  responder(res, 404, { message: `sem mock para ${req.method} ${rota}` });
});

servidor.listen(PORTA, () => {
  console.log(`[mock-supabase] ouvindo em http://127.0.0.1:${PORTA}`);
});

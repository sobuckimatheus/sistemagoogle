import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Auditoria de isolamento entre tenants (E10-04).
 *
 * O Prisma se conecta como dono do banco e **ignora a RLS do Supabase**: a
 * política de linha não protege nada neste caminho. Todo o isolamento depende
 * de cada `where` passar pelo `accountId` — o que significa que uma Server
 * Action nova, escrita sem lembrar disso, é um vazamento entre clientes.
 *
 * Este teste é estático de propósito. Um teste de integração provaria que as
 * ações de hoje isolam; este prova que as de amanhã também vão, porque falha
 * no momento em que alguém adiciona uma ação sem guarda — que é quando o erro
 * é barato de corrigir. Não substitui revisão: prova que a guarda foi chamada,
 * não que o argumento passado a ela é o certo.
 */

const RAIZ = join(process.cwd(), "src", "app");

/** Funções que resolvem ou conferem o tenant. */
const GUARDAS = [
  "exigirContaAtiva",
  "exigirNegocioDaConta",
  "papelNaConta",
  "exigirOwner",
];

/**
 * Arquivos que legitimamente não têm guarda de tenant, com o motivo.
 *
 * Toda entrada aqui é uma decisão consciente. A lista ser explícita é o que
 * impede alguém de "resolver" uma falha do teste ignorando o arquivo.
 */
const SEM_TENANT: Record<string, string> = {
  "actions/auth.ts": "logout: opera sobre a sessão, não sobre dados de conta",
  "actions/conta.ts": "troca de conta: confere o vínculo do usuário direto",
  "convite/[token]/acoes.ts":
    "aceite de convite: o token é a credencial e o e-mail é conferido contra a sessão",
  "verificador/acoes.ts":
    "página isca: pública por decisão de produto. Não lê nem escreve dado de " +
    "conta alguma sem sessão — quando há sessão, grava o histórico na conta " +
    "dela. O abuso é contido por limite de IP e teto global, não por tenant",
};

/**
 * Por que `contaAtivaOuNulo` **não** está entre as guardas: ela apenas lê a
 * sessão, sem exigir nada. Aceitá-la aqui deixaria passar uma ação que
 * consulta quem é o usuário e depois ignora a resposta — que é precisamente
 * o vazamento que este teste existe para pegar.
 */

/**
 * Todo arquivo de Server Action sob `src/app`.
 *
 * O critério é a diretiva `"use server"`, não o nome do arquivo: a convenção
 * do projeto é `acoes.ts`, mas `src/app/actions/` foge dela — e um teste de
 * segurança que confia em convenção de nome deixa de cobrir exatamente o
 * arquivo que alguém criou fora do padrão.
 */
async function arquivosDeAcao(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const encontrados: string[] = [];

  for (const entrada of entradas) {
    const caminho = join(dir, entrada.name);

    if (entrada.isDirectory()) {
      encontrados.push(...(await arquivosDeAcao(caminho)));
      continue;
    }

    if (!entrada.name.endsWith(".ts")) continue;
    if (entrada.name.endsWith(".test.ts")) continue;

    const conteudo = readFileSync(caminho, "utf8");
    if (/^\s*["']use server["']/.test(conteudo)) {
      encontrados.push(caminho);
    }
  }

  return encontrados;
}

const relativo = (caminho: string) =>
  caminho.slice(RAIZ.length + 1).replaceAll("\\", "/");

describe("isolamento entre tenants", () => {
  it("toda Server Action resolve o tenant por uma das guardas", async () => {
    const arquivos = await arquivosDeAcao(RAIZ);
    expect(arquivos.length).toBeGreaterThan(5);

    const desprotegidos = arquivos.filter((caminho) => {
      if (SEM_TENANT[relativo(caminho)]) return false;
      const conteudo = readFileSync(caminho, "utf8");
      return !GUARDAS.some((guarda) => conteudo.includes(guarda));
    });

    expect(desprotegidos.map(relativo)).toEqual([]);
  });

  it("nenhuma exceção da lista virou arquivo inexistente", async () => {
    const arquivos = (await arquivosDeAcao(RAIZ)).map(relativo);

    // Exceção que sobrevive ao arquivo que ela justificava vira permissão
    // silenciosa para o próximo arquivo com o mesmo nome.
    for (const caminho of Object.keys(SEM_TENANT)) {
      expect(arquivos).toContain(caminho);
    }
  });

  it("consultas por id de negócio passam pela conferência de conta", async () => {
    const arquivos = await arquivosDeAcao(RAIZ);

    const suspeitos: string[] = [];

    for (const caminho of arquivos) {
      const conteudo = readFileSync(caminho, "utf8");

      // `findUnique({ where: { id } })` em um model de negócio não filtra por
      // conta: só é aceitável quando seguido da conferência explícita.
      const usaBuscaDireta =
        /prisma\.(business|review|post|keyword|competitor|alert|checklistItem|report)\.findUnique/.test(
          conteudo,
        );

      if (usaBuscaDireta && !conteudo.includes("exigirNegocioDaConta")) {
        suspeitos.push(relativo(caminho));
      }
    }

    expect(suspeitos).toEqual([]);
  });
});

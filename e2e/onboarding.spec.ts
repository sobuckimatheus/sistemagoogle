import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

/**
 * Do cadastro ao primeiro painel (E10-03).
 *
 * Este é o caminho que precisa funcionar antes de qualquer outra coisa: se o
 * provisionamento falhar, o usuário novo vê uma tela quebrada no primeiro
 * segundo de uso e não volta.
 *
 * O que se prova aqui e nenhum teste menor prova: que sessão, middleware,
 * Server Components e as quatro linhas do provisionamento funcionam **juntos**,
 * em um navegador de verdade, contra um Postgres de verdade.
 */

const emailNovo = () => `e2e-${randomUUID().slice(0, 8)}@teste.local`;

test("cadastro cria a conta e leva ao painel", async ({ page }) => {
  const email = emailNovo();

  await page.goto("/cadastro");

  await page.getByLabel("Nome").fill("Fulano E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-de-teste-123");
  await page.getByRole("button", { name: /criar conta/i }).click();

  // A home é Server Component: chegar nela já significa que a sessão foi
  // aceita no servidor e que o provisionamento rodou sem estourar.
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Painel GBP" }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Conta nova entra no plano FREE em teste, e o cartão de conta mostra isso.
  await expect(page.getByText("Gratuito")).toBeVisible();

  // Sem negócio conectado, o próximo passo tem que estar explícito.
  await expect(
    page.getByRole("link", { name: /conectar google meu negócio/i }),
  ).toBeVisible();
});

test("a sessão sobrevive à navegação entre módulos", async ({ page }) => {
  const email = emailNovo();

  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill("Fulano Navegação");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-de-teste-123");
  await page.getByRole("button", { name: /criar conta/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  await page.getByRole("link", { name: "Conta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /configurações da conta/i }),
  ).toBeVisible();

  // O usuário que criou a conta é OWNER, e a tela precisa refletir isso.
  await expect(page.getByText(/você administra esta conta/i)).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("link", { name: /ver planos e faturas/i }).click();
  await expect(page.getByRole("heading", { name: "Plano" })).toBeVisible();
});

test("sair encerra a sessão e protege as rotas privadas", async ({ page }) => {
  const email = emailNovo();

  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill("Fulano Saída");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-de-teste-123");
  await page.getByRole("button", { name: /criar conta/i }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

  // E a rota privada deixa de abrir, preservando o destino para depois do
  // login — é o comportamento que o E1-03 exige.
  await page.goto("/conta");
  await expect(page).toHaveURL(/\/login\?proximo=%2Fconta/);
});

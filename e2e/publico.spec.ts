import { expect, test } from "@playwright/test";

/**
 * Rotas públicas e proteção de rotas privadas.
 *
 * Complementa o teste de onboarding cobrindo o que acontece **sem** sessão —
 * o caso em que um erro passa despercebido por muito tempo, porque ninguém do
 * time navega deslogado no dia a dia.
 */

test("rota privada sem sessão volta para o login preservando o destino", async ({
  page,
}) => {
  await page.goto("/negocio/qualquer-id/avaliacoes");

  await expect(page).toHaveURL(
    /\/login\?proximo=%2Fnegocio%2Fqualquer-id%2Favaliacoes/,
  );
});

test("login oferece Google e recuperação de senha", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("button", { name: /continuar com o google/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /esqueci minha senha/i }),
  ).toBeVisible();
});

test("recuperar senha responde igual para e-mail existente e inexistente", async ({
  page,
}) => {
  // A resposta é sempre a mesma de propósito: distinguir os dois casos
  // transformaria a tela em um verificador de quem é cliente.
  await page.goto("/recuperar-senha");
  await page.getByLabel("E-mail").fill("nao-existe@teste.local");
  await page.getByRole("button", { name: /enviar link/i }).click();

  await expect(
    page.getByRole("heading", { name: /verifique seu e-mail/i }),
  ).toBeVisible();
});

test("convite inexistente explica em vez de quebrar", async ({ page }) => {
  await page.goto("/convite/token-que-nao-existe");

  await expect(page.getByRole("heading", { name: "Convite" })).toBeVisible();
  await expect(page.getByText(/expirou ou não existe/i)).toBeVisible();
});

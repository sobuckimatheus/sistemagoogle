import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { serverEnv } from "@/lib/env/server";

/**
 * Criptografia dos tokens OAuth do Google antes de gravar no banco.
 *
 * AES-256-GCM: além de cifrar, autentica — adulterar o texto cifrado faz a
 * decifragem falhar em vez de devolver lixo silenciosamente.
 *
 * Formato do valor armazenado: `v1.<iv>.<tag>.<cifra>`, tudo em base64url. O
 * prefixo de versão existe para permitir rotacionar o algoritmo depois sem
 * precisar adivinhar o formato dos registros antigos.
 */

const VERSAO = "v1";
const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12; // recomendado para GCM

function chave(): Buffer {
  const bruta = Buffer.from(serverEnv.ENCRYPTION_KEY, "base64");
  if (bruta.length !== 32) {
    throw new Error("ENCRYPTION_KEY precisa ser 32 bytes em base64.");
  }
  return bruta;
}

export function criptografar(textoPuro: string): string {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chave(), iv);
  const cifra = Buffer.concat([
    cipher.update(textoPuro, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSAO,
    iv.toString("base64url"),
    tag.toString("base64url"),
    cifra.toString("base64url"),
  ].join(".");
}

export function descriptografar(valorArmazenado: string): string {
  const partes = valorArmazenado.split(".");
  if (partes.length !== 4) {
    throw new Error("Formato de valor criptografado inválido.");
  }

  const [versao, ivB64, tagB64, cifraB64] = partes;
  if (versao !== VERSAO) {
    throw new Error(`Versão de criptografia não suportada: ${versao}`);
  }

  const decipher = createDecipheriv(
    ALGORITMO,
    chave(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(cifraB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Comparação em tempo constante, para o segredo dos endpoints de cron.
 *
 * Comparar com `===` vaza informação pelo tempo de execução: quanto mais
 * caracteres iniciais batem, mais demora a falhar.
 */
export function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

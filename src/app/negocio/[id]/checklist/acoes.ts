"use server";

import { revalidatePath } from "next/cache";

import { exigirContaAtiva, exigirNegocioDaConta } from "@/lib/auth/conta";
import { prisma } from "@/lib/prisma";

/**
 * Marca um item do checklist.
 *
 * DONE e DISMISSED são preservados pelo sync: a auditoria regenera só os
 * itens OPEN, para não apagar a decisão do usuário a cada execução.
 */
export async function marcarItem(formData: FormData) {
  const { conta } = await exigirContaAtiva();
  const itemId = String(formData.get("itemId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (status !== "DONE" && status !== "DISMISSED" && status !== "OPEN") return;

  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { businessId: true },
  });
  if (!item) return;

  await exigirNegocioDaConta(item.businessId, conta.id);

  await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      status,
      resolvedAt: status === "OPEN" ? null : new Date(),
    },
  });

  revalidatePath(`/negocio/${item.businessId}/checklist`);
}

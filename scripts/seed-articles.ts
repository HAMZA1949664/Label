/**
 * Seed du catalogue d'articles (4623 références) depuis prisma/articles_seed.json
 * Exécution : bun run scripts/seed-articles.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const file = join(process.cwd(), "prisma", "articles_seed.json");
  const records: string[][] = JSON.parse(readFileSync(file, "utf-8"));

  console.log(`Chargement de ${records.length} références…`);

  // Vidage puis insertion (idempotent)
  await db.article.deleteMany();

  // Insertion par lots de 500
  let inserted = 0;
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500).map(([article, couleur, taille, manche, codeBarre]) => ({
      article,
      couleur,
      taille,
      manche,
      codeBarre,
    }));
    await db.article.createMany({ data: batch });
    inserted += batch.length;
  }

  const count = await db.article.count();
  console.log(`✅ ${inserted} lignes insérées — total en base : ${count}`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed :", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

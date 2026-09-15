import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const p = await db.product.findFirst({ where: { name: { contains: 'iphone 15 black' } } });
  if (!p) return console.log('Product not found');
  const sales = await db.saleItem.count({ where: { productId: p.id } });
  const purchases = await db.purchaseItem.count({ where: { productId: p.id } });
  const units = await db.phoneUnit.count({ where: { productId: p.id } });
  console.log(`Product: ${p.name} (ID: ${p.id})`);
  console.log(`Sales: ${sales}, Purchases: ${purchases}, Units: ${units}`);
}
main().catch(console.error).finally(() => db.$disconnect());

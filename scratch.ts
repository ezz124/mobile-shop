import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding categories and brands...');

  // التصنيفات
  const categories = [
    'هاتف',
    'شاحن',
    'سماعة',
    'كفر وحماية',
    'كابل',
    'باور بانك',
    'ساعة ذكية',
    'تابلت',
    'إكسسوار آخر',
  ];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`Category: ${name}`);
  }

  // الماركات
  const brands = [
    'Samsung',
    'Apple',
    'Xiaomi',
    'Oppo',
    'Vivo',
    'Realme',
    'Huawei',
    'Nokia',
    'Tecno',
    'Infinix',
    'itel',
    'OnePlus',
    'Honor',
    'Motorola',
    'Sony',
    'Anker',
    'Baseus',
    'Hoco',
    'WK Design',
    'Joyroom',
  ];

  for (const name of brands) {
    await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`Brand: ${name}`);
  }

  console.log('\nDone! All categories and brands added.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

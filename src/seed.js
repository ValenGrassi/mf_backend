import prisma from "./lib/prisma.js"

function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g"), "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const categoriesData = [
  {
    name: "Salsas y Condimentos",
    description:
      "Salsas importadas y condimentos para cocina oriental profesional.",
  },
  {
    name: "Fideos y Arroces",
    description:
      "Arroces premium para sushi y fideos para wok en presentaciones mayoristas.",
  },
  {
    name: "Pescados y Mariscos",
    description:
      "Pescados frescos y congelados seleccionados para uso gastronómico.",
  },
]

const productsData = [
  {
    code: "SC-001",
    name: "Salsa de Soja Fumeiga",
    description: "Bidón x 5 lts — master 4 bidones",
    price: 18500,
    unit: "Bidón x 5 lts",
    image: "/precio-salsa-soja.png",
    status: "publicado",
    category: "Salsas y Condimentos",
  },
  {
    code: "SC-005",
    name: "Siracha Toung Ot",
    description: "Frasco x 793 gr — master 12 frascos",
    price: 7600,
    unit: "Frasco x 793 gr",
    image: "/siracha.png",
    status: "publicado",
    category: "Salsas y Condimentos",
  },
  {
    code: "FA-001",
    name: "Arroz Fortuna 00000 Fumeiga",
    description: "Bolsa x 30 kg — master 1 bolsa",
    price: 52000,
    unit: "Bolsa x 30 KG",
    image: "/precio-arroz.png",
    status: "publicado",
    category: "Fideos y Arroces",
  },
  {
    code: "FA-003",
    name: "Fideos de Arroz Fino",
    description: "Paquete x 400 gr — master 30 paquetes",
    price: 4200,
    unit: "Paquete x 400 gr",
    image: "/fideos.jpg",
    status: "publicado",
    category: "Fideos y Arroces",
  },
  {
    code: "PM-001",
    name: "Salmón Entero Fresco Premium Salar",
    description: "Entero fresco — presentación 4–5 kg",
    price: 24500,
    unit: "x KG",
    image: "/precio-salmon.png",
    status: "publicado",
    category: "Pescados y Mariscos",
  },
  {
    code: "PM-003",
    name: "Kanikama Largo Santa Elena",
    description: "Paquete x 600 gr — master 10 paquetes",
    price: 8700,
    unit: "Paquete x 600 gr",
    image: "/kanikama.jpg",
    status: "oculto",
    category: "Pescados y Mariscos",
  },
]

async function seed() {
  const categoryIdByName = {}

  for (const data of categoriesData) {
    const slug = slugify(data.name)

    const category = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: {
        name: data.name,
        slug,
        description: data.description,
        status: "publicado",
      },
    })

    categoryIdByName[data.name] = category.id

    console.log(`Categoría lista: ${category.name}`)
  }

  for (const data of productsData) {
    const product = await prisma.product.upsert({
      where: { code: data.code },
      update: {},
      create: {
        code: data.code,
        name: data.name,
        description: data.description,
        price: data.price,
        unit: data.unit,
        image: data.image,
        status: data.status,
        categoryId: categoryIdByName[data.category],
      },
    })

    console.log(`Producto listo: ${product.name}`)
  }

  console.log("Seed completo.")
}

seed()
  .catch((error) => {
    console.error("Error en seed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

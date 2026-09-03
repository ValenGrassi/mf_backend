import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import multer from "multer"
import sharp from "sharp"
import crypto from "crypto"
import prisma from "./lib/prisma.js"
import supabase, { PRODUCTS_BUCKET } from "./lib/supabase.js"
import { buildPriceListPdf } from "./lib/priceListPdf.js"

dotenv.config()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const app = express()

const PORT = process.env.PORT || 5000

const FRONTEND_URL = (
  process.env.FRONTEND_URL 
  || "https://mf-logistica.netlify.app" 
  // || "http://localhost:3000"
).replace(/\/+$/, "")

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
)

app.use(express.json({ limit: "10mb" }))

// =========================================================
// HELPERS
// =========================================================

function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function formatProduct(product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description ?? "",
    price: Number(product.price),
    image: product.image ?? "",
    unit: product.unit,
    status: product.status,

    category: product.category
      ? product.category.name
      : "",

    categoryId: product.categoryId,

    categorySlug: product.category
      ? product.category.slug
      : "",

    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

function validateProductData(data) {
  const errors = {}

  if (
    !data.code ||
    typeof data.code !== "string" ||
    !data.code.trim()
  ) {
    errors.code = "El código del producto es obligatorio"
  }

  if (
    !data.name ||
    typeof data.name !== "string" ||
    !data.name.trim()
  ) {
    errors.name = "El nombre del producto es obligatorio"
  }

  if (
    !data.unit ||
    typeof data.unit !== "string" ||
    !data.unit.trim()
  ) {
    errors.unit = "La unidad es obligatoria"
  }

  if (
    data.price === undefined ||
    data.price === null ||
    data.price === "" ||
    Number.isNaN(Number(data.price)) ||
    Number(data.price) < 0
  ) {
    errors.price =
      "El precio debe ser un número mayor o igual a 0"
  }

  if (
    !data.categoryId ||
    typeof data.categoryId !== "string"
  ) {
    errors.categoryId = "La categoría es obligatoria"
  }

  return errors
}

async function categoryExists(categoryId) {
  const category = await prisma.category.findUnique({
    where: {
      id: categoryId,
    },
  })

  return !!category
}

function extractStoragePath(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null
  }

  const marker = `/storage/v1/object/public/${PRODUCTS_BUCKET}/`
  const index = imageUrl.indexOf(marker)

  if (index === -1) {
    return null
  }

  return imageUrl.slice(index + marker.length)
}

async function deleteProductImage(imageUrl) {
  const path = extractStoragePath(imageUrl)

  if (!path) return

  const { error } = await supabase.storage
    .from(PRODUCTS_BUCKET)
    .remove([path])

  if (error) {
    console.error(
      "Error eliminando imagen anterior de Supabase Storage:",
      error
    )
  }
}

// =========================================================
// AUTENTICACIÓN
// =========================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({
      message: "No autorizado",
    })
  }

  const parts = authHeader.split(" ")

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({
      message: "Token inválido",
    })
  }

  const token = parts[1]

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET no está configurado")

    return res.status(500).json({
      message: "Error interno del servidor",
    })
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    )

    req.user = decoded

    next()
  } catch (error) {
    return res.status(401).json({
      message: "Sesión inválida o expirada",
    })
  }
}

// =========================================================
// HEALTH
// =========================================================

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`

    res.json({
      ok: true,
      database: true,
      message: "API funcionando correctamente",
    })
  } catch (error) {
    console.error("Database health error:", error)

    res.status(500).json({
      ok: false,
      database: false,
      message:
        "API funcionando, pero no hay conexión con la base de datos",
    })
  }
})

// =========================================================
// LOGIN
// =========================================================

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        message: "Usuario y password son obligatorios",
      })
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET no está configurado")

      return res.status(500).json({
        message: "Error interno del servidor",
      })
    }

    const usuario = await prisma.user.findUnique({
      where: {
        username: username.trim(),
      },
    })

    if (!usuario) {
      return res.status(401).json({
        message: "Credenciales inválidas",
      })
    }

    const validPassword = await bcrypt.compare(
      password,
      usuario.password
    )

    if (!validPassword) {
      return res.status(401).json({
        message: "Credenciales inválidas",
      })
    }

    const token = jwt.sign(
      {
        id: usuario.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    )

    return res.status(200).json({
      token,
    })
  } catch (error) {
    console.error("Error en /login:", error)

    return res.status(500).json({
      message: "Error interno del servidor",
    })
  }
})

// =========================================================
// UPLOAD DE IMÁGENES (SUPABASE STORAGE)
// PROTEGIDO
// =========================================================

app.post(
  "/api/upload",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "No se envió ninguna imagen",
        })
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          error: "El archivo debe ser una imagen",
        })
      }

      // Optimización: se redimensiona (sin agrandar imágenes
      // chicas) a un máximo razonable para web y se convierte a
      // WebP, que pesa bastante menos que JPG/PNG con calidad
      // visual equivalente.
      const optimizedBuffer = await sharp(req.file.buffer)
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer()

      const fileName = `${Date.now()}-${crypto.randomUUID()}.webp`

      const { error: uploadError } =
        await supabase.storage
          .from(PRODUCTS_BUCKET)
          .upload(fileName, optimizedBuffer, {
            contentType: "image/webp",
            upsert: false,
          })

      if (uploadError) {
        console.error(
          "Error subiendo a Supabase Storage:",
          uploadError
        )

        return res.status(500).json({
          error: "No se pudo subir la imagen",
        })
      }

      const { data } = supabase.storage
        .from(PRODUCTS_BUCKET)
        .getPublicUrl(fileName)

      res.status(201).json({
        url: data.publicUrl,
      })
    } catch (error) {
      console.error("POST /api/upload:", error)

      res.status(500).json({
        error: "No se pudo subir la imagen",
      })
    }
  }
)

// =========================================================
// PERFILES PÚBLICOS (LISTA DE PRECIOS PERSONALIZADA)
// PÚBLICO
// =========================================================

app.get("/api/public/admins", async (req, res) => {
  try {
    const usuarios = await prisma.user.findMany({
      select: {
        username: true,
      },

      orderBy: {
        username: "asc",
      },
    })

    res.json(usuarios)
  } catch (error) {
    console.error(
      "GET /api/public/admins:",
      error
    )

    res.status(500).json({
      error: "No se pudieron obtener los usuarios",
    })
  }
})

app.get(
  "/api/public/admins/:username",
  async (req, res) => {
    try {
      const usuario = await prisma.user.findUnique({
        where: {
          username: req.params.username,
        },

        select: {
          username: true,
          phone: true,
        },
      })

      if (!usuario) {
        return res.status(404).json({
          error: "Usuario no encontrado",
        })
      }

      res.json(usuario)
    } catch (error) {
      console.error(
        "GET /api/public/admins/:username:",
        error
      )

      res.status(500).json({
        error: "No se pudo obtener el usuario",
      })
    }
  }
)

// =========================================================
// PERFIL DEL USUARIO
// PROTEGIDO
// =========================================================

app.get(
  "/api/me",
  authenticateToken,
  async (req, res) => {
    try {
      const usuario = await prisma.user.findUnique({
        where: {
          id: req.user.id,
        },

        select: {
          id: true,
          username: true,
          phone: true,
        },
      })

      if (!usuario) {
        return res.status(404).json({
          error: "Usuario no encontrado",
        })
      }

      res.json(usuario)
    } catch (error) {
      console.error("GET /api/me:", error)

      res.status(500).json({
        error: "No se pudo obtener el usuario",
      })
    }
  }
)

app.put(
  "/api/me",
  authenticateToken,
  async (req, res) => {
    try {
      const { phone } = req.body

      if (
        phone !== null &&
        typeof phone !== "string"
      ) {
        return res.status(400).json({
          error: "El teléfono no es válido",
        })
      }

      const cleanPhone =
        typeof phone === "string" && phone.trim()
          ? phone.trim()
          : null

      const usuario = await prisma.user.update({
        where: {
          id: req.user.id,
        },

        data: {
          phone: cleanPhone,
        },

        select: {
          id: true,
          username: true,
          phone: true,
        },
      })

      res.json(usuario)
    } catch (error) {
      console.error("PUT /api/me:", error)

      res.status(500).json({
        error: "No se pudo actualizar el usuario",
      })
    }
  }
)

// =========================================================
// LISTA DE PRECIOS - PDF
// PÚBLICO
// =========================================================

app.get(
  "/api/price-list/pdf",
  async (req, res) => {
    try {
      const categories =
        await prisma.category.findMany({
          where: {
            status: "publicado",
          },

          include: {
            products: {
              where: {
                status: "publicado",
              },
              orderBy: {
                name: "asc",
              },
            },
          },

          orderBy: {
            name: "asc",
          },
        })

      const adminUsername =
        typeof req.query.admin === "string"
          ? req.query.admin
          : null

      const owner = adminUsername
        ? await prisma.user.findUnique({
            where: {
              username: adminUsername,
            },
          })
        : await prisma.user.findFirst({
            orderBy: {
              id: "asc",
            },
          })

      res.setHeader(
        "Content-Type",
        "application/pdf"
      )

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="lista-de-precios-mf-logistica.pdf"'
      )

      const doc = buildPriceListPdf({
        categories,
        phone: owner?.phone ?? null,
      })

      doc.pipe(res)
    } catch (error) {
      console.error(
        "GET /api/price-list/pdf:",
        error
      )

      if (!res.headersSent) {
        res.status(500).json({
          error: "No se pudo generar el PDF",
        })
      }
    }
  }
)

// =========================================================
// PRODUCTS - GET PÚBLICOS
// =========================================================

app.get("/api/products", async (req, res) => {
  try {
    const showAll = req.query.all === "true"

    const products = await prisma.product.findMany({
      where: showAll
        ? {}
        : {
            status: "publicado",
          },

      include: {
        category: true,
      },

      orderBy: [
        {
          name: "asc",
        },
      ],
    })

    res.json(products.map(formatProduct))
  } catch (error) {
    console.error("GET /api/products:", error)

    res.status(500).json({
      error: "No se pudieron obtener los productos",
    })
  }
})

app.get("/api/products/:id", async (req, res) => {
  try {
    const id = req.params.id

    const product = await prisma.product.findUnique({
      where: {
        id,
      },
      include: {
        category: true,
      },
    })

    if (!product) {
      return res.status(404).json({
        error: "Producto no encontrado",
      })
    }

    res.json(formatProduct(product))
  } catch (error) {
    console.error("GET /api/products/:id:", error)

    res.status(500).json({
      error: "No se pudo obtener el producto",
    })
  }
})

// =========================================================
// PRODUCTS - CREAR
// PROTEGIDO
// =========================================================

app.post(
  "/api/products",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        code,
        name,
        description,
        price,
        categoryId,
        unit,
        image,
        status,
      } = req.body

      const errors = validateProductData({
        code,
        name,
        price,
        categoryId,
        unit,
      })

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          error: "Datos inválidos",
          fields: errors,
        })
      }

      const exists = await categoryExists(categoryId)

      if (!exists) {
        return res.status(400).json({
          error: "La categoría seleccionada no existe",
        })
      }

      const product = await prisma.product.create({
        data: {
          code: code.trim(),

          name: name.trim(),
          description:
            typeof description === "string" &&
            description.trim()
              ? description.trim()
              : null,

          price: Number(price),

          unit: unit.trim(),

          image:
            typeof image === "string" &&
            image.trim()
              ? image.trim()
              : null,

          status:
            status === "oculto"
              ? "oculto"
              : "publicado",

          categoryId,
        },

        include: {
          category: true,
        },
      })

      res.status(201).json(formatProduct(product))
    } catch (error) {
      console.error("POST /api/products:", error)

      if (error.code === "P2002") {
        return res.status(409).json({
          error: "Ya existe un producto con ese código",
        })
      }

      res.status(500).json({
        error: "No se pudo crear el producto",
      })
    }
  }
)

// =========================================================
// PRODUCTS - EDITAR
// PROTEGIDO
// =========================================================

app.put(
  "/api/products/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = req.params.id

      const existingProduct =
        await prisma.product.findUnique({
          where: { id },
        })

      if (!existingProduct) {
        return res.status(404).json({
          error: "Producto no encontrado",
        })
      }

      const {
        code,
        name,
        description,
        price,
        categoryId,
        unit,
        image,
        status,
      } = req.body

      const errors = validateProductData({
        code,
        name,
        price,
        categoryId,
        unit,
      })

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          error: "Datos inválidos",
          fields: errors,
        })
      }

      const exists = await categoryExists(categoryId)

      if (!exists) {
        return res.status(400).json({
          error: "La categoría seleccionada no existe",
        })
      }

      const product = await prisma.product.update({
        where: { id },

        data: {
          code: code.trim(),

          name: name.trim(),

          description:
            typeof description === "string" &&
            description.trim()
              ? description.trim()
              : null,

          price: Number(price),

          unit: unit.trim(),

          image:
            typeof image === "string" &&
            image.trim()
              ? image.trim()
              : null,

          status:
            status === "oculto"
              ? "oculto"
              : "publicado",

          categoryId,
        },

        include: {
          category: true,
        },
      })

      if (
        existingProduct.image &&
        existingProduct.image !== product.image
      ) {
        await deleteProductImage(existingProduct.image)
      }

      res.json(formatProduct(product))
    } catch (error) {
      console.error("PUT /api/products/:id:", error)

      if (error.code === "P2002") {
        return res.status(409).json({
          error: "Ya existe un producto con ese código",
        })
      }

      res.status(500).json({
        error: "No se pudo actualizar el producto",
      })
    }
  }
)

// =========================================================
// PRODUCTS - ACTUALIZACIÓN PARCIAL
// PROTEGIDO
// =========================================================

app.patch(
  "/api/products/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = req.params.id

      const existingProduct =
        await prisma.product.findUnique({
          where: { id },
        })

      if (!existingProduct) {
        return res.status(404).json({
          error: "Producto no encontrado",
        })
      }

      const {
        code,
        name,
        description,
        price,
        categoryId,
        unit,
        image,
        status,
      } = req.body

      const data = {}

      if (code !== undefined) {
        if (
          typeof code !== "string" ||
          !code.trim()
        ) {
          return res.status(400).json({
            error: "El código no puede estar vacío",
          })
        }

        data.code = code.trim()
      }

      if (name !== undefined) {
        if (
          typeof name !== "string" ||
          !name.trim()
        ) {
          return res.status(400).json({
            error: "El nombre no puede estar vacío",
          })
        }

        data.name = name.trim()
      }

      if (description !== undefined) {
        data.description =
          typeof description === "string" &&
          description.trim()
            ? description.trim()
            : null
      }

      if (price !== undefined) {
        if (
          price === "" ||
          Number.isNaN(Number(price)) ||
          Number(price) < 0
        ) {
          return res.status(400).json({
            error: "Precio inválido",
          })
        }

        data.price = Number(price)
      }

      if (unit !== undefined) {
        if (
          typeof unit !== "string" ||
          !unit.trim()
        ) {
          return res.status(400).json({
            error: "La unidad no puede estar vacía",
          })
        }

        data.unit = unit.trim()
      }

      if (image !== undefined) {
        data.image =
          typeof image === "string" &&
          image.trim()
            ? image.trim()
            : null
      }

      if (status !== undefined) {
        if (
          status !== "publicado" &&
          status !== "oculto"
        ) {
          return res.status(400).json({
            error:
              "status debe ser 'publicado' u 'oculto'",
          })
        }

        data.status = status
      }

      if (categoryId !== undefined) {
        if (typeof categoryId !== "string") {
          return res.status(400).json({
            error: "Categoría inválida",
          })
        }

        const exists =
          await categoryExists(categoryId)

        if (!exists) {
          return res.status(400).json({
            error: "La categoría no existe",
          })
        }

        data.categoryId = categoryId
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({
          error:
            "No se enviaron datos para actualizar",
        })
      }

      const product =
        await prisma.product.update({
          where: { id },

          data,

          include: {
            category: true,
          },
        })

      if (
        data.image !== undefined &&
        existingProduct.image &&
        existingProduct.image !== product.image
      ) {
        await deleteProductImage(existingProduct.image)
      }

      res.json(formatProduct(product))
    } catch (error) {
      console.error(
        "PATCH /api/products/:id:",
        error
      )

      if (error.code === "P2002") {
        return res.status(409).json({
          error: "Ya existe un producto con ese código",
        })
      }

      res.status(500).json({
        error:
          "No se pudo actualizar el producto",
      })
    }
  }
)

// =========================================================
// PRODUCTS - STATUS
// PROTEGIDO
// =========================================================

app.patch(
  "/api/products/:id/status",
  authenticateToken,
  async (req, res) => {
    try {
      const id = req.params.id

      if (
        req.body.status !== "publicado" &&
        req.body.status !== "oculto"
      ) {
        return res.status(400).json({
          error:
            "status debe ser 'publicado' u 'oculto'",
        })
      }

      const product =
        await prisma.product.update({
          where: { id },

          data: {
            status: req.body.status,
          },

          include: {
            category: true,
          },
        })

      res.json(formatProduct(product))
    } catch (error) {
      console.error(
        "PATCH /api/products/:id/status:",
        error
      )

      if (error.code === "P2025") {
        return res.status(404).json({
          error:
            "Producto no encontrado",
        })
      }

      res.status(500).json({
        error:
          "No se pudo cambiar el estado del producto",
      })
    }
  }
)

// =========================================================
// PRODUCTS - DELETE
// PROTEGIDO
// =========================================================

app.delete(
  "/api/products/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = req.params.id

      const existingProduct =
        await prisma.product.findUnique({
          where: { id },
        })

      if (!existingProduct) {
        return res.status(404).json({
          error: "Producto no encontrado",
        })
      }

      await prisma.product.delete({
        where: { id },
      })

      if (existingProduct.image) {
        await deleteProductImage(existingProduct.image)
      }

      res.json({
        success: true,
        message:
          "Producto eliminado correctamente",
        id,
      })
    } catch (error) {
      console.error(
        "DELETE /api/products/:id:",
        error
      )

      res.status(500).json({
        error:
          "No se pudo eliminar el producto",
      })
    }
  }
)

// =========================================================
// CATEGORIES
// GET PÚBLICO
// =========================================================

app.get("/api/categories", async (req, res) => {
  try {
    const categories =
      await prisma.category.findMany({
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },

        orderBy: {
          name: "asc",
        },
      })

    res.json(
      categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description ?? "",
        status: category.status,
        productCount:
          category._count.products,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      }))
    )
  } catch (error) {
    console.error(
      "GET /api/categories:",
      error
    )

    res.status(500).json({
      error:
        "No se pudieron obtener las categorías",
    })
  }
})

// =========================================================
// CATEGORIES - CREAR
// PROTEGIDO
// =========================================================

app.post(
  "/api/categories",
  authenticateToken,
  async (req, res) => {
    try {
      const { name, description, status } = req.body

      if (
        !name ||
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          error:
            "El nombre de la categoría es obligatorio",
        })
      }

      const cleanName = name.trim()

      const existingCategory =
        await prisma.category.findFirst({
          where: {
            name: {
              equals: cleanName,
              mode: "insensitive",
            },
          },
        })

      if (existingCategory) {
        return res.status(409).json({
          error:
            "Ya existe una categoría con ese nombre",
        })
      }

      const category =
        await prisma.category.create({
          data: {
            name: cleanName,
            slug: slugify(cleanName),

            description:
              typeof description === "string" &&
              description.trim()
                ? description.trim()
                : null,

            status:
              status === "oculto"
                ? "oculto"
                : "publicado",
          },
        })

      res.status(201).json({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description ?? "",
        status: category.status,
        productCount: 0,
      })
    } catch (error) {
      console.error(
        "POST /api/categories:",
        error
      )

      if (error.code === "P2002") {
        return res.status(409).json({
          error:
            "Ya existe una categoría con ese nombre",
        })
      }

      res.status(500).json({
        error:
          "No se pudo crear la categoría",
      })
    }
  }
)

// =========================================================
// CATEGORIES - EDITAR
// PROTEGIDO
// =========================================================

app.put(
  "/api/categories/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = req.params.id

      const { name, description, status } = req.body

      if (
        !name ||
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          error:
            "El nombre de la categoría es obligatorio",
        })
      }

      const existingCategory =
        await prisma.category.findUnique({
          where: { id },
        })

      if (!existingCategory) {
        return res.status(404).json({
          error:
            "Categoría no encontrada",
        })
      }

      const duplicate =
        await prisma.category.findFirst({
          where: {
            name: {
              equals: name.trim(),
              mode: "insensitive",
            },

            NOT: {
              id,
            },
          },
        })

      if (duplicate) {
        return res.status(409).json({
          error:
            "Ya existe otra categoría con ese nombre",
        })
      }

      const category =
        await prisma.category.update({
          where: { id },

          data: {
            name: name.trim(),
            slug: slugify(name.trim()),

            description:
              typeof description === "string" &&
              description.trim()
                ? description.trim()
                : null,

            status:
              status === "oculto"
                ? "oculto"
                : "publicado",
          },

          include: {
            _count: {
              select: {
                products: true,
              },
            },
          },
        })

      res.json({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description ?? "",
        status: category.status,
        productCount:
          category._count.products,
      })
    } catch (error) {
      console.error(
        "PUT /api/categories/:id:",
        error
      )

      if (error.code === "P2002") {
        return res.status(409).json({
          error:
            "Ya existe otra categoría con ese nombre",
        })
      }

      res.status(500).json({
        error:
          "No se pudo actualizar la categoría",
      })
    }
  }
)

// =========================================================
// CATEGORIES - DELETE
// PROTEGIDO
// =========================================================

app.delete(
  "/api/categories/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = req.params.id

      const category =
        await prisma.category.findUnique({
          where: { id },

          include: {
            _count: {
              select: {
                products: true,
              },
            },
          },
        })

      if (!category) {
        return res.status(404).json({
          error:
            "Categoría no encontrada",
        })
      }

      if (category._count.products > 0) {
        return res.status(409).json({
          error:
            "No se puede eliminar una categoría que contiene productos",
          productCount:
            category._count.products,
        })
      }

      await prisma.category.delete({
        where: { id },
      })

      res.json({
        success: true,
        message:
          "Categoría eliminada correctamente",
        id,
      })
    } catch (error) {
      console.error(
        "DELETE /api/categories/:id:",
        error
      )

      res.status(500).json({
        error:
          "No se pudo eliminar la categoría",
      })
    }
  }
)

// =========================================================
// 404
// =========================================================

app.use((req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.originalUrl,
  })
})

// =========================================================
// ERROR HANDLER
// =========================================================

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "La imagen no puede superar los 5 MB",
      })
    }

    return res.status(400).json({
      error: "No se pudo procesar el archivo",
    })
  }

  console.error("Unhandled error:", error)

  res.status(500).json({
    error: "Error interno del servidor",
  })
})

// =========================================================
// SERVER
// =========================================================

const server = app.listen(PORT, () => {
  console.log(
    `🚀 API funcionando en http://localhost:${PORT}`
  )
})

// =========================================================
// SHUTDOWN
// =========================================================

async function shutdown() {
  console.log("Cerrando servidor...")

  await prisma.$disconnect()

  server.close(() => {
    console.log("Servidor cerrado")
    process.exit(0)
  })
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
import express from "express"
import prisma from "../lib/prisma.js"

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        published: true,
      },
      include: {
        category: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json(products);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Error al obtener los productos",
    });
  }
});

export default router;
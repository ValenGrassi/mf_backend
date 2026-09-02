import jwt from "jsonwebtoken"

export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      return res.status(401).json({
        error: "No autorizado",
      })
    }

    const [scheme, token] = authHeader.split(" ")

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        error: "Token inválido",
      })
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET no está configurado")

      return res.status(500).json({
        error: "Error interno del servidor",
      })
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    )

    req.user = decoded

    next()
  } catch (error) {
    console.error("Error de autenticación:", error)

    return res.status(401).json({
      error: "Token inválido o expirado",
    })
  }
}
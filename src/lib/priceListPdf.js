import PDFDocument from "pdfkit"
import path from "path"
import { fileURLToPath } from "url"
import {
  drawWhatsappIcon,
  drawCalendarIcon,
  drawClockIcon,
  drawWarningIcon,
} from "./pdfIcons.js"

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
)

const LOGO_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "logo.png"
)

const COVER_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "fondo.jpg"
)

const ACCENT = "#972527"
const INK = "#1f1f1f"
const MUTED = "#7a7a7a"
const BORDER = "#e5e0dc"

const MARGIN = 50

function formatPrice(price) {
  return `$ ${Number(price).toLocaleString("es-AR")}`
}

function formatDate(date) {
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

// Dibuja 3 ítems ícono+texto con el del medio centrado EXACTO en el
// centro de la página, y los otros dos a los costados, con
// separadores verticales. Cada ítem puede tener varias líneas.
// Devuelve la "y" al final de la fila.
function drawCenteredInfoRow(
  doc,
  y,
  pageWidth,
  { left, middle, right }
) {
  const iconGap = 6
  const dividerPad = 14

  function measure(it) {
    doc.font(it.font).fontSize(it.fontSize)
    const lineHeight = doc.currentLineHeight()
    const textWidth = Math.max(
      ...it.lines.map((l) => doc.widthOfString(l))
    )
    return {
      ...it,
      lineHeight,
      textWidth,
      blockHeight: it.lines.length * lineHeight,
      width: it.iconSize + iconGap + textWidth,
    }
  }

  const L = measure(left)
  const M = measure(middle)
  const R = measure(right)

  const rowHeight = Math.max(
    L.blockHeight,
    M.blockHeight,
    R.blockHeight,
    L.iconSize,
    M.iconSize,
    R.iconSize
  )

  function drawItem(it, xStart) {
    const iconY = y + (rowHeight - it.iconSize) / 2
    it.drawIcon(doc, xStart, iconY, it.iconSize, it.iconColor)

    doc
      .font(it.font)
      .fontSize(it.fontSize)
      .fillColor(it.textColor)

    const textX = xStart + it.iconSize + iconGap
    const textStartY =
      y + (rowHeight - it.blockHeight) / 2

    it.lines.forEach((line, i) => {
      doc.text(line, textX, textStartY + i * it.lineHeight, {
        lineBreak: false,
      })
    })
  }

  function drawDivider(x) {
    doc
      .strokeColor(BORDER)
      .lineWidth(1)
      .moveTo(x, y + (rowHeight - 15) / 2)
      .lineTo(x, y + (rowHeight + 15) / 2)
      .stroke()
  }

  const mStartX = pageWidth / 2 - M.width / 2
  drawItem(M, mStartX)

  const leftDividerX = mStartX - dividerPad
  drawDivider(leftDividerX)
  drawItem(L, leftDividerX - dividerPad - L.width)

  const rightDividerX = mStartX + M.width + dividerPad
  drawDivider(rightDividerX)
  drawItem(R, rightDividerX + dividerPad)

  return y + rowHeight
}

// Dibuja varios ícono+texto en una sola línea horizontal, centrados
// como bloque, con separadores verticales entre ellos.
// Devuelve la "y" al final de la fila.
function drawInlineInfoRow(doc, y, pageWidth, items) {
  const iconGap = 6
  const dividerPad = 13

  const measured = items.map((it) => {
    doc.font(it.font).fontSize(it.fontSize)
    const textWidth = doc.widthOfString(it.text)
    return {
      ...it,
      textWidth,
      blockWidth: it.iconSize + iconGap + textWidth,
    }
  })

  let maxLineHeight = 0
  measured.forEach((m) => {
    doc.font(m.font).fontSize(m.fontSize)
    maxLineHeight = Math.max(
      maxLineHeight,
      doc.currentLineHeight()
    )
  })

  const totalWidth =
    measured.reduce((sum, m) => sum + m.blockWidth, 0) +
    (measured.length - 1) * (dividerPad * 2 + 1)

  let x = (pageWidth - totalWidth) / 2

  measured.forEach((m, index) => {
    doc.font(m.font).fontSize(m.fontSize)
    const lineHeight = doc.currentLineHeight()
    const textY = y + (maxLineHeight - lineHeight) / 2
    const iconY = y + (maxLineHeight - m.iconSize) / 2

    m.drawIcon(doc, x, iconY, m.iconSize, m.iconColor)

    doc
      .font(m.font)
      .fontSize(m.fontSize)
      .fillColor(m.textColor)
      .text(m.text, x + m.iconSize + iconGap, textY, {
        lineBreak: false,
      })

    x += m.blockWidth

    if (index < measured.length - 1) {
      x += dividerPad
      doc
        .strokeColor(BORDER)
        .lineWidth(1)
        .moveTo(x, y + (maxLineHeight - 13) / 2)
        .lineTo(x, y + (maxLineHeight + 13) / 2)
        .stroke()
      x += dividerPad + 1
    }
  })

  return y + maxLineHeight
}

function drawHeader(doc, { phone }) {
  const pageWidth = doc.page.width

  const imgHeight = 228

  doc.image(COVER_PATH, 0, 0, {
    width: pageWidth,
    height: imgHeight,
  })

  const logoSize = 112
  const logoX = pageWidth / 2 - logoSize / 2
  const logoY = imgHeight - logoSize / 2

  // El archivo del logo tiene el fondo blanco "quemado" en el
  // propio PNG (no es transparente): se recorta a un círculo para
  // que solo se dibuje el isologo redondo.
  doc.save()
  doc
    .circle(
      logoX + logoSize / 2,
      logoY + logoSize / 2,
      (logoSize / 2) * 0.97
    )
    .clip()
  doc.image(LOGO_PATH, logoX, logoY, {
    width: logoSize,
    height: logoSize,
  })
  doc.restore()

  let y = imgHeight + logoSize / 2 + 16

  doc
    .font("Times-Bold")
    .fontSize(28)
    .fillColor(ACCENT)
    .text("LISTA DE PRECIOS", 0, y, {
      align: "center",
      width: pageWidth,
    })

  y += 38

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(INK)
    .text(
      "MF Logística — Distribución para gastronomía oriental",
      0,
      y,
      { align: "center", width: pageWidth }
    )

  y += 26

  doc
    .strokeColor(ACCENT)
    .lineWidth(2)
    .moveTo(pageWidth / 2 - 40, y)
    .lineTo(pageWidth / 2 + 40, y)
    .stroke()

  y += 22

  // Fila 1: teléfono | pedidos (centrado exacto) | precios vigentes
  y = drawCenteredInfoRow(doc, y, pageWidth, {
    left: {
      drawIcon: drawWhatsappIcon,
      iconColor: ACCENT,
      iconSize: 15,
      lines: [phone || "Contactanos"],
      font: "Helvetica-Bold",
      fontSize: 10.5,
      textColor: INK,
    },
    middle: {
      drawIcon: drawCalendarIcon,
      iconColor: ACCENT,
      iconSize: 14,
      lines: ["Pedidos hasta las 22 hs"],
      font: "Helvetica",
      fontSize: 9.5,
      textColor: MUTED,
    },
    right: {
      drawIcon: drawWarningIcon,
      iconColor: ACCENT,
      iconSize: 14,
      lines: ["Precios vigentes", "hasta las 21:59 hs"],
      font: "Helvetica-Bold",
      fontSize: 9.5,
      textColor: ACCENT,
    },
  })

  y += 8

  // Fila 2: fecha de generación
  y = drawInlineInfoRow(doc, y, pageWidth, [
    {
      drawIcon: drawClockIcon,
      iconColor: ACCENT,
      iconSize: 13,
      text: `Generado el ${formatDate(new Date())}`,
      font: "Helvetica",
      fontSize: 9,
      textColor: MUTED,
    },
  ])

  doc.x = MARGIN
  doc.y = y + 22
}

function truncateToLines(
  doc,
  text,
  { font, fontSize, width, maxLines }
) {
  doc.font(font).fontSize(fontSize)

  const maxHeight =
    doc.currentLineHeight() * maxLines + 1

  if (doc.heightOfString(text, { width }) <= maxHeight) {
    return text
  }

  const words = text.split(" ")

  while (words.length > 0) {
    words.pop()

    const candidate = `${words.join(" ")}…`

    if (
      doc.heightOfString(candidate, { width }) <=
      maxHeight
    ) {
      return candidate
    }
  }

  return "…"
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - MARGIN

  if (doc.y + needed > bottom) {
    doc.addPage({ margin: MARGIN })
    return true
  }

  return false
}

function drawCategoryHeader(doc, name) {
  ensureSpace(doc, 46)

  const contentWidth = doc.page.width - MARGIN * 2
  const label = name.toUpperCase()

  const fontSize = 12
  doc.font("Times-Bold").fontSize(fontSize)
  const textWidth = doc.widthOfString(label)

  const padX = 15
  const bannerHeight = 22
  const tailLength = 13
  const bannerWidth = textWidth + padX * 2
  const bx = MARGIN
  const by = doc.y
  const r = 3

  // Banner rojo con forma de cinta (borde izquierdo redondeado,
  // punta a la derecha) para acercarse al "molde".
  doc
    .moveTo(bx + r, by)
    .lineTo(bx + bannerWidth, by)
    .lineTo(bx + bannerWidth + tailLength, by + bannerHeight / 2)
    .lineTo(bx + bannerWidth, by + bannerHeight)
    .lineTo(bx + r, by + bannerHeight)
    .quadraticCurveTo(bx, by + bannerHeight, bx, by + bannerHeight - r)
    .lineTo(bx, by + r)
    .quadraticCurveTo(bx, by, bx + r, by)
    .fill(ACCENT)

  doc
    .font("Times-Bold")
    .fontSize(fontSize)
    .fillColor("#f7f2e9")
    .text(
      label,
      bx + padX,
      by + (bannerHeight - doc.currentLineHeight()) / 2 + 1,
      { lineBreak: false }
    )

  doc.y = by + bannerHeight + 6

  doc
    .strokeColor(BORDER)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth, doc.y)
    .stroke()

  doc.y += 8
}

function drawProductRow(doc, product) {
  const contentWidth =
    doc.page.width - MARGIN * 2

  const priceText = formatPrice(product.price)
  const priceWidth = 90
  const priceX = MARGIN + contentWidth - priceWidth

  const nameWidth = contentWidth - priceWidth - 10

  const codeText = product.code
    ? `(${product.code})  `
    : ""

  const codeWidth = codeText
    ? doc
        .font("Helvetica")
        .fontSize(9)
        .widthOfString(codeText)
    : 0

  const nameHeight = doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .heightOfString(product.name, {
      width: nameWidth - codeWidth,
    })

  const unitText = product.unit || ""

  const unitHeight = unitText
    ? doc
        .font("Helvetica")
        .fontSize(8.5)
        .heightOfString(unitText, {
          width: nameWidth,
        })
    : 0

  const descriptionWidth = nameWidth - codeWidth

  const descriptionText = product.description
    ? truncateToLines(doc, product.description, {
        font: "Helvetica-Oblique",
        fontSize: 8.5,
        width: descriptionWidth,
        maxLines: 3,
      })
    : ""

  const descriptionHeight = descriptionText
    ? doc
        .font("Helvetica-Oblique")
        .fontSize(8.5)
        .heightOfString(descriptionText, {
          width: descriptionWidth,
        })
    : 0

  const rowHeight =
    Math.max(nameHeight, 11) +
    (unitText ? unitHeight + 2 : 0) +
    (descriptionText ? descriptionHeight + 2 : 0) +
    12

  ensureSpace(doc, rowHeight)

  const y = doc.y

  if (codeText) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(codeText, MARGIN, y, {
        width: codeWidth,
        lineBreak: false,
      })
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(INK)
    .text(product.name, MARGIN + codeWidth, y, {
      width: nameWidth - codeWidth,
    })

  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(INK)
    .text(priceText, priceX, y, {
      width: priceWidth,
      align: "right",
      lineBreak: false,
    })

  if (unitText) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        unitText,
        MARGIN + codeWidth,
        y + nameHeight + 2,
        { width: nameWidth - codeWidth }
      )
  }

  if (descriptionText) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        descriptionText,
        MARGIN + codeWidth,
        y +
          nameHeight +
          (unitText ? unitHeight + 2 : 0) +
          2,
        { width: descriptionWidth }
      )
  }

  doc.y = y + rowHeight
}

export function buildPriceListPdf({
  categories,
  phone,
}) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    bufferPages: true,
  })

  // El encabezado y los productos van en la misma página: no hay
  // página de portada aparte.
  drawHeader(doc, { phone })

  const visibleCategories = categories.filter(
    (category) => category.products.length > 0
  )

  visibleCategories.forEach((category, index) => {
    drawCategoryHeader(doc, category.name)

    category.products.forEach((product) => {
      drawProductRow(doc, product)
    })

    if (index < visibleCategories.length - 1) {
      doc.moveDown(1)
    }
  })

  // Número de hoja arriba a la izquierda en todas las páginas.
  const range = doc.bufferedPageRange()
  const total = range.count

  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i)

    const savedTopMargin = doc.page.margins.top
    doc.page.margins.top = 0

    const label = `${i + 1} de ${total}`
    const isFirstPage = i === 0

    doc
      .font("Times-Bold")
      .fontSize(isFirstPage ? 11 : 10.5)
    const labelWidth = doc.widthOfString(label)

    if (isFirstPage) {
      // Sobre la foto: pastilla oscura semitransparente para que
      // el texto claro se lea siempre.
      const pillPadX = 8
      const pillHeight = 18

      doc.fillOpacity(0.45)
      doc
        .roundedRect(
          MARGIN - 6,
          16,
          labelWidth + pillPadX * 2,
          pillHeight,
          4
        )
        .fill("#1f1f1f")
      doc.fillOpacity(1)

      doc
        .fillColor("#f7f2e9")
        .text(
          label,
          MARGIN - 6 + pillPadX,
          16 + (pillHeight - doc.currentLineHeight()) / 2,
          { lineBreak: false }
        )
    } else {
      doc
        .fillColor(INK)
        .text(label, MARGIN, 24, { lineBreak: false })
    }

    doc.page.margins.top = savedTopMargin
  }

  doc.end()

  return doc
}

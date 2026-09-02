import PDFDocument from "pdfkit"
import path from "path"
import { fileURLToPath } from "url"
import {
  drawWhatsappIcon,
  drawCalendarIcon,
  drawClockIcon,
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
  "cover.jpg"
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

function drawCoverPage(doc, { phone }) {
  const pageWidth = doc.page.width
  const pageHeight = doc.page.height

  const imgHeight = Math.round(pageHeight * 0.4)

  doc.image(COVER_PATH, 0, 0, {
    width: pageWidth,
    height: imgHeight,
  })

  const logoSize = 130

  doc.image(
    LOGO_PATH,
    pageWidth / 2 - logoSize / 2,
    imgHeight - logoSize / 2,
    { width: logoSize, height: logoSize }
  )

  let y = imgHeight + logoSize / 2 + 26

  doc
    .font("Times-Bold")
    .fontSize(30)
    .fillColor(ACCENT)
    .text("LISTA DE PRECIOS", 0, y, {
      align: "center",
      width: pageWidth,
    })

  y += 44

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(MUTED)
    .text(
      "MF Logística — Distribución para gastronomía oriental",
      0,
      y,
      { align: "center", width: pageWidth }
    )

  y += 34

  doc
    .strokeColor(ACCENT)
    .lineWidth(2)
    .moveTo(pageWidth / 2 - 45, y)
    .lineTo(pageWidth / 2 + 45, y)
    .stroke()

  y += 36

  function infoIconRow({
    drawIcon,
    iconColor,
    iconSize = 17,
    text,
    font = "Helvetica",
    fontSize = 11,
    textColor = MUTED,
    gap = 9,
  }) {
    doc.font(font).fontSize(fontSize)

    const textWidth = doc.widthOfString(text)
    const totalWidth = iconSize + gap + textWidth
    const startX = (pageWidth - totalWidth) / 2
    const lineHeight = doc.currentLineHeight()
    const iconY = y + (lineHeight - iconSize) / 2

    drawIcon(doc, startX, iconY, iconSize, iconColor)

    doc
      .font(font)
      .fontSize(fontSize)
      .fillColor(textColor)
      .text(text, startX + iconSize + gap, y, {
        lineBreak: false,
      })

    y += lineHeight + 20
  }

  infoIconRow({
    drawIcon: drawWhatsappIcon,
    iconColor: "#25D366",
    iconSize: 18,
    text: phone || "Contactanos para más información",
    font: "Helvetica-Bold",
    fontSize: 12,
    textColor: INK,
  })

  infoIconRow({
    drawIcon: drawCalendarIcon,
    iconColor: MUTED,
    text: "Lunes a Sábados — Pedidos hasta las 22 hs",
  })

  infoIconRow({
    drawIcon: drawClockIcon,
    iconColor: MUTED,
    text: `Generado el ${formatDate(new Date())}`,
  })

  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      "Los precios pueden variar sin previo aviso. Consultá disponibilidad y condiciones mayoristas.",
      70,
      pageHeight - 70,
      { align: "center", width: pageWidth - 140 }
    )
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

function drawCategoryHeader(doc, name, suffix = "") {
  ensureSpace(doc, 40)

  const contentWidth =
    doc.page.width - MARGIN * 2

  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(ACCENT)
    .text(
      `${name.toUpperCase()}${suffix}`,
      MARGIN,
      doc.y
    )

  doc.moveDown(0.25)

  doc
    .strokeColor(BORDER)
    .lineWidth(1)
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + contentWidth, doc.y)
    .stroke()

  doc.moveDown(0.7)
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

  drawCoverPage(doc, { phone })

  doc.addPage({ margin: MARGIN })

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

  const range = doc.bufferedPageRange()

  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i)

    // El footer vive dentro del margen inferior de la página:
    // se pone el margen en 0 momentáneamente para que pdfkit no
    // interprete que "no entra" y agregue una página nueva.
    const bottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `MF Logística · Página ${i} de ${range.count - 1}`,
        MARGIN,
        doc.page.height - 30,
        {
          width: doc.page.width - MARGIN * 2,
          align: "center",
        }
      )

    doc.page.margins.bottom = bottomMargin
  }

  doc.end()

  return doc
}

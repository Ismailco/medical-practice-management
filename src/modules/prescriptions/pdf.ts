import PDFDocument from "pdfkit";
import { join } from "node:path";

export const PRESCRIPTION_TEMPLATE_V1 = "phase6-v1";
export const PRESCRIPTION_TEMPLATE_V2 = "morocco-v2";
export const PRESCRIPTION_TEMPLATE_V3 = "morocco-v3";

const ARABIC_REGULAR_FONT = join(process.cwd(), "public/fonts/noto-sans-arabic-400.woff");
const ARABIC_BOLD_FONT = join(process.cwd(), "public/fonts/noto-sans-arabic-700.woff");

export type IssuedPrescriptionDocumentData = Readonly<{
  prescriptionNumber: string;
  issueDate: string;
  status: "FINALIZED" | "VOID";
  isReplaced: boolean;
  templateVersion: string;
  patient: Readonly<{
    number: string;
    name: string;
    dateOfBirth: string;
  }>;
  doctor: Readonly<{
    name: string;
    nameArabic: string | null;
    specialty: string | null;
    specialtyArabic: string | null;
    professionalIdentifier: string | null;
    socialMedia: string | null;
  }>;
  clinic: Readonly<{
    name: string;
    nameArabic: string | null;
    address: string | null;
    addressArabic: string | null;
    city: string | null;
    cityArabic: string | null;
    phone: string | null;
    phoneSecondary: string | null;
    email: string | null;
    logoDataUrl: string | null;
  }>;
  items: readonly Readonly<{
    position: number;
    medicationName: string;
    dosage: string | null;
    form: string | null;
    frequency: string | null;
    duration: string | null;
    quantity: string | null;
    route: string | null;
    instructions: string | null;
  }>[];
}>;

export class UnsupportedPrescriptionTemplateError extends Error {
  constructor() {
    super("This prescription document template is not supported.");
    this.name = "UnsupportedPrescriptionTemplateError";
  }
}

export class PrescriptionDocumentIntegrityError extends Error {
  constructor() {
    super("This issued prescription cannot be rendered safely.");
    this.name = "PrescriptionDocumentIntegrityError";
  }
}

type RenderedPrescriptionPdf = Readonly<{ bytes: Buffer; pageCount: number }>;

function nonEmpty(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

function isSupportedLogoDataUrl(value: string): boolean {
  return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function formatMoroccanDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function normalizeMultiline(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function rightToLeftWords(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim().split(/\s+/).filter(Boolean).reverse().join(" "))
    .join("\n");
}

function drawArabic(
  document: PDFKit.PDFDocument,
  value: string | null,
  x: number,
  y: number,
  width: number,
  options: { bold?: boolean; fontSize?: number } = {},
): void {
  if (!nonEmpty(value)) return;
  document
    .font(options.bold ? ARABIC_BOLD_FONT : ARABIC_REGULAR_FONT)
    .fontSize(options.fontSize ?? 10)
    .text(rightToLeftWords(value), x, y, { width, align: "right" });
}

function drawRule(document: PDFKit.PDFDocument, y: number): void {
  document.moveTo(50, y).lineTo(545, y).lineWidth(0.7).strokeColor("#64748b").stroke();
}

function drawOverlay(document: PDFKit.PDFDocument, data: IssuedPrescriptionDocumentData): void {
  const labels = [
    ...(data.status === "VOID" ? ["VOID", "NOT VALID FOR USE"] : []),
    ...(data.isReplaced ? ["REPLACED / SUPERSEDED"] : []),
  ];
  if (labels.length === 0) return;
  const previousX = document.x;
  const previousY = document.y;
  document
    .fontSize(12)
    .font("Helvetica-Bold")
    .fillColor("#7f1d1d")
    .text(labels.join("  |  "), 350, 50, { width: 195, align: "right" })
    .fillColor("#0f172a");
  document.x = previousX;
  document.y = previousY;
}

function drawContinuationHeader(
  document: PDFKit.PDFDocument,
  data: IssuedPrescriptionDocumentData,
) {
  document.font("Helvetica-Bold").fontSize(10).text(data.clinic.name, 50, 42);
  document.font("Helvetica").fontSize(9).text(`Prescription ${data.prescriptionNumber}`, 50, 56);
  document.text(`${data.patient.name} · ${data.patient.number}`, 50, 69);
  drawOverlay(document, data);
  drawRule(document, 86);
  document.y = 104;
}

function drawMoroccoContinuationHeader(
  document: PDFKit.PDFDocument,
  data: IssuedPrescriptionDocumentData,
): void {
  document.font("Helvetica-Bold").fontSize(10).text(data.clinic.name, 42, 42);
  document.font("Helvetica").fontSize(9).text(`${data.patient.name} - ${data.issueDate}`, 42, 56);
  drawOverlay(document, data);
  document.strokeColor("#64748b").lineWidth(0.7).moveTo(42, 76).lineTo(553, 76).stroke();
  document.y = 94;
}

function drawCenteredArabic(
  document: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  options: { bold?: boolean } = {},
): void {
  document
    .font(options.bold ? ARABIC_BOLD_FONT : ARABIC_REGULAR_FONT)
    .fontSize(fontSize)
    .text(rightToLeftWords(value), x, y, { width, align: "center" });
}

function drawMoroccoHeader(document: PDFKit.PDFDocument, data: IssuedPrescriptionDocumentData) {
  const leftX = 42;
  const rightX = 348;
  const columnWidth = 205;
  const logoX = 232;
  const logoY = 34;
  const logoSize = 112;

  document.fillColor("#0f172a");
  document.font("Helvetica-Bold").fontSize(16).text(data.doctor.name, leftX, 42, {
    width: 185,
  });
  document.font("Helvetica").fontSize(10);
  if (nonEmpty(data.doctor.specialty))
    document.text(normalizeMultiline(data.doctor.specialty), leftX, document.y + 4, { width: 185 });
  if (nonEmpty(data.doctor.professionalIdentifier)) {
    document.text(
      `Professional identifier: ${data.doctor.professionalIdentifier}`,
      leftX,
      document.y + 2,
      {
        width: 185,
      },
    );
  }

  drawArabic(document, data.doctor.nameArabic, rightX, 40, columnWidth, {
    bold: true,
    fontSize: 15,
  });
  const specialtyArabicLineCount = nonEmpty(data.doctor.specialtyArabic)
    ? normalizeMultiline(data.doctor.specialtyArabic).split("\n").length
    : 0;
  drawArabic(document, data.doctor.specialtyArabic, rightX, 67, columnWidth, {
    fontSize: 10,
  });
  drawArabic(
    document,
    data.clinic.nameArabic,
    rightX,
    Math.max(91, 67 + specialtyArabicLineCount * 13 + 3),
    columnWidth,
    {
      fontSize: 9,
    },
  );

  if (nonEmpty(data.clinic.logoDataUrl) && isSupportedLogoDataUrl(data.clinic.logoDataUrl)) {
    document.image(data.clinic.logoDataUrl, logoX, logoY, {
      fit: [logoSize, logoSize],
      align: "center",
      valign: "center",
    });
  } else {
    document
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#1d5f78")
      .text(data.clinic.name, logoX, 72, { width: logoSize, align: "center" });
  }

  document.strokeColor("#1d5f78").lineWidth(1).moveTo(leftX, 154).lineTo(553, 154).stroke();
  document.fillColor("#1d5f78").font("Helvetica-Bold").fontSize(19).text("ORDONNANCE", leftX, 166, {
    width: 511,
    align: "center",
  });
  document.fillColor("#0f172a");
}

function drawMoroccoFooter(document: PDFKit.PDFDocument, data: IssuedPrescriptionDocumentData) {
  document.strokeColor("#1d5f78").lineWidth(1).moveTo(42, 730).lineTo(553, 730).stroke();
  document.font("Helvetica").fontSize(8).fillColor("#334155");
  const frenchAddress = [data.clinic.address, data.clinic.city].filter(nonEmpty).join(" · ");
  if (frenchAddress) document.text(frenchAddress, 42, 742, { width: 511, align: "center" });
  let contactY = 758;
  if (nonEmpty(data.clinic.addressArabic)) {
    drawCenteredArabic(document, data.clinic.addressArabic, 42, contactY, 511, 8);
    contactY += 11;
  }
  if (nonEmpty(data.clinic.cityArabic)) {
    drawCenteredArabic(document, data.clinic.cityArabic, 42, contactY, 511, 8);
    contactY += 11;
  }
  document.font("Helvetica").fontSize(8).fillColor("#334155");
  const contact = [
    data.clinic.phone,
    data.clinic.phoneSecondary,
    data.doctor.socialMedia,
    data.clinic.email,
  ]
    .filter(nonEmpty)
    .join("  ·  ");
  if (contact) document.text(contact, 42, contactY, { width: 511, align: "center" });
}

async function renderPrescriptionMoroccoV2(
  data: IssuedPrescriptionDocumentData,
): Promise<RenderedPrescriptionPdf> {
  const chunks: Buffer[] = [];
  const document = new PDFDocument({
    size: "A4",
    margin: 42,
    compress: false,
    autoFirstPage: false,
    info: { Title: "Prescription document" },
  });
  let pageCount = 0;
  document.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
  const complete = new Promise<RenderedPrescriptionPdf>((resolve, reject) => {
    document.once("end", () => resolve({ bytes: Buffer.concat(chunks), pageCount }));
    document.once("error", reject);
  });

  const addPage = (continuation = false) => {
    document.addPage({ size: "A4", margin: 42 });
    pageCount += 1;
    if (continuation) {
      drawContinuationHeader(document, data);
    } else {
      drawMoroccoHeader(document, data);
      document.y = 218;
    }
  };

  addPage();
  document.font("Helvetica-Bold").fontSize(11).text("Patient", 42, document.y);
  drawArabic(document, "المريض", 390, document.y - 2, 163, { bold: true, fontSize: 10 });
  document
    .font("Helvetica")
    .fontSize(10)
    .text(`Name: ${data.patient.name}`, 42, document.y + 4);
  document.text(`Patient number: ${data.patient.number}`);
  document.text(`Date of birth: ${data.patient.dateOfBirth}`);
  document.moveDown(1.1);
  document.font("Helvetica-Bold").fontSize(11).text("Date", 42, document.y);
  const dateLabel = nonEmpty(data.clinic.city)
    ? `${data.clinic.city}, le ${formatMoroccanDate(data.issueDate)}`
    : formatMoroccanDate(data.issueDate);
  document
    .font("Helvetica")
    .fontSize(10)
    .text(dateLabel, 42, document.y + 4);
  document.moveDown(1.3);
  document.font("Helvetica-Bold").fontSize(12).text("Prescription", 42, document.y);
  drawArabic(document, "الوصفة الطبية", 390, document.y - 2, 163, { bold: true, fontSize: 10 });
  document.moveDown(0.55);
  document.font("Helvetica").fontSize(10);

  for (const [index, item] of data.items.entries()) {
    const detailLines = fieldLines(item);
    const instructionLines = nonEmpty(item.instructions)
      ? [`Instructions: ${item.instructions}`]
      : [];
    const estimatedHeight = 27 + (detailLines.length + instructionLines.length) * 14;
    if (document.y + estimatedHeight > 715 && document.y > 235) addPage(true);
    document
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .text(`${index + 1}. ${item.medicationName}`, 42, document.y, {
        width: 511,
      });
    document.font("Helvetica").fontSize(9.5);
    if (detailLines.length > 0) document.text(detailLines.join("  ·  "), { width: 511 });
    if (instructionLines.length > 0) document.text(instructionLines.join("\n"), { width: 511 });
    document.moveDown(0.65);
  }

  if (document.y + 100 > 715) addPage(true);
  document
    .strokeColor("#64748b")
    .lineWidth(0.7)
    .moveTo(42, document.y + 10)
    .lineTo(553, document.y + 10)
    .stroke();
  document.moveDown(2);
  document.font("Helvetica").fontSize(10).text("Physician signature / stamp:");
  document
    .moveTo(42, document.y + 28)
    .lineTo(280, document.y + 28)
    .strokeColor("#64748b")
    .stroke();
  document
    .fontSize(8)
    .fillColor("#475569")
    .text("Blank space reserved for physical signing and stamping.");
  drawMoroccoFooter(document, data);
  document.end();
  return complete;
}

async function renderPrescriptionMoroccoV3(
  data: IssuedPrescriptionDocumentData,
): Promise<RenderedPrescriptionPdf> {
  const chunks: Buffer[] = [];
  const document = new PDFDocument({
    size: "A4",
    margin: 42,
    compress: false,
    autoFirstPage: false,
    info: { Title: "Prescription document" },
  });
  let pageCount = 0;
  document.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
  const complete = new Promise<RenderedPrescriptionPdf>((resolve, reject) => {
    document.once("end", () => resolve({ bytes: Buffer.concat(chunks), pageCount }));
    document.once("error", reject);
  });

  const addPage = (continuation = false): void => {
    document.addPage({ size: "A4", margin: 42 });
    pageCount += 1;
    if (continuation) {
      drawMoroccoContinuationHeader(document, data);
    } else {
      drawMoroccoHeader(document, data);
      document.y = 232;
    }
  };

  addPage();
  document.font("Helvetica-Bold").fontSize(13).text(data.patient.name, 42, document.y, {
    width: 260,
  });
  const dateLabel = nonEmpty(data.clinic.city)
    ? `${data.clinic.city}, le ${formatMoroccanDate(data.issueDate)}`
    : formatMoroccanDate(data.issueDate);
  document
    .font("Helvetica")
    .fontSize(10)
    .text(dateLabel, 330, document.y + 2, {
      width: 223,
      align: "right",
    });
  document.moveDown(3.2);
  document.font("Helvetica").fontSize(10);

  for (const [index, item] of data.items.entries()) {
    const detailLines = fieldLines(item);
    const instructionLines = nonEmpty(item.instructions)
      ? [`Instructions: ${item.instructions}`]
      : [];
    const estimatedHeight = 27 + (detailLines.length + instructionLines.length) * 14;
    if (document.y + estimatedHeight > 710 && document.y > 250) addPage(true);
    document
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .text(`${index + 1}. ${item.medicationName}`, 42, document.y, {
        width: 511,
      });
    document.font("Helvetica").fontSize(9.5);
    if (detailLines.length > 0) document.text(detailLines.join("  ·  "), { width: 511 });
    if (instructionLines.length > 0) document.text(instructionLines.join("\n"), { width: 511 });
    document.moveDown(0.65);
  }

  drawMoroccoFooter(document, data);
  document.end();
  return complete;
}

function fieldLines(data: IssuedPrescriptionDocumentData["items"][number]): string[] {
  const fields = [
    ["Dosage", data.dosage],
    ["Form", data.form],
    ["Frequency", data.frequency],
    ["Duration", data.duration],
    ["Quantity", data.quantity],
    ["Route", data.route],
  ] as const;
  return fields
    .filter(([, value]) => nonEmpty(value))
    .map(([label, value]) => `${label}: ${value ?? ""}`);
}

async function renderPrescriptionV1(
  data: IssuedPrescriptionDocumentData,
): Promise<RenderedPrescriptionPdf> {
  const chunks: Buffer[] = [];
  const document = new PDFDocument({
    size: "A4",
    margin: 50,
    compress: false,
    autoFirstPage: false,
    info: { Title: "Prescription document" },
  });
  let pageCount = 0;
  document.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
  const complete = new Promise<RenderedPrescriptionPdf>((resolve, reject) => {
    document.once("end", () => resolve({ bytes: Buffer.concat(chunks), pageCount }));
    document.once("error", reject);
  });

  const addPage = (continuation = false) => {
    document.addPage({ size: "A4", margin: 50 });
    pageCount += 1;
    if (continuation) drawContinuationHeader(document, data);
  };

  addPage();
  document.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(data.clinic.name);
  document.font("Helvetica").fontSize(9);
  if (nonEmpty(data.clinic.address)) document.text(data.clinic.address);
  if (nonEmpty(data.clinic.phone)) document.text(`Phone: ${data.clinic.phone}`);
  document.moveDown(0.4);
  document.font("Helvetica-Bold").fontSize(11).text(data.doctor.name);
  document.font("Helvetica").fontSize(9);
  if (nonEmpty(data.doctor.specialty)) document.text(data.doctor.specialty);
  if (nonEmpty(data.doctor.professionalIdentifier))
    document.text(`Professional identifier: ${data.doctor.professionalIdentifier}`);
  drawOverlay(document, data);
  drawRule(document, document.y + 10);
  document.moveDown(1);

  document.font("Helvetica-Bold").fontSize(12).text("Patient");
  document.font("Helvetica").fontSize(10);
  document.text(`Name: ${data.patient.name}`);
  document.text(`Patient number: ${data.patient.number}`);
  document.text(`Date of birth: ${data.patient.dateOfBirth}`);
  document.moveDown(0.8);
  document.font("Helvetica-Bold").fontSize(14).text("Prescription");
  document.font("Helvetica").fontSize(10).text(`Number: ${data.prescriptionNumber}`);
  document.text(`Issue date: ${data.issueDate}`);
  drawRule(document, document.y + 10);
  document.moveDown(0.7);

  document.font("Helvetica-Bold").fontSize(11).text("Medication items");
  document.moveDown(0.35);
  for (const [index, item] of data.items.entries()) {
    const detailLines = fieldLines(item);
    const instructionLines = nonEmpty(item.instructions)
      ? [`Instructions: ${item.instructions}`]
      : [];
    const estimatedHeight = 24 + (detailLines.length + instructionLines.length) * 14;
    if (document.y + estimatedHeight > 745 && document.y > 110) addPage(true);
    document
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(`${index + 1}. ${item.medicationName}`);
    document.font("Helvetica").fontSize(9);
    if (detailLines.length > 0) document.text(detailLines.join("  ·  "), { width: 495 });
    if (instructionLines.length > 0) document.text(instructionLines.join("\n"), { width: 495 });
    document.moveDown(0.55);
  }

  if (document.y + 95 > 745) addPage(true);
  drawRule(document, document.y + 12);
  document.moveDown(2.3);
  document.font("Helvetica").fontSize(10).text("Physician signature / stamp:");
  document
    .moveTo(50, document.y + 28)
    .lineTo(260, document.y + 28)
    .strokeColor("#64748b")
    .stroke();
  document
    .fontSize(8)
    .fillColor("#475569")
    .text("Blank space reserved for physical signing and stamping.");
  document.end();
  return complete;
}

export async function renderPrescription(
  data: IssuedPrescriptionDocumentData,
): Promise<RenderedPrescriptionPdf> {
  if (data.templateVersion === PRESCRIPTION_TEMPLATE_V2) {
    if (data.items.length === 0 || !data.prescriptionNumber || !data.issueDate) {
      throw new PrescriptionDocumentIntegrityError();
    }
    return renderPrescriptionMoroccoV2(data);
  }
  if (data.templateVersion === PRESCRIPTION_TEMPLATE_V3) {
    if (data.items.length === 0 || !data.prescriptionNumber || !data.issueDate) {
      throw new PrescriptionDocumentIntegrityError();
    }
    return renderPrescriptionMoroccoV3(data);
  }
  if (data.templateVersion !== PRESCRIPTION_TEMPLATE_V1) {
    throw new UnsupportedPrescriptionTemplateError();
  }
  if (data.items.length === 0 || !data.prescriptionNumber || !data.issueDate) {
    throw new PrescriptionDocumentIntegrityError();
  }
  return renderPrescriptionV1(data);
}

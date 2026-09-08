import PDFDocument from "pdfkit";

export const PRESCRIPTION_TEMPLATE_V1 = "phase6-v1";

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
    specialty: string | null;
    professionalIdentifier: string | null;
  }>;
  clinic: Readonly<{
    name: string;
    address: string | null;
    phone: string | null;
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
  if (data.templateVersion !== PRESCRIPTION_TEMPLATE_V1) {
    throw new UnsupportedPrescriptionTemplateError();
  }
  if (data.items.length === 0 || !data.prescriptionNumber || !data.issueDate) {
    throw new PrescriptionDocumentIntegrityError();
  }
  return renderPrescriptionV1(data);
}

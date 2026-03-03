const escapePdfText = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const buildSimplePdf = (lines) => {
  const header = "%PDF-1.4\n";

  const contentLines = Array.isArray(lines) ? lines : [String(lines || "")];
  const textLines = contentLines.map((line) => `(${escapePdfText(line)}) Tj`);

  const fontSize = 12;
  const startX = 50;
  const startY = 760;
  const lineHeight = 16;

  const textStream = [
    "BT",
    `/F1 ${fontSize} Tf`,
    `${startX} ${startY} Td`,
    ...textLines.flatMap((line, index) => (index === 0 ? [line] : ["0 -" + lineHeight + " Td", line])),
    "ET",
  ].join("\n");

  const objects = [];

  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
  );
  objects.push(
    `4 0 obj\n<< /Length ${Buffer.byteLength(textStream, "utf8")} >>\nstream\n${textStream}\nendstream\nendobj\n`
  );
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  let offset = header.length;
  const xrefOffsets = [0];
  const body = objects
    .map((obj) => {
      xrefOffsets.push(offset);
      offset += Buffer.byteLength(obj, "utf8");
      return obj;
    })
    .join("");

  const xrefStart = offset;
  const xrefEntries = xrefOffsets
    .map((off, idx) => {
      if (idx === 0) return "0000000000 65535 f ";
      return String(off).padStart(10, "0") + " 00000 n ";
    })
    .join("\n");

  const trailer = [
    "xref",
    `0 ${xrefOffsets.length}`,
    xrefEntries,
    "trailer",
    `<< /Size ${xrefOffsets.length} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF\n",
  ].join("\n");

  return Buffer.from(header + body + trailer, "utf8");
};

module.exports = { buildSimplePdf };

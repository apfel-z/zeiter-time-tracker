import { AppData, Project, TimeRecord } from "./defaultData";
import {
  formatDecimalHours,
  formatHM,
  formatShortDate,
  getReportRangeLabel,
  getTodayISO,
} from "./timeUtils";

interface ExportPdfOptions {
  data: AppData;
  records: TimeRecord[];
  getLiveSeconds: (rec: TimeRecord) => number;
  reportRange: string;
  reportProjectId: string;
  reportTag: string;
  totalSeconds: number;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Builds a standards-compliant PDF 1.4 binary containing one or more A4 pages
 * from rendered high-DPI JPEG images.
 */
function buildPdfFromJpegPages(
  pages: { jpegBytes: Uint8Array; widthPx: number; heightPx: number }[]
): Blob {
  const pageWidthPt = 595.28; // A4 width in points
  const pageHeightPt = 841.89; // A4 height in points

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [0]; // index 0 is free object

  const pushStr = (s: string) => {
    const arr = encoder.encode(s);
    chunks.push(arr);
    offset += arr.length;
  };

  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr);
    offset += arr.length;
  };

  const startObj = (id: number) => {
    offsets[id] = offset;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr("endobj\n");
  };

  pushStr("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  // Object 1: Catalog
  startObj(1);
  pushStr("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  // Each page uses 3 objects: Page (3 + i*3), ContentStream (4 + i*3), ImageXObject (5 + i*3)
  const pageObjIds = pages.map((_, idx) => 3 + idx * 3);

  // Object 2: Pages
  startObj(2);
  pushStr(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\n`
  );
  endObj();

  pages.forEach((p, idx) => {
    const pageId = 3 + idx * 3;
    const contentId = 4 + idx * 3;
    const imageId = 5 + idx * 3;
    const imgName = `/Im${idx + 1}`;

    // Page object
    startObj(pageId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(
        2
      )}] /Resources << /XObject << ${imgName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\n`
    );
    endObj();

    // Content stream drawing the full-bleed A4 canvas
    const contentStream = `q\n${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(
      2
    )} 0 0 cm\n${imgName} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    startObj(contentId);
    pushStr(`<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr("\nendstream\n");
    endObj();

    // Image XObject
    startObj(imageId);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr("\nendstream\n");
    endObj();
  });

  const totalObjects = 2 + pages.length * 3;
  const xrefOffset = offset;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let i = 1; i <= totalObjects; i++) {
    const offStr = String(offsets[i] || 0).padStart(10, "0");
    pushStr(`${offStr} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks, { type: "application/pdf" });
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + "…").width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "…";
}

export function exportReportAsPDF(options: ExportPdfOptions) {
  const {
    data,
    records,
    getLiveSeconds,
    reportRange,
    reportProjectId,
    reportTag,
    totalSeconds,
  } = options;

  const widthPx = 1240; // High-DPI A4 width (approx 150 DPI)
  const heightPx = 1754; // High-DPI A4 height
  const margin = 64;
  const contentWidth = widthPx - margin * 2;

  const fontSans = '"Space Grotesk", "Trebuchet MS", Arial, sans-serif';
  const fontMono = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';

  const selectedProjectName =
    reportProjectId === "all"
      ? "Alle Projekte"
      : data.projects.find((p) => p.id === reportProjectId)?.name || reportProjectId;
  const selectedTagName = reportTag === "all" ? "Alle Tags" : `#${reportTag}`;
  const rangeLabel = getReportRangeLabel(reportRange);

  const userDisplay = data.user?.trim() || "—";
  const teamDisplay = data.team?.trim() || "—";

  // Pagination: first page fits 18 rows (due to KPI & metadata header), subsequent pages fit 25 rows
  const firstPageCap = 18;
  const nextPageCap = 25;
  const pageChunks: TimeRecord[][] = [];

  if (records.length === 0) {
    pageChunks.push([]);
  } else {
    pageChunks.push(records.slice(0, firstPageCap));
    let cursor = firstPageCap;
    while (cursor < records.length) {
      pageChunks.push(records.slice(cursor, cursor + nextPageCap));
      cursor += nextPageCap;
    }
  }

  const totalPages = pageChunks.length;
  const renderedPages: { jpegBytes: Uint8Array; widthPx: number; heightPx: number }[] = [];

  pageChunks.forEach((pageRecords, pageIdx) => {
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Cream Background (#F4F1EA)
    ctx.fillStyle = "#F4F1EA";
    ctx.fillRect(0, 0, widthPx, heightPx);

    // 2. Top Hardware Header Bar (#FAF8F5 with 2px #191918 border)
    ctx.fillStyle = "#FAF8F5";
    ctx.fillRect(margin, margin, contentWidth, 84);
    ctx.strokeStyle = "#191918";
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, margin, contentWidth, 84);

    // Orange Rams Circle
    ctx.beginPath();
    ctx.arc(margin + 34, margin + 42, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#E04F26";
    ctx.fill();
    ctx.strokeStyle = "#191918";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Brand Title
    ctx.fillStyle = "#191918";
    ctx.font = `bold 24px ${fontSans}`;
    ctx.fillText("ZEIT // REPORT", margin + 58, margin + 50);

    // Right Header Metadata
    ctx.fillStyle = "#6E6D68";
    ctx.font = `500 14px ${fontMono}`;
    const dateStamp = `STAND: ${formatShortDate(getTodayISO())} • SEITE ${pageIdx + 1}/${totalPages}`;
    const dateStampWidth = ctx.measureText(dateStamp).width;
    ctx.fillText(dateStamp, margin + contentWidth - dateStampWidth - 24, margin + 47);

    let y = margin + 112;

    if (pageIdx === 0) {
      // 3. KPI & Filter Summary Card on Page 1
      const summaryHeight = 148;
      ctx.fillStyle = "#FAF8F5";
      ctx.fillRect(margin, y, contentWidth, summaryHeight);
      ctx.strokeStyle = "#191918";
      ctx.lineWidth = 2;
      ctx.strokeRect(margin, y, contentWidth, summaryHeight);

      // Vertical divider inside summary card
      const splitX = margin + Math.floor(contentWidth * 0.62);
      ctx.beginPath();
      ctx.moveTo(splitX, y);
      ctx.lineTo(splitX, y + summaryHeight);
      ctx.stroke();

      // Left side: User, Team, Filter details
      ctx.fillStyle = "#6E6D68";
      ctx.font = `600 12px ${fontMono}`;
      ctx.fillText("PROFIL & AKTIVE FILTERUNG", margin + 24, y + 32);

      ctx.fillStyle = "#191918";
      ctx.font = `bold 18px ${fontSans}`;
      ctx.fillText(`Name: ${userDisplay}   •   Team: ${teamDisplay}`, margin + 24, y + 66);

      ctx.fillStyle = "#191918";
      ctx.font = `500 14px ${fontMono}`;
      ctx.fillText(`Zeitraum: ${rangeLabel}`, margin + 24, y + 98);
      ctx.fillText(
        `Projekt: ${selectedProjectName}   |   Tag: ${selectedTagName}`,
        margin + 24,
        y + 124
      );

      // Right side: Total Hours & Decimal Hours
      ctx.fillStyle = "#6E6D68";
      ctx.font = `600 12px ${fontMono}`;
      ctx.fillText(`GESAMTZEIT (${records.length} EINTRÄGE)`, splitX + 24, y + 32);

      // Pill badge for total hours
      ctx.fillStyle = "#E6E1D6";
      ctx.fillRect(splitX + 24, y + 48, contentWidth - (splitX - margin) - 48, 54);
      ctx.strokeStyle = "#191918";
      ctx.lineWidth = 2;
      ctx.strokeRect(splitX + 24, y + 48, contentWidth - (splitX - margin) - 48, 54);

      ctx.fillStyle = "#191918";
      ctx.font = `bold 26px ${fontMono}`;
      ctx.fillText(
        `${formatHM(totalSeconds)}h (${formatDecimalHours(totalSeconds)} Dez.)`,
        splitX + 40,
        y + 84
      );

      ctx.fillStyle = "#6E6D68";
      ctx.font = `500 12px ${fontMono}`;
      ctx.fillText("Format: HH:MM & Industriestunden", splitX + 24, y + 126);

      y += summaryHeight + 28;
    }

    // 4. Table Header
    const rowHeight = 52;
    const cols = [
      { label: "DATUM", width: 120 },
      { label: "TEAM", width: 140 },
      { label: "NAME", width: 130 },
      { label: "PROJEKT", width: 210 },
      { label: "TAGS", width: 160 },
      { label: "BESCHREIBUNG", width: 232 },
      { label: "ZEIT", width: 120 },
    ];

    ctx.fillStyle = "#E6E1D6";
    ctx.fillRect(margin, y, contentWidth, 44);
    ctx.strokeStyle = "#191918";
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, y, contentWidth, 44);

    let colX = margin;
    cols.forEach((col, cIdx) => {
      if (cIdx > 0) {
        ctx.beginPath();
        ctx.moveTo(colX, y);
        ctx.lineTo(colX, y + 44);
        ctx.stroke();
      }
      ctx.fillStyle = "#191918";
      ctx.font = `bold 12px ${fontMono}`;
      if (col.label === "ZEIT") {
        const tw = ctx.measureText(col.label).width;
        ctx.fillText(col.label, colX + col.width - tw - 14, y + 27);
      } else {
        ctx.fillText(col.label, colX + 12, y + 27);
      }
      colX += col.width;
    });

    y += 44;

    // 5. Table Rows
    if (pageRecords.length === 0) {
      ctx.fillStyle = "#FAF8F5";
      ctx.fillRect(margin, y, contentWidth, 80);
      ctx.strokeStyle = "#191918";
      ctx.lineWidth = 2;
      ctx.strokeRect(margin, y, contentWidth, 80);

      ctx.fillStyle = "#6E6D68";
      ctx.font = `500 15px ${fontMono}`;
      ctx.fillText("Keine Einträge für diesen Filterzeitraum vorhanden.", margin + 24, y + 46);
      y += 80;
    } else {
      pageRecords.forEach((rec, rIdx) => {
        const proj: Project | undefined = data.projects.find((p) => p.id === rec.projectId);
        const sec = getLiveSeconds(rec);

        ctx.fillStyle = rIdx % 2 === 0 ? "#FAF8F5" : "#F4F1EA";
        ctx.fillRect(margin, y, contentWidth, rowHeight);
        ctx.strokeStyle = "#191918";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(margin, y, contentWidth, rowHeight);

        let cellX = margin;

        // Col 0: Datum
        ctx.fillStyle = "#191918";
        ctx.font = `500 13px ${fontMono}`;
        ctx.fillText(formatShortDate(rec.date), cellX + 12, y + 31);
        cellX += cols[0].width;

        // Divider
        ctx.beginPath();
        ctx.moveTo(cellX, y);
        ctx.lineTo(cellX, y + rowHeight);
        ctx.stroke();

        // Col 1: Team
        ctx.fillStyle = "#6E6D68";
        ctx.font = `500 13px ${fontMono}`;
        ctx.fillText(truncateText(ctx, teamDisplay, cols[1].width - 24), cellX + 12, y + 31);
        cellX += cols[1].width;

        ctx.beginPath();
        ctx.moveTo(cellX, y);
        ctx.lineTo(cellX, y + rowHeight);
        ctx.stroke();

        // Col 2: Name
        ctx.fillStyle = "#191918";
        ctx.font = `500 13px ${fontMono}`;
        ctx.fillText(truncateText(ctx, userDisplay, cols[2].width - 24), cellX + 12, y + 31);
        cellX += cols[2].width;

        ctx.beginPath();
        ctx.moveTo(cellX, y);
        ctx.lineTo(cellX, y + rowHeight);
        ctx.stroke();

        // Col 3: Projekt Badge with original pastel color
        if (proj) {
          const badgeX = cellX + 10;
          const badgeY = y + 10;
          const badgeW = cols[3].width - 20;
          const badgeH = rowHeight - 20;

          ctx.fillStyle = proj.color || "#B8E986";
          ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
          ctx.strokeStyle = "#191918";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

          ctx.fillStyle = proj.textColor || "#191918";
          ctx.font = `bold 13px ${fontSans}`;
          ctx.fillText(truncateText(ctx, proj.name, badgeW - 16), badgeX + 8, y + 31);
        }
        cellX += cols[3].width;

        ctx.beginPath();
        ctx.moveTo(cellX, y);
        ctx.lineTo(cellX, y + rowHeight);
        ctx.stroke();

        // Col 4: Tags
        ctx.fillStyle = "#191918";
        ctx.font = `500 12px ${fontMono}`;
        const tagStr = rec.tags.map((t) => `#${t}`).join(", ");
        ctx.fillText(truncateText(ctx, tagStr, cols[4].width - 20), cellX + 10, y + 31);
        cellX += cols[4].width;

        ctx.beginPath();
        ctx.moveTo(cellX, y);
        ctx.lineTo(cellX, y + rowHeight);
        ctx.stroke();

        // Col 5: Beschreibung
        ctx.fillStyle = "#191918";
        ctx.font = `400 14px ${fontSans}`;
        ctx.fillText(
          truncateText(ctx, rec.description || "", cols[5].width - 20),
          cellX + 10,
          y + 31
        );
        cellX += cols[5].width;

        ctx.beginPath();
        ctx.moveTo(cellX, y);
        ctx.lineTo(cellX, y + rowHeight);
        ctx.stroke();

        // Col 6: Zeit (HH:MM + Dezimal)
        ctx.fillStyle = "#191918";
        ctx.font = `bold 14px ${fontMono}`;
        const timeStr = `${formatHM(sec)}h`;
        const tw = ctx.measureText(timeStr).width;
        ctx.fillText(timeStr, cellX + cols[6].width - tw - 12, y + 24);

        ctx.fillStyle = "#6E6D68";
        ctx.font = `500 11px ${fontMono}`;
        const decStr = `(${formatDecimalHours(sec)})`;
        const dw = ctx.measureText(decStr).width;
        ctx.fillText(decStr, cellX + cols[6].width - dw - 12, y + 41);

        y += rowHeight;
      });
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    renderedPages.push({
      jpegBytes: dataUrlToUint8Array(dataUrl),
      widthPx,
      heightPx,
    });
  });

  const pdfBlob = buildPdfFromJpegPages(renderedPages);
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zeit-report-${getTodayISO()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

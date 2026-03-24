---
name: pdf-documents
description: Use when building PDF generation for Conva business documents — invoices, quotations, receipts, delivery notes, or statements. Trigger for "generate PDF", "invoice PDF", "quote PDF", "receipt", "delivery note", "PDF generation", "ReportLab", or any task in backend/app/services/documents/. Do NOT use for general file handling.
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

## When to Apply

Use this skill for **any task involving business document PDF generation** in the ZentrikAI backend.

**Must use:** `backend/app/services/documents/pdf_generator.py`, invoice/quote/receipt generation, Supabase Storage upload, WhatsApp document delivery.

**Skip:** Celery task wiring (use `celery-tasks`), FastAPI document endpoints (use `fastapi-route`), full feature builds (use `conva-feature`).

---

## Document Pipeline

```
POST /api/documents/invoices
      │
      ▼ Create invoice record in DB (status: draft, pdf_status: pending)
      │
      ▼ Enqueue: generate_document_pdf.delay(...)
      │
      ▼ (Celery) Load invoice + line items + tenant branding from DB
      │
      ▼ Build PDF bytes with ReportLab (in memory — no temp files)
      │
      ▼ Upload to Supabase Storage: documents/{client_id}/invoices/{id}.pdf
      │
      ▼ Update invoice: pdf_url + pdf_status = "ready"
      │
      ▼ (optional) Send via WhatsApp as document attachment
```

---

## 1. PDF Generator (`backend/app/services/documents/pdf_generator.py`)

```python
import io
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER

from app.db.queries.documents import get_invoice_with_items, get_quotation_with_items
from app.db.queries.clients import get_client_branding
from app.db.supabase import get_admin_client

logger = logging.getLogger(__name__)

HARARE_TZ  = ZoneInfo("Africa/Harare")
PAGE_W, _  = A4
MARGIN     = 20 * mm

# Brand colours — tenant-overridable in future
BRAND_PRIMARY   = colors.HexColor("#1e40af")
BRAND_SECONDARY = colors.HexColor("#f1f5f9")
TEXT_DARK       = colors.HexColor("#0f172a")
TEXT_MUTED      = colors.HexColor("#64748b")
BORDER          = colors.HexColor("#e2e8f0")


async def generate_invoice_pdf(invoice_id: str, client_id: str) -> str:
    invoice  = await get_invoice_with_items(client_id, invoice_id)
    if not invoice:
        raise LookupError(f"Invoice {invoice_id} not found")
    branding = await get_client_branding(client_id)
    pdf      = _build_invoice_pdf(invoice, branding)
    path     = f"documents/{client_id}/invoices/{invoice_id}.pdf"
    return await _upload(pdf, path)


async def generate_quote_pdf(quote_id: str, client_id: str) -> str:
    quote    = await get_quotation_with_items(client_id, quote_id)
    if not quote:
        raise LookupError(f"Quotation {quote_id} not found")
    branding = await get_client_branding(client_id)
    pdf      = _build_quote_pdf(quote, branding)
    path     = f"documents/{client_id}/quotations/{quote_id}.pdf"
    return await _upload(pdf, path)


def _build_invoice_pdf(invoice: dict, branding: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
        title=f"Invoice {invoice['invoice_number']}",
    )
    story = []
    story += _header(branding, "INVOICE", invoice["invoice_number"])
    story.append(Spacer(1, 6 * mm))
    story += _billing_block(invoice, branding)
    story.append(Spacer(1, 6 * mm))
    story += _line_items(invoice["items"], invoice.get("currency", "USD"))
    story.append(Spacer(1, 4 * mm))
    story += _totals(invoice)
    if invoice.get("notes"):
        story.append(Spacer(1, 6 * mm))
        story += _notes_block(invoice["notes"])
    story += _footer(branding)
    doc.build(story)
    return buf.getvalue()


def _header(branding: dict, doc_type: str, doc_number: str) -> list:
    business = branding.get("business_name", "")
    lp = ParagraphStyle("lh", fontSize=18, textColor=BRAND_PRIMARY, fontName="Helvetica-Bold")
    rp = ParagraphStyle("rh", fontSize=28, textColor=BRAND_PRIMARY, fontName="Helvetica-Bold", alignment=TA_RIGHT)
    rn = ParagraphStyle("rn", fontSize=12, textColor=TEXT_MUTED, alignment=TA_RIGHT)

    left  = [Paragraph(business, lp)]
    right = [Paragraph(doc_type, rp), Paragraph(f"#{doc_number}", rn)]

    t = Table([[left, right]], colWidths=[PAGE_W * 0.55 - MARGIN, PAGE_W * 0.45 - MARGIN])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return [t, HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=4 * mm)]


def _billing_block(invoice: dict, branding: dict) -> list:
    lbl  = ParagraphStyle("lbl",  fontSize=8,  textColor=TEXT_MUTED, fontName="Helvetica-Bold")
    name = ParagraphStyle("name", fontSize=11, textColor=TEXT_DARK,  fontName="Helvetica-Bold")
    muted = ParagraphStyle("m",   fontSize=9,  textColor=TEXT_MUTED, leading=14)

    issued = _fmt_date(invoice.get("issued_at") or invoice.get("created_at"))
    due    = _fmt_date(invoice.get("due_at")) if invoice.get("due_at") else "On receipt"

    left  = [Paragraph("BILL TO", lbl), Paragraph(invoice.get("contact_name", ""), name),
             Paragraph(invoice.get("contact_phone", ""), muted)]
    right = [_kv("Date Issued", issued), _kv("Due Date", due),
             _kv("Status", (invoice.get("status") or "draft").upper())]

    t = Table([[left, right]], colWidths=[PAGE_W * 0.5 - MARGIN, PAGE_W * 0.5 - MARGIN])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return [t]


def _line_items(items: list, currency: str) -> list:
    sym = "ZiG" if currency == "ZIG" else "$"
    h_style = ParagraphStyle("th", fontSize=9, textColor=colors.white, fontName="Helvetica-Bold")
    c_style = ParagraphStyle("td", fontSize=9, textColor=TEXT_DARK)
    n_style = ParagraphStyle("n",  fontSize=9, textColor=TEXT_DARK, alignment=TA_RIGHT)

    rows = [[Paragraph("DESCRIPTION", h_style), Paragraph("QTY", h_style),
             Paragraph("UNIT PRICE", h_style), Paragraph("AMOUNT", h_style)]]

    for item in items:
        up  = item["unit_price_cents"] / 100
        amt = item["quantity"] * up
        rows.append([
            Paragraph(item.get("description", ""), c_style),
            Paragraph(str(item["quantity"]), c_style),
            Paragraph(f"{sym}{up:,.2f}", n_style),
            Paragraph(f"{sym}{amt:,.2f}", n_style),
        ])

    col_w = [PAGE_W * 0.45 - MARGIN, PAGE_W * 0.10, PAGE_W * 0.20, PAGE_W * 0.20]
    t = Table(rows, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  BRAND_PRIMARY),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, BRAND_SECONDARY]),
        ("GRID",          (0, 0), (-1, -1), 0.5, BORDER),
        ("ALIGN",         (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [t]


def _totals(invoice: dict) -> list:
    sym      = "ZiG" if invoice.get("currency") == "ZIG" else "$"
    subtotal = invoice.get("subtotal_cents", 0) / 100
    tax      = invoice.get("tax_cents", 0) / 100
    discount = invoice.get("discount_cents", 0) / 100
    total    = invoice.get("total_cents", 0) / 100
    tax_rate = invoice.get("tax_rate", 0)

    lbl_s  = ParagraphStyle("ls",  fontSize=9,  textColor=TEXT_MUTED, alignment=TA_RIGHT)
    val_s  = ParagraphStyle("vs",  fontSize=9,  textColor=TEXT_DARK,  alignment=TA_RIGHT)
    tot_l  = ParagraphStyle("tl",  fontSize=11, textColor=TEXT_DARK,  fontName="Helvetica-Bold", alignment=TA_RIGHT)
    tot_v  = ParagraphStyle("tv",  fontSize=11, textColor=BRAND_PRIMARY, fontName="Helvetica-Bold", alignment=TA_RIGHT)

    rows = [("Subtotal", f"{sym}{subtotal:,.2f}")]
    if discount > 0:
        rows.append(("Discount", f"-{sym}{discount:,.2f}"))
    if tax > 0:
        rows.append((f"VAT ({tax_rate}%)", f"{sym}{tax:,.2f}"))
    rows.append(("TOTAL DUE", f"{sym}{total:,.2f}"))

    pdf_rows = []
    for i, (label, value) in enumerate(rows):
        is_last = i == len(rows) - 1
        pdf_rows.append([Paragraph(label, tot_l if is_last else lbl_s),
                         Paragraph(value,  tot_v if is_last else val_s)])

    inner = Table(pdf_rows, colWidths=[PAGE_W * 0.4 - MARGIN, PAGE_W * 0.2])
    outer = Table([[None, inner]], colWidths=[PAGE_W * 0.35, PAGE_W * 0.65 - 2 * MARGIN])
    outer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return [outer]


def _notes_block(notes: str) -> list:
    return [
        Paragraph("Notes", ParagraphStyle("nl", fontSize=9, textColor=TEXT_MUTED, fontName="Helvetica-Bold")),
        Spacer(1, 2 * mm),
        Paragraph(notes, ParagraphStyle("nb", fontSize=9, textColor=TEXT_DARK, leading=14)),
    ]


def _footer(branding: dict) -> list:
    text = branding.get("invoice_footer", "Thank you for your business.")
    return [
        Spacer(1, 8 * mm),
        HRFlowable(width="100%", thickness=0.5, color=BORDER),
        Spacer(1, 2 * mm),
        Paragraph(text, ParagraphStyle("ft", fontSize=8, textColor=TEXT_MUTED, alignment=TA_CENTER)),
    ]


def _kv(key: str, value: str) -> Paragraph:
    return Paragraph(
        f'<font size="8" color="#64748b">{key}: </font><font size="9" color="#0f172a">{value}</font>',
        ParagraphStyle("kv", fontSize=9, leading=16),
    )


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.astimezone(HARARE_TZ).strftime("%-d %B %Y")
    except Exception:
        return iso
```

---

## 2. Supabase Storage Upload

```python
async def _upload(pdf_bytes: bytes, storage_path: str) -> str:
    supabase = get_admin_client()
    await supabase.storage.from_("documents").upload(
        path=storage_path,
        file=pdf_bytes,
        file_options={"content-type": "application/pdf", "upsert": "true", "cache-control": "3600"},
    )
    return supabase.storage.from_("documents").get_public_url(storage_path)
```

### Storage Bucket RLS (add to migration)
```sql
-- Read: only tenant's own documents
CREATE POLICY "tenant_document_read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = (
      SELECT client_id::text FROM team_members WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Write: only tenant's own path
CREATE POLICY "tenant_document_write" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = (
      SELECT client_id::text FROM team_members WHERE user_id = auth.uid() LIMIT 1
    )
  );
```

---

## 3. WhatsApp Delivery (`backend/app/services/documents/delivery.py`)

```python
from app.services.whatsapp.send import send_document_message
from app.db.queries.whatsapp import get_whatsapp_account
from app.db.queries.documents import get_invoice_with_items


async def send_invoice_via_whatsapp(invoice_id: str, client_id: str) -> None:
    invoice = await get_invoice_with_items(client_id, invoice_id)
    if not invoice:
        raise LookupError(f"Invoice {invoice_id} not found")
    if not invoice.get("pdf_url"):
        raise ValueError("PDF not yet generated — retry in a moment")

    wa_account = await get_whatsapp_account(client_id)
    if not wa_account:
        raise ValueError("WhatsApp account not configured")

    sym     = "ZiG" if invoice["currency"] == "ZIG" else "$"
    total   = invoice["total_cents"] / 100
    caption = f"Invoice #{invoice['invoice_number']} — Total: {sym}{total:,.2f}"

    await send_document_message(
        phone_number_id=wa_account["phone_number_id"],
        access_token=wa_account["access_token"],
        to=invoice["contact_phone"],
        document_url=invoice["pdf_url"],
        filename=f"Invoice-{invoice['invoice_number']}.pdf",
        caption=caption,
    )
```

---

## 4. Document Types Reference

| Document | Table | Items Table | Number Prefix |
|----------|-------|-------------|---------------|
| Invoice | `invoices` | `invoice_items` | `INV-` |
| Quotation | `quotations` | `quotation_items` | `QT-` |
| Receipt | `receipts` | `receipt_items` | `RCP-` |
| Delivery Note | `delivery_notes` | `delivery_note_items` | `DN-` |

All follow the same generation pattern — copy `_build_invoice_pdf`, adjust title and fields.

---

## 5. Dependencies

```
reportlab==4.2.2
```

No other PDF library. Do not introduce `fpdf2`, `weasyprint`, or `pdfkit`.

---

## Pre-Delivery Checklist

- [ ] PDF built in memory with `io.BytesIO()` — no temp files on disk
- [ ] Uploaded to `documents/{client_id}/{type}/{id}.pdf` in Supabase Storage
- [ ] `pdf_url` and `pdf_status = "ready"` written to DB after upload
- [ ] `pdf_status = "failed"` written to DB on generation error
- [ ] Storage RLS policy restricts reads/writes to owning tenant
- [ ] Line items fetched from `{type}_items` table — never embedded in main row
- [ ] Dates formatted in `Africa/Harare` timezone
- [ ] Currency: `$` for USD, `ZiG` for ZIG — stored in cents, displayed as decimal
- [ ] Generation triggered via Celery task — never inline in HTTP handler
- [ ] WhatsApp send only after confirming `pdf_url` is set
- [ ] `reportlab` in `requirements.txt` — no other PDF library

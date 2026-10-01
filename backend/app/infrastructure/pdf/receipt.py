"""PDF receipt (comprobante de venta) rendered with ReportLab."""
from __future__ import annotations

from datetime import timezone
from decimal import Decimal
from io import BytesIO
from zoneinfo import ZoneInfo

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A5
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.application.services.receipts import ReceiptRenderer
from app.domain.entities import Sale
from app.domain.value_objects.enums import PaymentMethod, SaleStatus

PAYMENT_LABELS = {
    PaymentMethod.EFECTIVO: "Efectivo",
    PaymentMethod.TRANSFERENCIA: "Transferencia",
    PaymentMethod.TARJETA: "Tarjeta de crédito",
}


def _money(value: Decimal | None) -> str:
    return f"$ {value:,.2f}" if value is not None else "—"


MONTHS_ES = (
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
)


def format_datetime_es(value) -> str:
    """"1 Octubre 2026, 16:20" (same format as the frontend)."""
    return f"{value.day} {MONTHS_ES[value.month - 1]} {value.year}, {value:%H:%M}"


class ReportLabReceiptRenderer(ReceiptRenderer):
    def __init__(self, company_name: str = "MobileZone", timezone_name: str = "America/Guayaquil") -> None:
        self.company_name = company_name
        self.tz = ZoneInfo(timezone_name)

    def render(self, sale: Sale) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A5,
            leftMargin=12 * mm,
            rightMargin=12 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm,
            title=f"Comprobante venta {sale.id}",
            author=self.company_name,
        )
        styles = getSampleStyleSheet()
        small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, leading=10)
        center = ParagraphStyle("center", parent=small, alignment=TA_CENTER)
        right = ParagraphStyle("right", parent=small, alignment=TA_RIGHT)
        title = ParagraphStyle("title", parent=styles["Title"], fontSize=16, spaceAfter=2)

        branch = sale.branch
        documento = "FACTURA" if sale.factura else "COMPROBANTE DE VENTA"
        fecha = sale.fecha
        if fecha is not None and fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=timezone.utc)  # stored in UTC
        fecha_txt = format_datetime_es(fecha.astimezone(self.tz)) if fecha else "—"

        story = [
            Paragraph(self.company_name, title),
            Paragraph(f"Sucursal {branch.nombre} · {branch.ubicacion}", center),
        ]
        if branch.telefono:
            story.append(Paragraph(f"Teléfono: {branch.telefono}", center))
        story += [
            Spacer(1, 4 * mm),
            Paragraph(f"<b>{documento}</b> N.º {sale.id:06d}", ParagraphStyle("doc", parent=styles["Heading3"], alignment=TA_CENTER)),
        ]
        if sale.estado == SaleStatus.ANULADA:
            story.append(Paragraph("<font color='#dc2626'><b>VENTA ANULADA</b></font>", center))

        cliente = sale.cliente
        cliente_txt = (
            f"{cliente.nombre} {cliente.apellido}<br/>Cédula/RUC: {cliente.identificacion or '—'}"
            f" · Celular: {cliente.celular or '—'}"
            if cliente
            else "Consumidor final"
        )
        info = Table(
            [
                [Paragraph("<b>Fecha</b>", small), Paragraph(fecha_txt, small)],
                [Paragraph("<b>Vendedor</b>", small), Paragraph(f"{sale.user.nombre} {sale.user.apellido}", small)],
                [Paragraph("<b>Cliente</b>", small), Paragraph(cliente_txt, small)],
            ],
            colWidths=[22 * mm, None],
        )
        info.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
        story += [Spacer(1, 3 * mm), info, Spacer(1, 4 * mm)]

        rows = [[Paragraph(f"<b>{h}</b>", small) for h in ("SKU", "Producto", "Cant.", "P. unit.", "Subtotal")]]
        for d in sale.details:
            rows.append(
                [
                    Paragraph(d.product.sku, small),
                    Paragraph(d.product.nombre, small),
                    Paragraph(str(d.cantidad), right),
                    Paragraph(_money(d.precio_unitario), right),
                    Paragraph(_money(d.subtotal), right),
                ]
            )
        items = Table(rows, colWidths=[22 * mm, None, 12 * mm, 20 * mm, 22 * mm], repeatRows=1)
        items.setStyle(
            TableStyle(
                [
                    ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story += [items, Spacer(1, 3 * mm)]

        totals = [["Subtotal", _money(sale.total)]]
        if sale.recargo:
            totals.append(["Recargo tarjeta de crédito (6 %)", _money(sale.recargo)])
        totals.append(["<b>TOTAL A PAGAR</b>", f"<b>{_money(sale.total_pagar or sale.total)}</b>"])
        if sale.metodo_pago is not None:
            totals.append(["Método de pago", PAYMENT_LABELS[sale.metodo_pago]])
        if sale.monto_recibido is not None:
            totals += [["Recibido", _money(sale.monto_recibido)], ["Cambio", _money(sale.cambio)]]
        totals_table = Table(
            [[Paragraph(label, right), Paragraph(value, right)] for label, value in totals],
            colWidths=[None, 30 * mm],
        )
        bold_row = 1 + (1 if sale.recargo else 0)
        totals_table.setStyle(TableStyle([("LINEABOVE", (0, bold_row), (-1, bold_row), 0.6, colors.black)]))
        story += [totals_table, Spacer(1, 6 * mm)]
        story.append(
            Paragraph(
                "Documento interno de venta. No reemplaza al comprobante electrónico autorizado por el SRI.",
                center,
            )
        )
        doc.build(story)
        return buffer.getvalue()

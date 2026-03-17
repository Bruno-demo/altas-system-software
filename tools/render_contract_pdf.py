from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

DOT_SHORT = "...................."
DOT_MED = "................................"
DOT_LONG = "................................................"


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def build_pdf(pdf_path: Path) -> None:
    styles = getSampleStyleSheet()

    title = ParagraphStyle(
        "ContractTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=18,
        alignment=1,
        spaceAfter=2,
        textTransform="uppercase",
        textColor=colors.HexColor("#0f172a"),
    )
    subtitle = ParagraphStyle(
        "ContractSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        alignment=1,
        textColor=colors.HexColor("#334155"),
    )
    section = ParagraphStyle(
        "ContractSection",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=9.6,
        leading=11,
        spaceBefore=3,
        spaceAfter=2,
        textTransform="uppercase",
        textColor=colors.HexColor("#0f172a"),
    )
    body = ParagraphStyle(
        "ContractBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=10.6,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=1,
        wordWrap="CJK",
    )
    body_muted = ParagraphStyle(
        "ContractBodyMuted",
        parent=body,
        textColor=colors.HexColor("#334155"),
    )
    bullet = ParagraphStyle(
        "ContractBullet",
        parent=body,
        leftIndent=1,
        spaceAfter=0.5,
    )
    small = ParagraphStyle(
        "ContractSmall",
        parent=body,
        fontSize=8.1,
        leading=10,
        textColor=colors.HexColor("#475569"),
    )

    flow = []

    header = Table(
        [[
            p("AL-TAHS System Purchase Agreement", title),
            p(f"Agreement Date: {DOT_MED}   Place: {DOT_MED}", subtitle),
        ]],
        colWidths=[188 * mm],
    )
    header.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#0f172a")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef2ff")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    flow.append(header)
    flow.append(Spacer(1, 4))

    flow.append(
        p(
            "This Agreement is entered between <b>Developer/Seller:</b> "
            + DOT_LONG
            + " and <b>Client/Buyer:</b> "
            + DOT_LONG
            + ".",
            body,
        )
    )

    flow.append(p("1. Scope of Delivery", section))
    flow.append(
        p(
            "The Seller delivers the AL-TAHS business management system, including configured modules, "
            "deployment setup, and onboarding handover, as demonstrated and agreed by both parties.",
            body_muted,
        )
    )

    flow.append(p("2. Commercial Terms", section))

    terms_table = Table(
        [
            [p("Total System Cost", body), p("<b>RWF 2,000,000</b> (Two Million Rwandan Francs only).", body)],
            [
                p("Payment Method", body),
                p(
                    "<b>Full one-time payment only</b> via Bank (BK).<br/>"
                    + f"Bank Name: {DOT_MED}   Account Number: {DOT_MED}   Account Holder: {DOT_MED}",
                    body,
                ),
            ],
            [p("Installments", body), p("<b>Not accepted.</b>", body)],
            [p("Payment Due Date", body), p("<b>Within five (5) calendar days from the Agreement signing date.</b>", body)],
            [
                p("Hosting &amp; Infrastructure Fees", body),
                p(
                    "<b>Client responsibility.</b> All recurring and one-time infrastructure costs are covered by the Client, "
                    "including hosting/VPS, domain, SSL, internet/VPN, backup storage, and any third-party service fees.",
                    body,
                ),
            ],
        ],
        colWidths=[57 * mm, 131 * mm],
    )
    terms_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.HexColor("#0f172a")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    flow.append(terms_table)

    flow.append(p("3. Support Commitment (12 Months)", section))
    flow.append(
        p(
            "The Seller will provide operational support for one (1) year from the signing date, including:",
            body_muted,
        )
    )

    flow.append(
        ListFlowable(
            [
                ListItem(p("Bug investigation and correction for delivered features.", bullet)),
                ListItem(p("User guidance and issue troubleshooting when requested by the Client.", bullet)),
                ListItem(p("Reasonable minor adjustments aligned with existing workflows.", bullet)),
                ListItem(p("Remote or onsite support scheduling by mutual agreement.", bullet)),
            ],
            bulletType="bullet",
            leftIndent=12,
            bulletFontName="Helvetica",
            bulletFontSize=8,
            spaceBefore=1,
            spaceAfter=2,
        )
    )

    flow.append(p("4. General Conditions", section))
    flow.append(
        ListFlowable(
            [
                ListItem(p("Major new features outside current scope require a separate written agreement.", bullet)),
                ListItem(p("The Client shall provide required access, responsible users, and infrastructure cooperation.", bullet)),
                ListItem(p("The Client pays all hosting and operational infrastructure charges from go-live onward.", bullet)),
                ListItem(p("Payment is due in full within five (5) calendar days after the signing date.", bullet)),
                ListItem(p("This Agreement becomes effective upon signature by both parties.", bullet)),
            ],
            bulletType="bullet",
            leftIndent=12,
            bulletFontName="Helvetica",
            bulletFontSize=8,
            spaceBefore=1,
            spaceAfter=2,
        )
    )

    seller_block = (
        "<b>Seller / Developer</b><br/>"
        f"Name: {DOT_LONG}<br/>"
        f"ID / Company: {DOT_LONG}<br/>"
        f"Phone: {DOT_MED}<br/>"
        f"Signature: {DOT_MED}<br/>"
        f"Date: {DOT_MED}"
    )
    client_block = (
        "<b>Client / Buyer</b><br/>"
        f"Name: {DOT_LONG}<br/>"
        f"Company: {DOT_LONG}<br/>"
        f"Phone: {DOT_MED}<br/>"
        f"Signature: {DOT_MED}<br/>"
        f"Date: {DOT_MED}"
    )

    sign_table = Table(
        [[p(seller_block, body), p(client_block, body)]],
        colWidths=[94 * mm, 94 * mm],
    )
    sign_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.HexColor("#0f172a")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    flow.append(sign_table)

    flow.append(Spacer(1, 3))
    flow.append(p(f"Witness (optional): {DOT_LONG}   Signature: {DOT_MED}", small))

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=9 * mm,
        rightMargin=9 * mm,
        topMargin=9 * mm,
        bottomMargin=9 * mm,
        title="AL-TAHS System Purchase Agreement",
        author="AL-TAHS System",
    )
    doc.build(flow)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    pdf_path = root / "docs" / "AL-TAHS-System-Contract.pdf"
    build_pdf(pdf_path)
    print(f"Generated PDF: {pdf_path}")


if __name__ == "__main__":
    main()

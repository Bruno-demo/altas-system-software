from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


DOT_SHORT = "...................."
DOT_MED = "................................"
DOT_LONG = "................................................"


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text), style)


def build_pdf(pdf_path: Path) -> None:
    styles = getSampleStyleSheet()

    title = ParagraphStyle(
        "ContractTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=20,
        alignment=1,
        spaceAfter=4,
        textTransform="uppercase",
    )
    sub = ParagraphStyle(
        "ContractSub",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=12,
        alignment=1,
        spaceAfter=8,
    )
    section = ParagraphStyle(
        "ContractSection",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        spaceBefore=4,
        spaceAfter=3,
        textTransform="uppercase",
    )
    body = ParagraphStyle(
        "ContractBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=12,
        spaceAfter=2,
    )
    bullet = ParagraphStyle(
        "ContractBullet",
        parent=body,
        leftIndent=1,
        spaceAfter=1,
    )
    small = ParagraphStyle(
        "ContractSmall",
        parent=body,
        fontSize=8.5,
        leading=10.5,
    )

    flow = [
        p("AL-TAHS System Purchase Agreement", title),
        p(f"Agreement Date: {DOT_MED}   Place: {DOT_MED}", sub),
        p(
            "This Agreement is entered between: Developer/Seller: "
            f"{DOT_LONG} and Client/Buyer: {DOT_LONG}.",
            body,
        ),
        p("1. Scope of Delivery", section),
        p(
            "The Seller delivers the AL-TAHS business management system "
            "(configured modules, deployment setup, and onboarding handover) "
            "as demonstrated and agreed by both parties.",
            body,
        ),
        p("2. Commercial Terms", section),
    ]

    terms_table = Table(
        [
            ["Total System Cost", "RWF 2,000,000 (Two Million Rwandan Francs only)."],
            ["Payment Method", "Full one-time payment only."],
            ["Installments", "Not accepted."],
            ["Payment Due Date", DOT_LONG],
            [
                "Hosting & Infrastructure Fees",
                "Client responsibility. All infrastructure costs are paid by the Client, "
                "including hosting/VPS, domain, SSL, internet/VPN, backup storage, "
                "and any third-party service fees.",
            ],
        ],
        colWidths=[58 * mm, 124 * mm],
    )
    terms_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    flow.append(terms_table)
    flow.extend(
        [
            p("3. Support Commitment (12 Months)", section),
            p(
                "The Seller will provide operational support for one (1) year from the signing date, including:",
                body,
            ),
            ListFlowable(
                [
                    ListItem(p("Bug investigation and correction for delivered features.", bullet)),
                    ListItem(p("User guidance and issue troubleshooting when requested by the Client.", bullet)),
                    ListItem(p("Reasonable minor adjustments aligned with existing workflows.", bullet)),
                    ListItem(p("Remote/onsite support scheduling by mutual agreement.", bullet)),
                ],
                bulletType="bullet",
                leftIndent=14,
                bulletFontName="Helvetica",
                bulletFontSize=8.5,
                spaceAfter=2,
            ),
            p("4. General Conditions", section),
            ListFlowable(
                [
                    ListItem(p("Major new features outside current scope require a separate written agreement.", bullet)),
                    ListItem(p("The Client shall provide required access, responsible users, and infrastructure cooperation.", bullet)),
                    ListItem(p("The Client pays all hosting and operational infrastructure charges from go-live onward.", bullet)),
                    ListItem(p("This Agreement becomes effective upon signature by both parties.", bullet)),
                ],
                bulletType="bullet",
                leftIndent=14,
                bulletFontName="Helvetica",
                bulletFontSize=8.5,
                spaceAfter=3,
            ),
        ]
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
        [[Paragraph(seller_block, body), Paragraph(client_block, body)]],
        colWidths=[91 * mm, 91 * mm],
    )
    sign_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.8, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    flow.append(sign_table)
    flow.append(Spacer(1, 4))
    flow.append(
        p(f"Witness (optional): {DOT_LONG}   Signature: {DOT_MED}", small)
    )

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
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

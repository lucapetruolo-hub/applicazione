"""Excel gratuito "Entrate e uscite" per i professionisti
(docs/changelog/2026-11-19-entrate-e-uscite.md).

Genera apps/web/public/entrate-e-uscite-professionisti.xlsx con formule vere
(niente valori fissi), celle delle formule bloccate e tre fogli da compilare.
Quando cambia il nome del sito (BRAND in packages/shared/src/brand.ts) si
rigenera:

    python3 apps/web/scripts/genera-excel-entrate-uscite.py [--prova file.xlsx]

Con --prova scrive anche una copia con 10 righe inventate, per controllare i
totali (aprendola con LibreOffice in modalità headless si ricalcolano le formule).
"""

import re
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parents[3]
BRAND = re.search(r'name:\s*"([^"]+)"', (ROOT / "packages/shared/src/brand.ts").read_text()).group(1)
OUT = ROOT / "apps/web/public/entrate-e-uscite-professionisti.xlsx"

VERDE = "1E6B6E"
INCHIOSTRO = "0F3B3B"
VELO = "DFF0F0"
CREMA = "FAF2E8"
GRIGIO = "5E5A54"
EURO = '#,##0.00 "€";-#,##0.00 "€"'
ROWS = 200  # righe pronte (colori e controlli) in Entrate e Uscite; i totali contano la colonna intera

MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]
CATEGORIE = ["Materiali", "Veicolo e carburante", "Attrezzi", "Telefono e internet", "Assicurazione", "Corsi e certificazioni", "Contributi INPS", "Altro"]
PAGAMENTI = ["Contanti", "Bonifico", "Carta o POS", "Online sul sito", "Altro"]
COEFFICIENTI = [
    ("Costruzioni e impianti (idraulico, elettricista, imbianchino)", 0.86),
    ("Altri servizi (pulizie, giardiniere, traslochi)", 0.67),
    ("Attività professionali e tecniche", 0.78),
    ("Intermediari del commercio", 0.62),
    ("Commercio e ristorazione", 0.40),
    ("Commercio ambulante non alimentare", 0.54),
]

thin = Side(style="thin", color="E7E0D7")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD_FILL = PatternFill("solid", fgColor=VERDE)
HEAD_FONT = Font(bold=True, color="FFFFFF", size=12)
TITLE_FONT = Font(bold=True, color=INCHIOSTRO, size=18)
NOTE_FONT = Font(color=GRIGIO, size=11, italic=True)
UNLOCKED = Protection(locked=False)


def header(ws, row, labels, widths):
    for col, (label, width) in enumerate(zip(labels, widths), start=1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.fill = HEAD_FILL
        cell.font = HEAD_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = BORDER
        ws.column_dimensions[cell.column_letter].width = width
    ws.row_dimensions[row].height = 30


def title(ws, text, note):
    ws["A1"] = text
    ws["A1"].font = TITLE_FONT
    ws["A2"] = note
    ws["A2"].font = NOTE_FONT
    ws.row_dimensions[1].height = 28


def build(sample: bool) -> Workbook:
    wb = Workbook()

    # --- Come si usa -----------------------------------------------------------
    info = wb.active
    info.title = "Come si usa"
    info.sheet_view.showGridLines = False
    info.column_dimensions["A"].width = 100
    lines = [
        ("Entrate e uscite del tuo lavoro", TITLE_FONT),
        (f"Foglio gratuito di {BRAND} per artigiani e professionisti.", Font(color=GRIGIO, size=12)),
        ("", None),
        ("1. Nel foglio Entrate scrivi ogni soldo che ricevi, nel giorno in cui lo ricevi (non il giorno del lavoro).", Font(size=12)),
        ("2. Nel foglio Uscite scrivi ogni spesa: materiali, carburante, attrezzi, telefono, contributi INPS.", Font(size=12)),
        ("3. Nel foglio Riepilogo trovi da solo i totali di ogni mese e quanto ti resta.", Font(size=12)),
        ("4. Se sei nel regime forfettario, nel Riepilogo puoi vedere una stima dell'imposta da mettere da parte.", Font(size=12)),
        ("", None),
        ("Le date si scrivono così: 15/03/2026. Gli importi senza il simbolo €: 125,50.", Font(size=12)),
        ("Conserva sempre scontrini e fatture: questo foglio è un aiuto, non li sostituisce.", Font(size=12)),
        ("A fine anno dallo al tuo commercialista: gli farà risparmiare tempo. Le stime vanno sempre confermate con lui.", Font(size=12, bold=True)),
        ("", None),
        (f"Su {BRAND} lo stesso lavoro si fa da solo: i pagamenti dei lavori entrano già nei conti e le spese si segnano con la foto dello scontrino.", Font(color=VERDE, size=12, bold=True)),
    ]
    for i, (text, font) in enumerate(lines, start=1):
        cell = info.cell(row=i, column=1, value=text)
        if font:
            cell.font = font
        cell.alignment = Alignment(wrap_text=True, vertical="top")

    # --- Entrate ----------------------------------------------------------------
    inc = wb.create_sheet("Entrate")
    title(inc, "Entrate", "Un soldo ricevuto per riga, nel giorno in cui lo ricevi.")
    header(inc, 4, ["Data", "Cliente o lavoro", "Come ti ha pagato", "Importo (€)", "Note"], [14, 40, 20, 16, 40])
    inc.freeze_panes = "A5"
    pay = DataValidation(type="list", formula1='"' + ",".join(PAGAMENTI) + '"', allow_blank=True)
    inc.add_data_validation(pay)
    pay.add(f"C5:C{ROWS + 4}")
    # --- Uscite -----------------------------------------------------------------
    out = wb.create_sheet("Uscite")
    title(out, "Uscite", "Una spesa per riga, nel giorno in cui la paghi.")
    header(out, 4, ["Data", "Tipo di spesa", "Descrizione", "Importo (€)", "Note"], [14, 26, 40, 16, 40])
    out.freeze_panes = "A5"
    cat = DataValidation(type="list", formula1='"' + ",".join(CATEGORIE) + '"', allow_blank=True)
    out.add_data_validation(cat)
    cat.add(f"B5:B{ROWS + 4}")

    for ws in (inc, out):
        date_ok = DataValidation(type="date", operator="greaterThan", formula1="DATE(2000,1,1)", allow_blank=True, showErrorMessage=True, errorTitle="Data", error="Scrivi la data così: 15/03/2026")
        amount_ok = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True, showErrorMessage=True, errorTitle="Importo", error="Scrivi l'importo senza segno meno: 125,50")
        ws.add_data_validation(date_ok)
        ws.add_data_validation(amount_ok)
        date_ok.add(f"A5:A{ROWS + 4}")
        amount_ok.add(f"D5:D{ROWS + 4}")
        for r in range(5, ROWS + 5):
            ws.cell(row=r, column=1).number_format = "DD/MM/YYYY"
            ws.cell(row=r, column=4).number_format = EURO
            for c in range(1, 6):
                ws.cell(row=r, column=c).protection = UNLOCKED
                ws.cell(row=r, column=c).border = BORDER
            if r % 2 == 0:
                for c in range(1, 6):
                    ws.cell(row=r, column=c).fill = PatternFill("solid", fgColor="FBF8F4")

    # --- Riepilogo ------------------------------------------------------------------
    rep = wb.create_sheet("Riepilogo", 1)
    rep.sheet_view.showGridLines = False
    title(rep, "Riepilogo", "Si calcola da solo dai fogli Entrate e Uscite. Scrivi solo nelle celle azzurre.")
    rep["A3"] = "Anno"
    rep["A3"].font = Font(bold=True, size=12)
    rep["B3"] = 2026
    rep["B3"].fill = PatternFill("solid", fgColor=VELO)
    rep["B3"].protection = UNLOCKED
    rep["B3"].font = Font(bold=True, size=12)
    header(rep, 5, ["Mese", "Entrate", "Uscite", "Ti resta"], [34, 18, 18, 18])
    # Colonne intere: anche le righe aggiunte sotto le 200 pronte entrano nei totali
    # (le righe del titolo sono testo e i criteri sulla data le saltano).
    rng_inc = "Entrate!$A:$A"
    rng_out = "Uscite!$A:$A"
    amt_inc = "Entrate!$D:$D"
    amt_out = "Uscite!$D:$D"
    for i, mese in enumerate(MESI):
        r = 6 + i
        m = i + 1
        rep.cell(row=r, column=1, value=mese)
        # SUMIFS: funziona uguale in Excel, Numbers, Google Fogli e LibreOffice, e salta le righe vuote o scritte male.
        start, end = f"DATE($B$3,{m},1)", f"DATE($B$3,{m + 1},1)" if m < 12 else "DATE($B$3+1,1,1)"
        rep.cell(row=r, column=2, value=f'=SUMIFS({amt_inc},{rng_inc},">="&{start},{rng_inc},"<"&{end})')
        rep.cell(row=r, column=3, value=f'=SUMIFS({amt_out},{rng_out},">="&{start},{rng_out},"<"&{end})')
        rep.cell(row=r, column=4, value=f"=B{r}-C{r}")
        for c in range(1, 5):
            cell = rep.cell(row=r, column=c)
            cell.border = BORDER
            if c > 1:
                cell.number_format = EURO
    total = 18
    rep.cell(row=total, column=1, value="Totale dell'anno")
    for c, col in ((2, "B"), (3, "C"), (4, "D")):
        rep.cell(row=total, column=c, value=f"=SUM({col}6:{col}17)").number_format = EURO
    for c in range(1, 5):
        cell = rep.cell(row=total, column=c)
        cell.font = Font(bold=True, size=12, color=INCHIOSTRO)
        cell.fill = PatternFill("solid", fgColor=CREMA)
        cell.border = BORDER

    # Uscite per tipo
    rep["F5"] = "Uscite per tipo"
    rep["G5"] = "Anno"
    for cell in (rep["F5"], rep["G5"]):
        cell.fill = HEAD_FILL
        cell.font = HEAD_FONT
        cell.border = BORDER
    rep.column_dimensions["E"].width = 4
    rep.column_dimensions["F"].width = 28
    rep.column_dimensions["G"].width = 18
    cat_rng = "Uscite!$B:$B"
    for i, name in enumerate(CATEGORIE):
        r = 6 + i
        rep.cell(row=r, column=6, value=name).border = BORDER
        cell = rep.cell(row=r, column=7, value=f'=SUMIFS({amt_out},{cat_rng},F{r},{rng_out},">="&DATE($B$3,1,1),{rng_out},"<"&DATE($B$3+1,1,1))')
        cell.number_format = EURO
        cell.border = BORDER

    # Stima del forfettario
    rep["A21"] = "Solo per il regime forfettario: stima dell'imposta"
    rep["A21"].font = Font(bold=True, size=14, color=INCHIOSTRO)
    rep["A22"] = "Una stima da confermare con il tuo commercialista. Nel forfettario le spese non abbassano le tasse: conta il coefficiente. Si tolgono solo i contributi INPS pagati."
    rep["A22"].font = NOTE_FONT
    rep["A22"].alignment = Alignment(wrap_text=True)
    rep.merge_cells("A22:D22")
    rep.row_dimensions[22].height = 44
    rep["A23"] = "Il tuo lavoro (coefficiente)"
    rep["B23"] = COEFFICIENTI[0][0]
    rep.merge_cells("B23:D23")
    coeff_list = DataValidation(type="list", formula1="=$I$6:$I$11", allow_blank=False)
    rep.add_data_validation(coeff_list)
    coeff_list.add("B23")
    rep["A24"] = "Aliquota (5% i primi cinque anni, se hai i requisiti; poi 15%)"
    rep["B24"] = 0.15
    rep["B24"].number_format = "0%"
    rate_list = DataValidation(type="list", formula1='"5%,15%"', allow_blank=False)
    rep.add_data_validation(rate_list)
    rate_list.add("B24")
    for ref in ("B23", "B24"):
        rep[ref].fill = PatternFill("solid", fgColor=VELO)
        rep[ref].protection = UNLOCKED
        rep[ref].font = Font(bold=True)
    rep["A25"] = "Reddito stimato"
    rep["B25"] = '=MAX(0,B18*IFERROR(VLOOKUP(B23,$I$6:$J$11,2,FALSE),0)-G12)'
    rep["A26"] = "Imposta da mettere da parte"
    rep["B26"] = "=ROUND(B25*B24,2)"
    for ref in ("B25", "B26"):
        rep[ref].number_format = EURO
    rep["A26"].font = Font(bold=True, size=12, color=INCHIOSTRO)
    rep["B26"].font = Font(bold=True, size=12, color=INCHIOSTRO)
    rep["A27"] = '=IF(B18>100000,"Hai incassato più di 100.000 €: si esce dal forfettario già quest\'anno. Senti subito il tuo commercialista.",IF(B18>85000,"Hai incassato più di 85.000 €: dall\'anno prossimo il forfettario non vale più. Senti il tuo commercialista.",IF(B18>=70000,"Ti stai avvicinando agli 85.000 € del forfettario: parlane con il tuo commercialista per tempo.","")))'
    rep["A27"].font = Font(bold=True, color="8A5A00")
    rep.merge_cells("A27:D27")
    rep.column_dimensions["A"].width = 52
    # Tabella dei coefficienti (legge 190/2014), a destra.
    rep["I5"] = "Coefficienti del forfettario"
    rep["J5"] = "%"
    for cell in (rep["I5"], rep["J5"]):
        cell.fill = HEAD_FILL
        cell.font = HEAD_FONT
    rep.column_dimensions["H"].width = 4
    rep.column_dimensions["I"].width = 58
    rep.column_dimensions["J"].width = 8
    for i, (label, value) in enumerate(COEFFICIENTI):
        rep.cell(row=6 + i, column=9, value=label).border = BORDER
        cell = rep.cell(row=6 + i, column=10, value=value)
        cell.number_format = "0%"
        cell.border = BORDER
    rep["I12"] = "Il codice ATECO giusto te lo dice il commercialista."
    rep["I12"].font = NOTE_FONT
    rep.conditional_formatting.add("D6:D18", FormulaRule(formula=["D6<0"], font=Font(color="5E5A54")))
    rep["A30"] = f"Su {BRAND} questi conti si fanno da soli, con i lavori già dentro."
    rep["A30"].font = Font(bold=True, color=VERDE)
    # Bloccato senza password: le formule non si cancellano per sbaglio, ma chi vuole può sbloccare.
    rep.protection.sheet = True
    rep.protection.formatCells = False
    rep.protection.formatColumns = False

    if sample:
        entrate = [("2026-01-08", "Perdita bagno, Rossi", "Contanti", 180), ("2026-01-20", "Caldaia, Bianchi", "Bonifico", 450.5), ("2026-02-03", "Lavandino, Verdi", "Online sul sito", 95),
                   ("2026-03-15", "Impianto cucina", "Bonifico", 1200), ("2026-03-28", "Rubinetto", "Carta o POS", 60)]
        uscite = [("2026-01-05", "Materiali", "Raccordi", 42.3), ("2026-01-31", "Veicolo e carburante", "Gasolio", 70), ("2026-02-16", "Contributi INPS", "Rata", 1100),
                  ("2026-03-02", "Attrezzi", "Trapano", 149.9), ("2026-03-10", "Telefono e internet", "Ricarica", 15)]
        from datetime import date
        for i, (d, who, how, amount) in enumerate(entrate):
            y, m, dd = map(int, d.split("-"))
            inc.cell(row=5 + i, column=1, value=date(y, m, dd))
            inc.cell(row=5 + i, column=2, value=who)
            inc.cell(row=5 + i, column=3, value=how)
            inc.cell(row=5 + i, column=4, value=amount)
        for i, (d, kind, what, amount) in enumerate(uscite):
            y, m, dd = map(int, d.split("-"))
            out.cell(row=5 + i, column=1, value=date(y, m, dd))
            out.cell(row=5 + i, column=2, value=kind)
            out.cell(row=5 + i, column=3, value=what)
            out.cell(row=5 + i, column=4, value=amount)

    wb.active = 0
    wb.properties.title = "Entrate e uscite"
    wb.properties.creator = BRAND
    return wb


if __name__ == "__main__":
    build(False).save(OUT)
    print(f"Scritto {OUT.relative_to(ROOT)}")
    if "--prova" in sys.argv:
        path = Path(sys.argv[sys.argv.index("--prova") + 1])
        build(True).save(path)
        print(f"Copia con 10 righe di prova: {path}")

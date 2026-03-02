"""
Extrae datos del RETIRADOS.xlsx y los guarda como JSON.
Uso: python3 extractRetirados.py
"""
import zipfile
import xml.etree.ElementTree as ET
import json
import os
import datetime

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
XLSX_PATH = os.path.join(os.path.dirname(__file__), '..', 'RETIRADOS.xlsx')
OUT_PATH = os.path.join(os.path.dirname(__file__), 'retirados_data.json')


def excel_serial_to_date(serial):
    """Convierte serial de fecha Excel a string ISO (YYYY-MM-DD)."""
    if not serial:
        return None
    try:
        n = float(serial)
        if n <= 0:
            return None
        # Excel serial: días desde 1900-01-01 (con bug del año bisiesto 1900)
        utc_days = int(n) - 25569
        dt = datetime.datetime(1970, 1, 1) + datetime.timedelta(days=utc_days)
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return None


def read_shared_strings(z):
    with z.open('xl/sharedStrings.xml') as f:
        tree = ET.parse(f)
        root = tree.getroot()
        strings = []
        for si in root.findall(f'{{{NS}}}si'):
            t = si.find(f'{{{NS}}}t')
            if t is not None:
                strings.append(t.text or '')
            else:
                parts = si.findall(f'.//{{{NS}}}t')
                strings.append(''.join(p.text or '' for p in parts))
        return strings


def col_letter_to_index(col):
    """Convierte letra(s) de columna a índice numérico (A=0, B=1, ...)."""
    result = 0
    for char in col:
        result = result * 26 + (ord(char.upper()) - ord('A') + 1)
    return result - 1


def parse_sheet(z, strings):
    with z.open('xl/worksheets/sheet1.xml') as f:
        headers = {}      # col_letter -> header_name
        rows = []

        for event, elem in ET.iterparse(f, events=['end']):
            tag = elem.tag.replace(f'{{{NS}}}', '')
            if tag == 'row':
                row_num = int(elem.get('r', 0))
                cells = {}
                for c in elem:
                    ref = c.get('r', '')
                    col = ''.join(ch for ch in ref if ch.isalpha())
                    t = c.get('t', '')
                    v = c.find(f'{{{NS}}}v')
                    if v is not None and v.text is not None:
                        if t == 's':
                            cells[col] = strings[int(v.text)]
                        else:
                            cells[col] = v.text

                if cells:
                    if row_num == 1:
                        headers = cells
                    else:
                        # Mapear columna -> nombre de columna -> valor
                        row_dict = {}
                        for col, val in cells.items():
                            header = headers.get(col, col)
                            row_dict[header] = val
                        if row_dict:
                            rows.append(row_dict)

                elem.clear()

        return rows


def clean(v):
    if v is None:
        return ''
    return str(v).strip()


def main():
    print(f'Leyendo {XLSX_PATH}...')
    with zipfile.ZipFile(XLSX_PATH, 'r') as z:
        strings = read_shared_strings(z)
        print(f'  Shared strings: {len(strings)}')
        rows = parse_sheet(z, strings)
        print(f'  Filas con datos: {len(rows)}')

    # Procesar y limpiar datos
    people = []
    sin_retiro = 0
    sin_email = 0

    for r in rows:
        nombre = clean(r.get('APELLIDOS Y NOMBRES'))
        cedula = clean(r.get('CEDULA'))
        email_corp = clean(r.get('CORREO CORPORATIVO')).lower().replace(' ', '')
        email_personal = clean(r.get('CORREO ELECTRONICO PERSONAL')).lower().replace(' ', '')

        # Elegir email válido
        def valid_email(e):
            return '@' in e and '.' in e.split('@')[-1]

        email = email_corp if valid_email(email_corp) else (email_personal if valid_email(email_personal) else None)

        fecha_retiro_raw = r.get('FECHA RETIRO')
        fecha_retiro = excel_serial_to_date(fecha_retiro_raw)
        fecha_ingreso = excel_serial_to_date(r.get('FECHA DE INGRESO'))
        fecha_nacimiento = excel_serial_to_date(r.get('FECHA DE NACIMIENTO'))

        if not fecha_retiro:
            sin_retiro += 1
            print(f'  ⚠️  Sin fecha retiro: {nombre} ({cedula})')

        if not email:
            sin_email += 1
            print(f'  ⚠️  Sin email: {nombre} ({cedula})')

        motivo_raw = clean(r.get('MOTIVO', '')).lower()
        if 'voluntar' in motivo_raw or 'renuncia' in motivo_raw:
            reason = 'voluntario'
        elif motivo_raw:
            reason = 'involuntario'
        else:
            reason = ''

        person = {
            'nombre': nombre,
            'cedula': cedula,
            'email': email,
            'fechaRetiro': fecha_retiro,
            'fechaIngreso': fecha_ingreso,
            'fechaNacimiento': fecha_nacimiento,
            'motivo': clean(r.get('MOTIVO', '')),
            'motivoTipo': reason,
            'justificacionRetiro': clean(r.get('JUSTIFICACIÓN RETIRO', '')),
            'empresa': clean(r.get('EMPRESA', '')),
            'proyecto': clean(r.get('PROYECTO', '')),
            'regional': clean(r.get('REGIONAL', '')),
            'area': clean(r.get('CUENTA ANALITICA', '')),
            'cargo': clean(r.get('CARGO', '')),
            'sueldo': r.get('Sueldo', '0'),
            'tipoContrato': clean(r.get('TIPO DE CONTRATO', '')),
            'estado': clean(r.get('ESTADO', '')),
            # Datos extra para crear el usuario
            'genero': clean(r.get('GENERO', '')),
            'estadoCivil': clean(r.get('ESTADO CIVIL', '')),
            'telefonoPersonal': clean(r.get('TELEFONO PERSONAL', '')),
            'departamento': clean(r.get('DEPARTAMENTO', '')),
            'ciudad': clean(r.get('CIUDAD DE RESIDENCIA', '')),
            'nivelAcademico': clean(r.get('NIVEL ACADEMICA', '')),
            'profesion': clean(r.get('PROFESION', '')),
            'eps': clean(r.get('EPS', '')),
            'afp': clean(r.get('AFP', '')),
            'entidadBancaria': clean(r.get('ENTIDAD BANCARIA', '')),
            'tipoCuenta': clean(r.get('TIPO DE CUENTA', '')),
            'numeroCuenta': clean(r.get('NUMERO DE CUENTA', '')),
        }
        people.append(person)

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(people, f, ensure_ascii=False, indent=2)

    print(f'\n========== RESUMEN ==========')
    print(f'Total personas: {len(people)}')
    print(f'Sin fecha retiro: {sin_retiro}')
    print(f'Sin email: {sin_email}')
    print(f'JSON guardado en: {OUT_PATH}')


if __name__ == '__main__':
    main()

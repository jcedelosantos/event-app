export type CsvRow = Record<string, string>;

// Parser mínimo pero correcto (campos entre comillas con comas/comillas escapadas "", separador
// coma, fin de línea \n o \r\n) — suficiente para los CSV que exporta Excel/Google Sheets, sin
// depender de una librería externa para un caso de uso tan acotado.
export function parseCsv(text: string): CsvRow[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;

	while (i < text.length) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += char;
			i++;
			continue;
		}
		if (char === '"') {
			inQuotes = true;
			i++;
			continue;
		}
		if (char === ',') {
			row.push(field);
			field = '';
			i++;
			continue;
		}
		if (char === '\r') {
			i++;
			continue;
		}
		if (char === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i++;
			continue;
		}
		field += char;
		i++;
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}

	const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
	const [header, ...dataRows] = nonEmptyRows;
	if (!header) return [];
	const keys = header.map((h) => h.trim());
	return dataRows.map((cells) => {
		const obj: CsvRow = {};
		keys.forEach((key, idx) => {
			obj[key] = (cells[idx] ?? '').trim();
		});
		return obj;
	});
}

// Los CSV reales (exportados de sistemas viejos, hechos a mano en Excel) casi nunca tienen el header
// exacto que uno espera — esto busca por varios nombres alternativos, case-insensitive, y devuelve
// el primero que tenga valor.
export function pickColumn(row: CsvRow, ...candidates: string[]): string {
	for (const candidate of candidates) {
		const key = Object.keys(row).find((h) => h.trim().toLowerCase() === candidate.toLowerCase());
		if (key && row[key]) return row[key];
	}
	return '';
}

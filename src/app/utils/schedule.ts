export function generateFullCalendarMatrix(year: number, month: number): { day: number; inMonth: boolean }[][] {
	const matrix: { day: number; inMonth: boolean }[][] = [];
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const totalDays = lastDay.getDate();
	const startDay = firstDay.getDay();

	const prevMonth = new Date(year, month, 0);
	const prevMonthDays = prevMonth.getDate();
	const prevMonthStart = prevMonthDays - startDay + 1;

	let currentDay = 1;
	let week: { day: number; inMonth: boolean }[] = [];

	// Rellenar días del mes anterior
	for (let i = 0; i < startDay; i++) {
		week.push({ day: prevMonthStart + i, inMonth: false });
	}

	// Rellenar mes actual
	while (currentDay <= totalDays) {
		week.push({ day: currentDay, inMonth: true });

		if (week.length === 7) {
			matrix.push(week);
			week = [];
		}

		currentDay++;
	}

	// Rellenar días del mes siguiente
	let nextMonthDay = 1;
	while (week.length > 0 && week.length < 7) {
		week.push({ day: nextMonthDay++, inMonth: false });
	}

	if (week.length === 7) matrix.push(week);

	return matrix;
}

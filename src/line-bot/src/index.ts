import { api, dto, knowledge, models } from '@ast24/hmbt-v5-lib';

const DEFAULT_API_BASE_URL = `https://${knowledge.HOSTNAMES.API}`;
const DEFAULT_WEB_BASE_URL = `https://${knowledge.HOSTNAMES.WEB}`;
const DEFAULT_ADMIN_MESSENGER_URL = `https://${knowledge.HOSTNAMES.ADMIN_MESSENGER}`;
const WEEKDAY_LABELS_JP = ['日', '月', '火', '水', '木', '金', '土'];

const ACTION_SCHEDULE = 'schedule_week';
const ACTION_PERSONAL_TIMETABLE = 'personal_timetable';
const ACTION_CAFE = 'cafe_menu';
const ACTION_NEXT_TRAIN = 'next_train';
const ACTION_MENU = 'menu';

type SerializedOption<T> = { _value: T | null } | T | null | undefined;

type ApiErrorLike = {
	code?: unknown;
	message?: unknown;
	user_message?: unknown;
};

type UsersGetResponse = {
	users?: Array<{ user_id?: unknown }>;
};

type UsersTimetableResponse = {
	timetable?: unknown;
};

type UsersUserIdResponse = {
	user_info?: {
		grade?: unknown;
		homeclass?: unknown;
	};
};

type HomeClassTimetableResponse = {
	timetable?: unknown;
};

type UsersSchedulesResponse = {
	skd?: Array<ScheduleDay | null>;
};

type GlobalCafeMenuResponse = {
	cafe_menu?: Array<CafeMenuDay>;
};

type UsersWebUiSettingsResponse = {
	config?: unknown;
};

type GlobalTrainTimetableResponse = {
	timetable?: unknown;
};

type LineWebhookPayload = {
	events?: LineWebhookEvent[];
};

type LineWebhookEvent = {
	type?: unknown;
	replyToken?: unknown;
	source?: {
		userId?: unknown;
		type?: unknown;
	};
	postback?: {
		data?: unknown;
	};
	message?: {
		type?: unknown;
		text?: unknown;
	};
};

type ScheduleDay = {
	sess?: Array<SerializedOption<ScheduleSession>>;
	events?: unknown[];
	daily_memo?: SerializedOption<string>;
	cafeteria_open?: SerializedOption<boolean>;
	study_hall_open?: SerializedOption<boolean>;
};

type ScheduleSession = {
	course?: {
		type?: unknown;
		id?: unknown;
		name?: unknown;
		timetable_position?: {
			dayofweek?: unknown;
			period?: unknown;
		};
	};
	room_id?: SerializedOption<string>;
	personal_memo?: SerializedOption<string>;
	shared_memo?: SerializedOption<string>;
};

type CafeMenuDay = {
	menus_as_str?: SerializedOption<unknown[]>;
	menus_as_img_url?: SerializedOption<string>;
	menus_as_img_preview_url?: SerializedOption<string>;
};

type DateParts = {
	year: number;
	month: number;
	day: number;
	dayOfWeek: number;
};

type ParsedPersonalSelection = {
	courseId: string;
	roomId: string | null;
};

type ParsedClassWeeklySess =
	| {
			type: 'normal';
			courseId: string;
			roomIds: string[];
	  }
	| {
			type: 'select';
			selectionId: string;
	  };

type ScheduleFetchResult =
	| {
			type: 'ok';
			skd: Array<ScheduleDay | null>;
	  }
	| {
			type: 'profile_incomplete';
	  }
	| {
			type: 'user_missing';
	  };

type Env = {
	LINE_CHANNEL_SECRET?: string;
	LINE_CHANNEL_ACCESS_TOKEN?: string;
	SYSTEM_ACCESS_TOKEN?: string;
	API_CF2CF_GUARD_KEY?: string;
	ADMIN_MESSENGER_URL?: string;
	API_BASE_URL?: string;
	WEB_BASE_URL?: string;
};

type WorkerConfig = {
	lineChannelSecret: string;
	lineChannelAccessToken: string;
	systemAccessToken: string;
	apiCf2CfGuardKey: string | null;
	adminMessengerUrl: string;
	apiBaseUrl: string;
	webBaseUrl: string;
};

class ApiRequestError<TPayload = unknown> extends Error {
	public readonly status: number;
	public readonly payload: TPayload | null;

	public constructor(status: number, payload: TPayload | null, message?: string) {
		super(message || `API request failed with status ${status}`);
		this.name = 'ApiRequestError';
		this.status = status;
		this.payload = payload;
	}
}

function toStringValue(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function requiredEnv(env: Env, key: keyof Env): string {
	const value = toStringValue(env[key]).trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${String(key)}`);
	}
	return value;
}

function trimTrailingSlash(url: string): string {
	return url.replace(/\/+$/, '');
}

function loadConfig(env: Env): WorkerConfig {
	const guardKey = toStringValue(env.API_CF2CF_GUARD_KEY).trim();
	return {
		lineChannelSecret: requiredEnv(env, 'LINE_CHANNEL_SECRET'),
		lineChannelAccessToken: requiredEnv(env, 'LINE_CHANNEL_ACCESS_TOKEN'),
		systemAccessToken: requiredEnv(env, 'SYSTEM_ACCESS_TOKEN'),
		apiCf2CfGuardKey: guardKey.length > 0 ? guardKey : null,
		adminMessengerUrl: trimTrailingSlash(toStringValue(env.ADMIN_MESSENGER_URL, DEFAULT_ADMIN_MESSENGER_URL)),
		apiBaseUrl: trimTrailingSlash(toStringValue(env.API_BASE_URL, DEFAULT_API_BASE_URL)),
		webBaseUrl: trimTrailingSlash(toStringValue(env.WEB_BASE_URL, DEFAULT_WEB_BASE_URL)),
	};
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function isPhysicalNetworkError(error: unknown): boolean {
	if (!(error instanceof TypeError)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return message.includes('fetch') || message.includes('network') || message.includes('connection');
}

async function reportAdminMessengerError(
	config: WorkerConfig,
	params: {
		summary: string;
		message: string;
		status?: number;
		code?: string;
		stack?: string;
		level?: models.admin_messenger.AdminMessengerLevel;
		context?: Record<string, unknown>;
	},
): Promise<void> {
	try {
		const response = await fetch(config.adminMessengerUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				source: 'line-bot',
				service: 'line-bot',
				level: params.level ?? 'error',
				summary: params.summary,
				message: params.message,
				timestamp_iso: new Date().toISOString(),
				status: params.status,
				code: params.code,
				stack: params.stack,
				environment: toStringValue((globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV, ''),
				context: {
					...(params.context ?? {}),
					error_message: params.message,
				},
			} satisfies models.admin_messenger.AdminMessengerErrorReport),
		});

		if (!response.ok) {
			console.error('Failed to post admin-messenger report', response.status, await response.text());
		}
	} catch (error) {
		console.error('Failed to send admin-messenger report', error);
	}
}

function decodeJson<T>(text: string): T | null {
	if (!text || text.trim().length === 0) {
		return null;
	}

	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

function unwrapOption<T>(value: SerializedOption<T>): T | null {
	if (typeof value === 'object' && value !== null && '_value' in value) {
		return (value as { _value: T | null })._value ?? null;
	}
	return (value ?? null) as T | null;
}

function isHttpsUrl(value: unknown): value is string {
	return typeof value === 'string' && /^https:\/\//i.test(value);
}

function toJstDateParts(date: Date): DateParts {
	const jstTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
	return {
		year: jstTime.getUTCFullYear(),
		month: jstTime.getUTCMonth() + 1,
		day: jstTime.getUTCDate(),
		dayOfWeek: jstTime.getUTCDay(),
	};
}

function nowMinutesJst(): number {
	const jstTime = new Date(Date.now() + 9 * 60 * 60 * 1000);
	return jstTime.getUTCHours() * 60 + jstTime.getUTCMinutes();
}

function addDays(dateParts: DateParts, offsetDays: number): DateParts {
	const utcBase = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
	utcBase.setUTCDate(utcBase.getUTCDate() + offsetDays);
	return {
		year: utcBase.getUTCFullYear(),
		month: utcBase.getUTCMonth() + 1,
		day: utcBase.getUTCDate(),
		dayOfWeek: utcBase.getUTCDay(),
	};
}

function formatDateLabel(dateParts: DateParts): string {
	const weekday = WEEKDAY_LABELS_JP[dateParts.dayOfWeek] ?? '?';
	return `${dateParts.month}/${dateParts.day}(${weekday})`;
}

function parseTimeOnlyLike(value: unknown, fallbackMinutes: number): number {
	if (typeof value === 'string') {
		const matched = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
		if (matched) {
			const h = Number.parseInt(matched[1], 10);
			const m = Number.parseInt(matched[2], 10);
			if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
				return h * 60 + m;
			}
		}
	}

	if (value && typeof value === 'object') {
		const h = Number((value as { h?: unknown }).h);
		const m = Number((value as { m?: unknown }).m);
		if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
			return h * 60 + m;
		}
	}

	return fallbackMinutes;
}

function parseTrainHourMap(raw: unknown): Record<string, number[]> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {};
	}

	const result: Record<string, number[]> = {};
	for (const [hourKey, minsRaw] of Object.entries(raw as Record<string, unknown>)) {
		const hour = Number.parseInt(hourKey, 10);
		if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
			continue;
		}
		if (!Array.isArray(minsRaw)) {
			continue;
		}
		const mins = minsRaw
			.map((m) => Number(m))
			.filter((m) => Number.isFinite(m) && m >= 0 && m <= 59)
			.map((m) => Math.trunc(m))
			.sort((a, b) => a - b);
		result[String(hour)] = mins;
	}
	return result;
}

function flattenTrainMinutes(map: Record<string, number[]>): number[] {
	const list: number[] = [];
	for (const [hourKey, mins] of Object.entries(map)) {
		const hour = Number.parseInt(hourKey, 10);
		if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
			continue;
		}
		for (const m of mins) {
			list.push(hour * 60 + m);
		}
	}
	list.sort((a, b) => a - b);
	return list;
}

function formatHm(totalMinutes: number): string {
	const hh = Math.floor(totalMinutes / 60) % 24;
	const mm = totalMinutes % 60;
	return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function prettifyId(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim();
}

function resolveCourseLabel(id: unknown): string {
	if (typeof id !== 'string') {
		return '授業';
	}

	const course = knowledge.course.Courses[id as keyof typeof knowledge.course.Courses] as
		| {
				shortDisplayName: string;
				displayName: string;
		  }
		| undefined;

	if (course) {
		return course.shortDisplayName || course.displayName;
	}

	return prettifyId(id);
}

function resolveRoomLabel(roomId: unknown): string | null {
	if (typeof roomId !== 'string') {
		return null;
	}

	const room = knowledge.room.Rooms[roomId as keyof typeof knowledge.room.Rooms] as { displayName: string } | undefined;

	if (!room) {
		return roomId;
	}

	return room.displayName;
}

function buildSessionLabel(session: ScheduleSession, period: number): string | null {
	const course = session.course;
	let subject = '授業';

	if (typeof course === 'object' && course !== null) {
		if (course.type === 'special' && typeof course.name === 'string') {
			subject = course.name;
		} else if (course.type === 'normal') {
			subject = resolveCourseLabel(course.id);
		}
	}

	const roomId = unwrapOption(session.room_id);
	const roomLabel = resolveRoomLabel(roomId);
	const roomText = roomLabel ? ` (${roomLabel})` : '';

	return `${period}：${subject}${roomText}`;
}

function resolveEventLabel(raw: unknown): string | null {
	if (typeof raw === 'string') {
		const compact = raw.trim();
		return compact.length > 0 ? compact : null;
	}

	if (typeof raw === 'object' && raw !== null) {
		const textCandidate = (raw as { text?: unknown }).text;
		if (typeof textCandidate === 'string' && textCandidate.trim().length > 0) {
			return textCandidate.trim();
		}

		const titleCandidate = (raw as { title?: unknown }).title;
		if (typeof titleCandidate === 'string' && titleCandidate.trim().length > 0) {
			return titleCandidate.trim();
		}
	}

	return null;
}

function truncateText(value: string, max: number): string {
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, max - 3)}...`;
}

function buildScheduleDaySummary(day: ScheduleDay | null): string {
	if (!day || typeof day !== 'object') {
		return '予定データなし';
	}

	const lines: string[] = [];

	const eventList = Array.isArray(day.events)
		? day.events.map((item) => resolveEventLabel(item)).filter((item): item is string => item !== null)
		: [];
	lines.push('[行事予定]');
	if (eventList.length === 0) {
		lines.push('・なし');
	} else {
		for (const event of eventList.slice(0, 3)) {
			lines.push(`・${event}`);
		}
	}

	lines.push('[時間割]');
	const sessList = Array.isArray(day.sess) ? day.sess : [];
	let renderedSessionCount = 0;

	for (let i = 0; i < sessList.length; i += 1) {
		const session = unwrapOption(sessList[i]);
		if (!session || typeof session !== 'object') {
			continue;
		}

		const period = i + 1;
		const label = buildSessionLabel(session, period);
		if (!label) {
			continue;
		}
		lines.push(`・${label}`);

		renderedSessionCount += 1;

		if (renderedSessionCount >= 7) {
			break;
		}
	}

	if (lines[lines.length - 1] === '[時間割]') {
		lines.push('・授業情報なし');
	}

	const cafeteriaOpen = unwrapOption(day.cafeteria_open);
	if (cafeteriaOpen === true) {
		lines.push('[カフェ] 営業あり');
	} else if (cafeteriaOpen === false) {
		lines.push('[カフェ] 営業なし');
	} else {
		lines.push('[カフェ] 情報なし');
	}

	const studyHallOpen = unwrapOption(day.study_hall_open);
	if (studyHallOpen === true) {
		lines.push('[自習室] 利用可');
	} else if (studyHallOpen === false) {
		lines.push('[自習室] 利用不可');
	}

	return truncateText(lines.join('\n'), 780);
}

function buildCafeDaySummary(menu: CafeMenuDay | null): string {
	if (!menu || typeof menu !== 'object') {
		return 'メニュー未登録';
	}

	const lines: string[] = [];
	const menus = unwrapOption(menu.menus_as_str);
	if (Array.isArray(menus)) {
		for (const item of menus.slice(0, 8)) {
			if (typeof item === 'string' && item.trim().length > 0) {
				lines.push(`・${item.trim()}`);
			}
		}
	}

	if (lines.length === 0) {
		lines.push('メニュー未登録');
	}

	const imageUrl = unwrapOption(menu.menus_as_img_url);
	if (isHttpsUrl(imageUrl)) {
		lines.push('画像あり');
	}

	return truncateText(lines.join('\n'), 380);
}

function buildScheduleFlexMessage(scheduleDays: Array<ScheduleDay | null>, today: DateParts): Record<string, unknown> {
	const bubbles: Record<string, unknown>[] = [];

	for (let i = 0; i < 7; i += 1) {
		const targetDate = addDays(today, i);
		const day = scheduleDays[i] ?? null;
		const isWeekend = targetDate.dayOfWeek === 0 || targetDate.dayOfWeek === 6;
		const headerBackground = targetDate.dayOfWeek === 0 ? '#FFCC99' : targetDate.dayOfWeek === 6 ? '#AFEEEE' : '#0B1F3A';
		const headerTextColor = isWeekend ? '#1F2937' : '#FFFFFF';

		bubbles.push({
			type: 'bubble',
			size: 'mega',
			header: {
				type: 'box',
				layout: 'vertical',
				backgroundColor: headerBackground,
				contents: [
					{
						type: 'text',
						text: formatDateLabel(targetDate),
						color: headerTextColor,
						weight: 'bold',
						align: 'center',
					},
				],
			},
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'sm',
				contents: [
					{
						type: 'text',
						text: buildScheduleDaySummary(day),
						wrap: true,
						size: 'xs',
						color: '#333333',
					},
				],
			},
		});
	}

	return {
		type: 'flex',
		altText: '今日から1週間の予定表',
		contents: {
			type: 'carousel',
			contents: bubbles,
		},
	};
}

function buildCafeFlexMessage(cafeMenus: CafeMenuDay[], today: DateParts): Record<string, unknown> {
	const bubbles: Record<string, unknown>[] = [];

	for (let i = 0; i < 4; i += 1) {
		const targetDate = addDays(today, i);
		const menu = cafeMenus[i] ?? null;

		bubbles.push({
			type: 'bubble',
			size: 'mega',
			header: {
				type: 'box',
				layout: 'vertical',
				backgroundColor: '#3B4D2D',
				contents: [
					{
						type: 'text',
						text: formatDateLabel(targetDate),
						color: '#FFFFFF',
						weight: 'bold',
						align: 'center',
					},
				],
			},
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'sm',
				contents: [
					{
						type: 'text',
						text: buildCafeDaySummary(menu),
						wrap: true,
						size: 'sm',
						color: '#333333',
					},
				],
			},
		});
	}

	return {
		type: 'flex',
		altText: '今日から数日分のカフェメニュー',
		contents: {
			type: 'carousel',
			contents: bubbles,
		},
	};
}

function parseSelectionId(value: unknown): string | null {
	if (typeof value !== 'string' || !/^[A-J]$/.test(value)) {
		return null;
	}
	return value;
}

function parseMapLike(raw: unknown): Array<[unknown, unknown]> {
	if (!Array.isArray(raw)) {
		return [];
	}

	const entries: Array<[unknown, unknown]> = [];
	for (const entry of raw) {
		if (!Array.isArray(entry) || entry.length < 2) {
			continue;
		}
		entries.push([entry[0], entry[1]]);
	}

	return entries;
}

function parsePersonalSelectionMap(raw: unknown): Map<string, ParsedPersonalSelection | null> {
	const result = new Map<string, ParsedPersonalSelection | null>();

	for (const [rawSelectionId, rawSelected] of parseMapLike(raw)) {
		const selectionId = parseSelectionId(rawSelectionId);
		if (!selectionId) {
			continue;
		}

		const selected = unwrapOption(rawSelected);
		if (!selected || typeof selected !== 'object') {
			result.set(selectionId, null);
			continue;
		}

		const courseId = toStringValue((selected as { course?: unknown }).course).trim();
		if (!courseId) {
			result.set(selectionId, null);
			continue;
		}

		const roomIdRaw = unwrapOption((selected as { room_id?: unknown }).room_id as SerializedOption<string>);
		const roomId = typeof roomIdRaw === 'string' && roomIdRaw.trim().length > 0 ? roomIdRaw : null;

		result.set(selectionId, {
			courseId,
			roomId,
		});
	}

	return result;
}

function parseHomeClassWeeklyTimetable(raw: unknown): Map<number, Array<ParsedClassWeeklySess | null>> {
	const result = new Map<number, Array<ParsedClassWeeklySess | null>>();

	for (const [rawWeekday, rawPeriods] of parseMapLike(raw)) {
		const weekdayParsed = Number.parseInt(String(rawWeekday), 10);
		if (!Number.isInteger(weekdayParsed) || weekdayParsed < 0 || weekdayParsed > 6) {
			continue;
		}

		if (!Array.isArray(rawPeriods)) {
			continue;
		}

		const periods: Array<ParsedClassWeeklySess | null> = [];
		for (let i = 0; i < rawPeriods.length; i += 1) {
			const period = rawPeriods[i];
			if (!period || typeof period !== 'object') {
				periods[i] = null;
				continue;
			}

			const type = (period as { type?: unknown }).type;
			if (type === 'select') {
				const selectionId = parseSelectionId((period as { selection_id?: unknown }).selection_id);
				if (!selectionId) {
					periods[i] = null;
					continue;
				}
				periods[i] = {
					type: 'select',
					selectionId,
				};
				continue;
			}

			if (type === 'normal') {
				const courseId = toStringValue((period as { course?: unknown }).course).trim();
				if (!courseId) {
					periods[i] = null;
					continue;
				}

				const roomListRaw = unwrapOption((period as { room_id?: unknown }).room_id as SerializedOption<unknown[]>);
				const roomIds = Array.isArray(roomListRaw)
					? roomListRaw.filter((room): room is string => typeof room === 'string' && room.trim().length > 0).map((room) => room.trim())
					: [];

				periods[i] = {
					type: 'normal',
					courseId,
					roomIds,
				};
				continue;
			}

			periods[i] = null;
		}

		result.set(weekdayParsed, periods);
	}

	return result;
}

function buildResolvedPersonalTimetableDaySummary(
	periods: Array<ParsedClassWeeklySess | null>,
	personalSelections: Map<string, ParsedPersonalSelection | null>,
): string {
	const lines: string[] = [];

	for (let i = 0; i < periods.length; i += 1) {
		const period = periods[i];
		if (!period) {
			continue;
		}

		if (period.type === 'normal') {
			const courseLabel = resolveCourseLabel(period.courseId);
			const roomLabels = period.roomIds
				.map((roomId) => resolveRoomLabel(roomId))
				.filter((roomName): roomName is string => typeof roomName === 'string' && roomName.length > 0);
			const roomText = roomLabels.length > 0 ? ` (${roomLabels.join('/')})` : '';
			lines.push(`${i + 1}限 ${courseLabel}${roomText}`);
			continue;
		}

		const selected = personalSelections.get(period.selectionId);
		if (!selected) {
			lines.push(`${i + 1}限 空き (選択 ${period.selectionId})`);
			continue;
		}

		const courseLabel = resolveCourseLabel(selected.courseId);
		const roomLabel = selected.roomId ? resolveRoomLabel(selected.roomId) : null;
		const roomText = roomLabel ? ` (${roomLabel})` : '';
		lines.push(`${i + 1}限 ${courseLabel}${roomText}`);
	}

	if (lines.length === 0) {
		return '授業情報なし';
	}

	return truncateText(lines.join('\n'), 380);
}

function buildPersonalTimetableFlexMessage(
	classTimetable: Map<number, Array<ParsedClassWeeklySess | null>>,
	personalSelections: Map<string, ParsedPersonalSelection | null>,
): Record<string, unknown> {
	const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
	const bubbles: Record<string, unknown>[] = [];

	for (const weekday of weekdayOrder) {
		const weekdayLabel = WEEKDAY_LABELS_JP[weekday] ?? '?';
		const dayPeriods = classTimetable.get(weekday) ?? [];
		const summary = buildResolvedPersonalTimetableDaySummary(dayPeriods, personalSelections);

		bubbles.push({
			type: 'bubble',
			size: 'mega',
			header: {
				type: 'box',
				layout: 'vertical',
				backgroundColor: '#21304B',
				contents: [
					{
						type: 'text',
						text: `${weekdayLabel}曜`,
						color: '#FFFFFF',
						weight: 'bold',
						align: 'center',
					},
				],
			},
			body: {
				type: 'box',
				layout: 'vertical',
				contents: [
					{
						type: 'text',
						text: summary,
						wrap: true,
						size: 'sm',
						color: '#333333',
					},
				],
			},
		});
	}

	return {
		type: 'flex',
		altText: '個人時間割',
		contents: {
			type: 'carousel',
			contents: bubbles,
		},
	};
}

function pickCafeImageUrls(cafeMenus: CafeMenuDay[]): { originalUrl: string; previewUrl: string } | null {
	for (const menu of cafeMenus) {
		const originalUrl = unwrapOption(menu?.menus_as_img_url);
		if (!isHttpsUrl(originalUrl)) {
			continue;
		}

		const previewCandidate = unwrapOption(menu?.menus_as_img_preview_url);
		return {
			originalUrl,
			previewUrl: isHttpsUrl(previewCandidate) ? previewCandidate : originalUrl,
		};
	}

	return null;
}

function buildAuthLinkMessage(webBaseUrl: string): Record<string, unknown> {
	return {
		type: 'text',
		text: [
			'このLINEアカウントに連携されたWebアカウントが見つかりません。',
			'・Webアカウントが未作成の場合: 次のページからサインアップしてください。',
			`${webBaseUrl}/login`,
			'・既にWebアカウントがある場合: ログイン後に次のページでLINE連携してください。',
			`${webBaseUrl}/settings/auth-identities`,
		].join('\n'),
	};
}

function buildTimetableLinkMessage(webBaseUrl: string): Record<string, unknown> {
	return {
		type: 'text',
		text: [
			'個人時間割、またはプロフィール（学年・クラス）が未設定です。',
			'以下のページでセットアップフローを完了してください。',
			`${webBaseUrl}/setup`,
		].join('\n'),
	};
}

function buildHelpMessage(webBaseUrl: string): Record<string, unknown> {
	return {
		type: 'text',
		text: [
			'メニューから選択してください。',
			`・週間予定表: 「${ACTION_SCHEDULE}」`,
			`・個人時間割: 「${ACTION_PERSONAL_TIMETABLE}」`,
			`・次の電車: 「${ACTION_NEXT_TRAIN}」`,
			`・カフェメニュー: 「${ACTION_CAFE}」`,
			`・Web版: ${webBaseUrl}/home`,
		].join('\n'),
	};
}

function resolveAction(event: LineWebhookEvent): 'schedule' | 'personal_timetable' | 'cafe' | 'next_train' | 'menu' | 'unknown' | 'ignore' {
	if (event.type === 'postback') {
		const data = toStringValue(event.postback?.data).trim();
		if (!data) {
			return 'unknown';
		}

		const params = new URLSearchParams(data);
		const action = (params.get('action') || data).trim();

		if (action === ACTION_SCHEDULE || action === 'schedule' || action === 'skd' || action === 'skd_w') {
			return 'schedule';
		}

		if (action === ACTION_PERSONAL_TIMETABLE || action === 'personal_timetable' || action === 'timetable') {
			return 'personal_timetable';
		}

		if (action === ACTION_CAFE || action === 'cafe' || action === 'cafe_menu' || action === 'cafeImgG' || action === 'cafeImgP') {
			return 'cafe';
		}

		if (action === ACTION_NEXT_TRAIN || action === 'next_train' || action === 'train') {
			return 'next_train';
		}

		if (action === ACTION_MENU || action === 'menu') {
			return 'cafe';
		}

		if (action === 'help') {
			return 'menu';
		}

		return 'unknown';
	}

	if (event.type === 'message' && event.message?.type === 'text') {
		const text = toStringValue(event.message.text).trim().toLowerCase();

		if (text.includes('予定') || text === 'schedule' || text === 'skd') {
			return 'schedule';
		}

		if (text.includes('時間割') || text === 'timetable') {
			return 'personal_timetable';
		}

		if (text.includes('カフェ') || text === 'cafe' || text === 'menu') {
			return 'cafe';
		}

		if (text.includes('電車') || text === 'train') {
			return 'next_train';
		}

		return 'unknown';
	}

	if (event.type === 'follow') {
		return 'unknown';
	}

	return 'ignore';
}

function buildApiPath(
	endpoint: api.endpoints.APIEndpoint,
	pathParams: Record<string, string | number>,
	queryParams?: Record<string, string | number>,
): string {
	const endpointDef = api.endpoints.API_ENDPOINTS[endpoint];
	const target = api.endpoints.buildRequestTarget(endpointDef, pathParams, queryParams);
	return `/v${endpointDef.version}${target}`;
}

function extractApiErrorCode(error: unknown): string | null {
	if (!(error instanceof ApiRequestError)) {
		return null;
	}

	const payload = error.payload;
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = (payload as ApiErrorLike).code;
	return typeof candidate === 'string' ? candidate : null;
}

function isFatalApi4xx(error: unknown): boolean {
	if (!(error instanceof ApiRequestError)) {
		return false;
	}

	if (error.status < 400 || error.status >= 500) {
		return false;
	}

	if (error.status === 401) {
		return true;
	}

	return false;
}

async function fetchApi<TPayload>(config: WorkerConfig, path: string, init: RequestInit = {}): Promise<TPayload> {
	const headers = new Headers(init.headers || {});
	headers.set('x-authorization', `Bearer ${config.systemAccessToken}`);
	if (config.apiCf2CfGuardKey) {
		headers.set('x-cf2cf-guard-key', config.apiCf2CfGuardKey);
	}

	if (init.body !== undefined && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const response = await fetch(`${config.apiBaseUrl}${path}`, {
		...init,
		headers,
	});

	const text = await response.text();
	const payload = decodeJson<TPayload>(text);

	if (!response.ok) {
		const errorPayload = decodeJson<ApiErrorLike>(text);
		const code = errorPayload && typeof errorPayload.code === 'string' ? errorPayload.code : undefined;
		const method = (init.method || 'GET').toUpperCase();
		console.error('LINE bot API request failed', {
			method,
			path,
			status: response.status,
			code,
			message: text || response.statusText || `HTTP ${response.status}`,
		});
		const responseHeaders: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			responseHeaders[key] = value;
		});
		if (response.status >= 500) {
			void reportAdminMessengerError(config, {
				summary: `API ${method} ${path} returned ${response.status}`,
				message: text || response.statusText || `HTTP ${response.status}`,
				status: response.status,
				code,
				level: 'fatal',
				context: {
					path,
					method,
					api_base_url: config.apiBaseUrl,
					guard_header_enabled: !!config.apiCf2CfGuardKey,
					response: JSON.stringify(errorPayload || '<no text payload>'),
					resp_headers: responseHeaders,
				},
			});
		}
		throw new ApiRequestError<ApiErrorLike>(response.status, errorPayload, text || response.statusText);
	}

	return payload as TPayload;
}

async function startChatLoading(config: WorkerConfig, lineUserId: string): Promise<void> {
	try {
		const response = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.lineChannelAccessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				chatId: lineUserId,
				loadingSeconds: 30,
			}),
		});

		if (!response.ok) {
			console.warn('Failed to start LINE chat loading animation', response.status, await response.text());
		}
	} catch (error) {
		console.warn('Failed to start LINE chat loading animation', toErrorMessage(error));
	}
}

async function lookupUserIdByLineSub(config: WorkerConfig, lineSub: string): Promise<string | null> {
	const path = buildApiPath(api.endpoints.APIEndpoint.UsersGet, {}, { line_sub: lineSub });

	const data = await fetchApi<UsersGetResponse>(config, path);
	const users = Array.isArray(data?.users) ? data.users : [];

	for (const user of users) {
		if (typeof user?.user_id === 'string' && user.user_id.length > 0) {
			return user.user_id;
		}
	}

	return null;
}

async function tryFetchWeeklySchedule(config: WorkerConfig, userId: string, today: DateParts): Promise<ScheduleFetchResult> {
	const path = buildApiPath(
		api.endpoints.APIEndpoint.UsersUserIdSchedulesYearMonthDayGet,
		{
			userId,
			year: today.year,
			month: today.month,
			day: today.day,
		},
		{
			range_days: 7,
			include_shared_memo: 1,
			include_personal_session_memo: 1,
			include_personal_daily_memo: 1,
		},
	);

	try {
		const data = await fetchApi<UsersSchedulesResponse>(config, path);
		return {
			type: 'ok',
			skd: Array.isArray(data?.skd) ? data.skd : [],
		};
	} catch (error) {
		if (error instanceof ApiRequestError) {
			const code = extractApiErrorCode(error);

			if (
				error.status === 403 &&
				(code === api.errors.UserDataErrorCode.UserProfileIncomplete || code === api.errors.CommonApiErrorCode.NotVerifiedStudent)
			) {
				return { type: 'profile_incomplete' };
			}

			if (error.status === 404) {
				return { type: 'user_missing' };
			}
		}

		throw error;
	}
}

async function fetchWeeklyCafeMenu(config: WorkerConfig, today: DateParts): Promise<CafeMenuDay[]> {
	const path = buildApiPath(
		api.endpoints.APIEndpoint.GlobalCafemenuYearMonthDayGet,
		{
			year: today.year,
			month: today.month,
			day: today.day,
		},
		{
			range_days: 4,
		},
	);

	const data = await fetchApi<GlobalCafeMenuResponse>(config, path);
	return Array.isArray(data?.cafe_menu) ? data.cafe_menu : [];
}

async function replyMessages(config: WorkerConfig, replyToken: string, messages: Array<Record<string, unknown>>): Promise<void> {
	if (replyToken.length === 0) {
		return;
	}

	const response = await fetch('https://api.line.me/v2/bot/message/reply', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.lineChannelAccessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			replyToken,
			messages: messages.slice(0, 5),
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		void reportAdminMessengerError(config, {
			summary: `LINE reply API returned ${response.status}`,
			message: body || `HTTP ${response.status}`,
			status: response.status,
			context: {
				reply_token: replyToken,
				message_count: messages.length,
			},
		});
		throw new Error(`LINE reply failed: ${response.status} ${body}`);
	}
}

async function safeReplyMessages(config: WorkerConfig, replyToken: string, messages: Array<Record<string, unknown>>): Promise<void> {
	try {
		await replyMessages(config, replyToken, messages);
	} catch (error) {
		console.error('Failed to reply LINE message', error);
	}
}

function getReplyToken(event: LineWebhookEvent): string | null {
	return typeof event.replyToken === 'string' ? event.replyToken : null;
}

function getLineUserId(event: LineWebhookEvent): string | null {
	return typeof event.source?.userId === 'string' ? event.source.userId : null;
}

async function handleScheduleReply(config: WorkerConfig, replyToken: string, userId: string, today: DateParts): Promise<void> {
	const scheduleResult = await tryFetchWeeklySchedule(config, userId, today);

	if (scheduleResult.type === 'user_missing') {
		await safeReplyMessages(config, replyToken, [buildAuthLinkMessage(config.webBaseUrl)]);
		return;
	}

	if (scheduleResult.type === 'profile_incomplete') {
		await safeReplyMessages(config, replyToken, [buildTimetableLinkMessage(config.webBaseUrl)]);
		return;
	}

	await safeReplyMessages(config, replyToken, [buildScheduleFlexMessage(scheduleResult.skd, today)]);
}

async function handlePersonalTimetableReply(config: WorkerConfig, replyToken: string, userId: string): Promise<void> {
	try {
		const userPath = buildApiPath(api.endpoints.APIEndpoint.UsersUserIdGet, {
			userId,
		});
		const userData = await fetchApi<UsersUserIdResponse>(config, userPath);
		const grade = Number.parseInt(String(userData?.user_info?.grade), 10);
		const homeClass = Number.parseInt(String(userData?.user_info?.homeclass), 10);

		if (!Number.isInteger(grade) || grade < 1 || grade > 3) {
			await safeReplyMessages(config, replyToken, [buildTimetableLinkMessage(config.webBaseUrl)]);
			return;
		}

		if (!Number.isInteger(homeClass) || homeClass < 1 || homeClass > 6) {
			await safeReplyMessages(config, replyToken, [buildTimetableLinkMessage(config.webBaseUrl)]);
			return;
		}

		const personalPath = buildApiPath(api.endpoints.APIEndpoint.UsersUserIdTimetableGet, { userId });
		const classPath = buildApiPath(api.endpoints.APIEndpoint.GradesGradeHomeClassesHomeClassNumTimetableGet, {
			grade,
			homeClassNum: homeClass,
		});

		const [personalData, classData] = await Promise.all([
			fetchApi<UsersTimetableResponse>(config, personalPath),
			fetchApi<HomeClassTimetableResponse>(config, classPath),
		]);

		const personalSelections = parsePersonalSelectionMap(personalData?.timetable);
		const classTimetable = parseHomeClassWeeklyTimetable(classData?.timetable);

		if (classTimetable.size === 0) {
			await safeReplyMessages(config, replyToken, [
				{
					type: 'text',
					text: 'クラス共通時間割が未設定です。Web版のクラス時間割設定を確認してください。',
				},
			]);
			return;
		}

		await safeReplyMessages(config, replyToken, [buildPersonalTimetableFlexMessage(classTimetable, personalSelections)]);
	} catch (error) {
		if (error instanceof ApiRequestError) {
			const code = extractApiErrorCode(error);
			if (error.status === 404) {
				await safeReplyMessages(config, replyToken, [buildAuthLinkMessage(config.webBaseUrl)]);
				return;
			}
			if (
				error.status === 403 &&
				(code === api.errors.CommonApiErrorCode.NotVerifiedStudent || code === api.errors.UserDataErrorCode.UserProfileIncomplete)
			) {
				await safeReplyMessages(config, replyToken, [buildTimetableLinkMessage(config.webBaseUrl)]);
				return;
			}
		}

		throw error;
	}
}

const TRAIN_ID_SET = new Set<string>(Object.values(knowledge.train_timetable.TrainTimetableID));

type ParsedNextTrainParam =
	| {
			mode: 'always';
			ids: knowledge.train_timetable.TrainTimetableID[];
			showCount: number;
			timeFormat: 'in_minutes' | 'hhmm';
	  }
	| {
			mode: 'switch';
			switchMinutes: number;
			beforeIds: knowledge.train_timetable.TrainTimetableID[];
			afterIds: knowledge.train_timetable.TrainTimetableID[];
			showCount: number;
			timeFormat: 'in_minutes' | 'hhmm';
	  };

function parseIdList(raw: unknown): knowledge.train_timetable.TrainTimetableID[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const ids = raw
		.filter((v): v is string => typeof v === 'string')
		.map((v) => v.trim())
		.filter((v) => v.length > 0 && TRAIN_ID_SET.has(v));
	return ids as knowledge.train_timetable.TrainTimetableID[];
}

function parseNextTrainParamFromWebUiConfig(rawConfig: unknown): ParsedNextTrainParam | null {
	if (!rawConfig || typeof rawConfig !== 'object') {
		return null;
	}
	const widgets = (rawConfig as { widgets?: unknown }).widgets;
	if (!Array.isArray(widgets)) {
		return null;
	}

	for (const widget of widgets) {
		if (!widget || typeof widget !== 'object') {
			continue;
		}
		if ((widget as { type?: unknown }).type !== dto.web_home_widget.WebHomeWidgetType.NextTrain) {
			continue;
		}
		const param = (widget as { param?: unknown }).param;
		if (!param || typeof param !== 'object') {
			continue;
		}

		const showCountRaw = Number((param as { show_count?: unknown }).show_count);
		const showCount = Number.isFinite(showCountRaw) ? Math.min(10, Math.max(1, Math.trunc(showCountRaw))) : 3;
		const tf = (param as { time_format?: unknown }).time_format;
		const timeFormat: 'in_minutes' | 'hhmm' = tf === 'hhmm' ? 'hhmm' : 'in_minutes';

		if ((param as { mode?: unknown }).mode === 'always') {
			const ids = parseIdList((param as { timetable_ids?: unknown }).timetable_ids);
			return { mode: 'always', ids, showCount, timeFormat };
		}

		const switchMinutes = parseTimeOnlyLike((param as { switch_time?: unknown }).switch_time, 12 * 60);
		const beforeIds = parseIdList((param as { before_ids?: unknown }).before_ids);
		const afterIds = parseIdList((param as { after_ids?: unknown }).after_ids);
		return { mode: 'switch', switchMinutes, beforeIds, afterIds, showCount, timeFormat };
	}

	return null;
}

async function fetchWebUiConfig(config: WorkerConfig, userId: string): Promise<unknown | null> {
	const path = buildApiPath(api.endpoints.APIEndpoint.UsersUserIdSettingsWebUiGet, { userId });
	const data = await fetchApi<UsersWebUiSettingsResponse>(config, path);
	return data?.config ?? null;
}

async function fetchTrainTimetableForToday(config: WorkerConfig, timetableId: string, today: DateParts): Promise<Record<string, number[]>> {
	const path = buildApiPath(api.endpoints.APIEndpoint.GlobalTrainTimetableTimetableIdYearMonthDayGet, {
		timetableId,
		year: today.year,
		month: today.month,
		day: today.day,
	});
	const data = await fetchApi<GlobalTrainTimetableResponse>(config, path);
	return parseTrainHourMap(data?.timetable);
}

function buildNextTrainMessage(params: {
	today: DateParts;
	nowMinutes: number;
	param: ParsedNextTrainParam;
	timetables: Array<{
		id: knowledge.train_timetable.TrainTimetableID;
		minutes: number[];
	}>;
}): Record<string, unknown> {
	const bubbles = params.timetables.map((item) => {
		const meta = knowledge.train_timetable.TrainTimetables[item.id];
		const next = item.minutes.filter((m) => m >= params.nowMinutes).slice(0, params.param.showCount);

		const rows: Record<string, unknown>[] =
			next.length > 0
				? next.map((m) => {
						const diff = m - params.nowMinutes;
						const mainLabel = params.param.timeFormat === 'hhmm' ? formatHm(m) : `あと${diff}分`;
						const subLabel = params.param.timeFormat === 'hhmm' ? `${diff}分後` : formatHm(m);
						return {
							type: 'box',
							layout: 'horizontal',
							spacing: 'sm',
							contents: [
								{
									type: 'text',
									text: mainLabel,
									weight: 'bold',
									size: 'sm',
									flex: 4,
								},
								{
									type: 'text',
									text: subLabel,
									size: 'xs',
									color: '#6B7280',
									align: 'end',
									flex: 3,
								},
							],
						};
					})
				: [
						{
							type: 'text',
							text: '終電後 / 以降なし',
							size: 'sm',
							color: '#6B7280',
							wrap: true,
						},
					];

		return {
			type: 'bubble',
			size: 'mega',
			header: {
				type: 'box',
				layout: 'vertical',
				backgroundColor: '#0B1F3A',
				contents: [
					{
						type: 'text',
						text: `${meta.line} ${meta.station}`,
						color: '#FFFFFF',
						weight: 'bold',
						size: 'sm',
						wrap: true,
					},
					{
						type: 'text',
						text: `${meta.direction}方面`,
						color: '#D1D5DB',
						size: 'xs',
						margin: 'sm',
						wrap: true,
					},
				],
			},
			body: {
				type: 'box',
				layout: 'vertical',
				spacing: 'sm',
				contents: rows,
			},
		};
	});

	return {
		type: 'flex',
		altText: truncateText(`次の電車 (${formatDateLabel(params.today)} ${formatHm(params.nowMinutes)} 現在)`, 120),
		contents: {
			type: 'carousel',
			contents: bubbles,
		},
	};
}

async function handleNextTrainReply(config: WorkerConfig, replyToken: string, userId: string, today: DateParts): Promise<void> {
	const rawConfig = await fetchWebUiConfig(config, userId);
	const param = parseNextTrainParamFromWebUiConfig(rawConfig);
	if (!param) {
		await safeReplyMessages(config, replyToken, [
			{
				type: 'text',
				text: '次の電車ウィジェットが未設定です。Web版のUI設定で追加してください。',
			},
		]);
		return;
	}

	const nowMinutes = nowMinutesJst();
	const ids = param.mode === 'always' ? param.ids : nowMinutes < param.switchMinutes ? param.beforeIds : param.afterIds;

	if (ids.length === 0) {
		await safeReplyMessages(config, replyToken, [
			{
				type: 'text',
				text: '次の電車ウィジェットの表示対象が未設定です。Web版のUI設定を確認してください。',
			},
		]);
		return;
	}

	const timetables = await Promise.all(
		ids.map(async (id) => {
			const hourMap = await fetchTrainTimetableForToday(config, id, today);
			return { id, minutes: flattenTrainMinutes(hourMap) };
		}),
	);

	await safeReplyMessages(config, replyToken, [buildNextTrainMessage({ today, nowMinutes, param, timetables })]);
}

async function handleCafeReply(config: WorkerConfig, replyToken: string, today: DateParts): Promise<void> {
	const cafeMenus = await fetchWeeklyCafeMenu(config, today);
	const messages: Array<Record<string, unknown>> = [];

	const imageUrls = pickCafeImageUrls(cafeMenus);
	if (imageUrls) {
		messages.push({
			type: 'image',
			originalContentUrl: imageUrls.originalUrl,
			previewImageUrl: imageUrls.previewUrl,
		});
	}

	const hasAnyTextMenu = cafeMenus.some((menu) => {
		const list = unwrapOption(menu?.menus_as_str);
		return Array.isArray(list) && list.some((item) => typeof item === 'string' && item.trim().length > 0);
	});

	// 画像しか無い場合は、同じような文言が並ぶFlexを省略する。
	if (!imageUrls || hasAnyTextMenu) {
		messages.push(buildCafeFlexMessage(cafeMenus, today));
	}

	await safeReplyMessages(config, replyToken, messages);
}

async function handleEvent(config: WorkerConfig, event: LineWebhookEvent): Promise<void> {
	// Only handle events from 1-to-1 chats
	if (event.source?.type !== 'user') {
		return;
	}

	const replyToken = getReplyToken(event);
	if (!replyToken) {
		return;
	}

	const action = resolveAction(event);
	if (action === 'ignore') {
		return;
	}

	const lineUserId = getLineUserId(event);
	if (!lineUserId) {
		await safeReplyMessages(config, replyToken, [
			{
				type: 'text',
				text: '1対1トークで利用してください。',
			},
		]);
		return;
	}

	if (action === 'schedule' || action === 'personal_timetable' || action === 'cafe' || action === 'next_train') {
		await startChatLoading(config, lineUserId);
	}

	const userId = await lookupUserIdByLineSub(config, lineUserId);
	if (!userId) {
		await safeReplyMessages(config, replyToken, [buildAuthLinkMessage(config.webBaseUrl)]);
		return;
	}

	const today = toJstDateParts(new Date());

	switch (action) {
		case 'schedule':
			await handleScheduleReply(config, replyToken, userId, today);
			return;
		case 'personal_timetable':
			await handlePersonalTimetableReply(config, replyToken, userId);
			return;
		case 'next_train':
			await handleNextTrainReply(config, replyToken, userId, today);
			return;
		case 'cafe':
			await handleCafeReply(config, replyToken, today);
			return;
		case 'menu':
			await handleCafeReply(config, replyToken, today);
			return;
		default:
			await safeReplyMessages(config, replyToken, [buildHelpMessage(config.webBaseUrl)]);
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

async function createLineSignature(rawBody: string, channelSecret: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(channelSecret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
	]);

	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));

	return bytesToBase64(new Uint8Array(signature));
}

function safeCompare(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: { waitUntil: (promise: Promise<unknown>) => void }): Promise<Response> {
		if (request.method === 'GET') {
			return jsonResponse(200, { ok: true });
		}

		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		let config: WorkerConfig;
		try {
			config = loadConfig(env);
		} catch (error) {
			console.error('Invalid worker configuration', error);
			return new Response('Service Unavailable', { status: 503 });
		}

		const lineSignature = request.headers.get('x-line-signature');
		if (!lineSignature) {
			return new Response('Unauthorized', { status: 401 });
		}

		const rawBody = await request.text();
		const expected = await createLineSignature(rawBody, config.lineChannelSecret);
		if (!safeCompare(lineSignature, expected)) {
			return new Response('Unauthorized', { status: 401 });
		}

		const webhook = decodeJson<LineWebhookPayload>(rawBody);
		const events = webhook?.events;
		if (!webhook || !Array.isArray(events)) {
			return new Response('Bad Request', { status: 400 });
		}

		ctx.waitUntil(
			(async () => {
				for (const event of events) {
					try {
						await handleEvent(config, event);
					} catch (error) {
						console.error('Failed to handle LINE webhook event', error, event);
						if (!isPhysicalNetworkError(error) && (!(error instanceof ApiRequestError) || isFatalApi4xx(error))) {
							void reportAdminMessengerError(config, {
								summary: 'Failed to handle LINE webhook event',
								message: toErrorMessage(error),
								status: error instanceof ApiRequestError ? error.status : undefined,
								code: extractApiErrorCode(error) ?? undefined,
								stack: error instanceof Error ? error.stack : undefined,
								level: 'fatal',
								context: {
									event_type: event.type,
									reply_token: getReplyToken(event),
									source_type: event.source?.type,
									source_user_id: getLineUserId(event),
								},
							});
						}
						const replyToken = getReplyToken(event);
						if (replyToken) {
							await safeReplyMessages(config, replyToken, [
								{
									type: 'text',
									text: 'サーバでエラーが発生しました。時間を置いて再試行してください。',
								},
							]);
						}
					}
				}
			})(),
		);

		return new Response('OK', { status: 200 });
	},
};

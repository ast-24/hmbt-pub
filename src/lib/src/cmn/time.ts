export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0: Sunday, 1: Monday, ..., 6: Saturday

export class TimeOnly {
  public h: number;
  public m: number;

  private constructor(h: number, m: number) {
    this.h = h;
    this.m = m;
  }

  public static new(h: number, m: number): TimeOnly {
    return new TimeOnly(h, m);
  }

  public intoDate(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(this.h, this.m, 0, 0);
    return newDate;
  }

  public addMinutes(minutes: number): TimeOnly {
    const totalMinutes = this.h * 60 + this.m + minutes;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return new TimeOnly(newH, newM);
  }

  public subMinutes(minutes: number): TimeOnly {
    const totalMinutes = this.h * 60 + this.m - minutes;
    const newH = Math.floor((totalMinutes + 24 * 60) / 60) % 24;
    const newM = (totalMinutes + 24 * 60) % 60;
    return new TimeOnly(newH, newM);
  }
}

export class TimeWindow {
  public start: TimeOnly;
  public end: TimeOnly;

  private constructor(start: TimeOnly, end: TimeOnly) {
    this.start = start;
    this.end = end;
  }

  public static new(start: TimeOnly, end: TimeOnly): TimeWindow {
    return new TimeWindow(start, end);
  }

  // startとendの差分を分単位で返す
  // 日付を跨ぐとバグるが実用上ありえないため無視
  public getLengthInMinutes(): number {
    const startInMinutes = this.start.h * 60 + this.start.m;
    const endInMinutes = this.end.h * 60 + this.end.m;
    return endInMinutes - startInMinutes;
  }

  public intoDate(date: Date): { start: Date; end: Date } {
    const start = this.start.intoDate(date);
    const end = this.end.intoDate(date);
    return { start, end };
  }
}

export * as time from "./time";

export class Option<T> {
  private _value: T | null;

  private constructor(value: T | null) {
    this._value = value;
  }

  public static Some<T>(value: T): Option<T> {
    return new Option(value);
  }

  public static None<T>(): Option<T> {
    return new Option(null as T | null);
  }

  public isSome(): boolean {
    return this._value !== null;
  }

  public isNone(): boolean {
    return this._value === null;
  }

  public unwrap(): T {
    if (this.isSome()) {
      return this._value as T;
    }
    throw new Error("Tried to unwrap an Option that is None");
  }

  public unwrapOr(defaultValue: T): T {
    if (this.isSome()) {
      return this._value as T;
    }
    return defaultValue;
  }

  public map<U>(fn: (value: T) => U): Option<U> {
    if (this.isSome()) {
      return Option.Some(fn(this._value as T));
    }
    return Option.None<U>();
  }

  public mapOr<U>(defaultValue: U, fn: (value: T) => U): U {
    if (this.isSome()) {
      return fn(this._value as T);
    }
    return defaultValue;
  }
}

export function Some<T>(value: T): Option<T> {
  return Option.Some(value);
}

export function None<T>(): Option<T> {
  return Option.None();
}

export class Result<T, E> {
  private _value: T | null;
  private _error: E | null;

  private constructor(value: T | null, error: E | null) {
    this._value = value;
    this._error = error;
  }

  public static Ok<T, E>(value: T): Result<T, E> {
    return new Result(value, null as E | null);
  }

  public static Err<T, E>(error: E): Result<T, E> {
    return new Result(null as T | null, error);
  }

  public isOk(): boolean {
    return this._value !== null;
  }

  public isErr(): boolean {
    return this._error !== null;
  }

  public expect(message: string): T {
    if (this.isOk()) {
      return this._value as T;
    }
    throw new Error(message);
  }

  public unwrapOr(defaultValue: T): T {
    if (this.isOk()) {
      return this._value as T;
    }
    return defaultValue;
  }

  public map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.isOk()) {
      return Result.Ok(fn(this._value as T));
    }
    return Result.Err(this._error as E);
  }

  public expectErr(message: string): E {
    if (this.isErr()) {
      return this._error as E;
    }
    throw new Error(message);
  }
}

export function Ok<T, E>(value: T): Result<T, E> {
  return Result.Ok(value);
}

export function Err<T, E>(error: E): Result<T, E> {
  return Result.Err(error);
}

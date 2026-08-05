/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * PROTOTYPE — throwaway, for `prototypes/root-export-bundle-cost` only.
 *
 * The member inventory follows `/result`'s exports under issue #42's
 * placement clauses; #44 has not landed, so treat the count as indicative.
 * Types are erased before a bundler sees this file.
 */
import {
  andThen,
  assertSuccess,
  fallback,
  failure,
  fromMaybe,
  isFailure,
  isSuccess,
  map,
  mapError,
  orElse,
  result,
  success,
  tryCatch,
} from './index.js'

class ResultBox<R> {
  private constructor(private readonly held: R) {}

  private static of<S>(held: S): ResultBox<S> {
    return new ResultBox(held)
  }

  static from<T>(value: any): ResultBox<any> {
    return ResultBox.of(result<T>(value))
  }

  static success<T>(value: T): ResultBox<any> {
    return ResultBox.of(success(value))
  }

  static failure(error: any): ResultBox<any> {
    return ResultBox.of(failure(error))
  }

  static tryCatch(fn: any, ...args: any[]): ResultBox<any> {
    return ResultBox.of((tryCatch as any)(fn, ...args))
  }

  static fromMaybe(value: any, error: any): ResultBox<any> {
    return ResultBox.of(fromMaybe(error, value))
  }

  static isSuccess(value: any): boolean {
    return isSuccess(value)
  }

  static isFailure(value: any): boolean {
    return isFailure(value)
  }

  map(fn: (value: any) => any): ResultBox<any> {
    return ResultBox.of(map(fn, this.held as any))
  }

  mapError(fn: (error: any) => any): ResultBox<any> {
    return ResultBox.of(mapError(fn, this.held as any))
  }

  andThen(fn: (value: any) => any): ResultBox<any> {
    return ResultBox.of(andThen(fn, this.held as any))
  }

  orElse(defaultValue: any): ResultBox<any> {
    return ResultBox.of(orElse(defaultValue, this.held as any))
  }

  fallback(fn: (error: any) => any): ResultBox<any> {
    return ResultBox.of(fallback(fn, this.held as any))
  }

  assertSuccess(): ResultBox<any> {
    return ResultBox.of(assertSuccess(this.held as any))
  }

  isSuccess(): boolean {
    return isSuccess(this.held as any)
  }

  isFailure(): boolean {
    return isFailure(this.held as any)
  }

  act(fn: (held: any) => void): ResultBox<R> {
    fn(this.held)
    return this
  }

  ifSuccess(fn: (value: any) => void): ResultBox<R> {
    if (isSuccess(this.held as any)) {
      fn(this.held)
    }
    return this
  }

  ifFailure(fn: (error: any) => void): ResultBox<R> {
    if (isFailure(this.held as any)) {
      fn(this.held)
    }
    return this
  }

  unbox(fn?: (value: any) => any): any {
    return fn === undefined ? this.held : map(fn, this.held as any)
  }

  get result(): R {
    return this.held
  }
}

export const Result = ResultBox

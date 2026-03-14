---
name: typescript
description: TypeScript conventions and patterns for all projects
invoke: auto
globs:
  - "**/*.ts"
---

# TypeScript Conventions

<type_safety>
- Never use `any`. ever. if the type is unknown, use `unknown` and narrow it.
- Never use `as` type assertions unless interfacing with an untyped boundary (e.g., JSON.parse output). prefer type guards and narrowing instead.
- Never use `@ts-ignore` or `@ts-expect-error`. fix the type error.
- Enable `strict: true` in tsconfig. this includes `strictNullChecks`, `noImplicitAny`, `noImplicitReturns`, and all other strict checks.
- Let the build fail. read the error, understand it, fix it properly. do not suppress type errors.
- If a type error is genuinely unresolvable, stop and ask the user before working around it.

<example>
function parseConfig(raw: unknown): Config {
  if (!isConfig(raw)) {
    throw new Error("invalid config")
  }
  return raw
}

function isConfig(value: unknown): value is Config {
  return typeof value === "object" && value !== null && "name" in value
}
</example>
</type_safety>

<type_design>
- Use `interface` for object shapes that may be extended or implemented
- Use `type` for unions, intersections, mapped types, and computed types
- Use discriminated unions over boolean flags or optional fields for variant data
- Use `readonly` for data that should not be mutated after creation
- Use `Record<K, V>` over `{ [key: string]: V }` for index signatures
- Use `satisfies` to validate a value matches a type while preserving the narrower literal type
- Prefer `unknown` over `object` for truly opaque values

<example>
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error }

interface UserService {
  getUser(id: string): Promise<User>
  listUsers(filter: UserFilter): Promise<User[]>
}

const defaults = {
  retries: 3,
  timeout: 5000,
} as const satisfies Partial<Config>
</example>
</type_design>

<inference>
- Let TypeScript infer return types for simple functions. annotate when the return type is complex, part of a public API, or non-obvious.
- Let TypeScript infer variable types from assignment. do not annotate `const x: string = "hello"`.
- Annotate function parameters always.
- Use `as const` for literal values that should not widen.
- Use generic constraints (`extends`) to keep generics useful, not loose.

<example>
const routes = ["home", "about", "settings"] as const
type Route = (typeof routes)[number]

function first<T>(items: T[]): T | undefined {
  return items[0]
}
</example>
</inference>

<functions>
- Use function declarations for top-level and exported functions
- Use arrow functions for inline callbacks and short expressions
- Use `void` return type for functions that do not return a value
- Prefer named functions over anonymous ones for better stack traces
- Use overloads sparingly. prefer unions or generics.

<example>
function processItems(items: string[]): string[] {
  return items.filter(Boolean).map((item) => item.trim())
}

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`)
  if (!response.ok) throw new Error(`failed to fetch user ${id}`)
  return response.json() as Promise<User>
}
</example>
</functions>

<error_handling>
- Throw typed errors or use result types. do not return `null` to indicate failure when the caller cannot distinguish "not found" from "error".
- Use `instanceof` narrowing for error handling
- Create specific error classes when callers need to distinguish error types
- Let errors propagate naturally. catch only when you can meaningfully handle them.

<example>
class NotFoundError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} ${id} not found`)
    this.name = "NotFoundError"
  }
}

function handleError(error: unknown): void {
  if (error instanceof NotFoundError) {
    console.log(`missing: ${error.resource} ${error.id}`)
    return
  }
  throw error
}
</example>
</error_handling>

<modules>
- Use named exports. default exports make renaming and refactoring harder.
- Use absolute imports from package root when the project supports path aliases
- Group imports: external packages, then internal modules, then relative files
- Use `type` imports for type-only imports: `import type { User } from "./types"`

<example>
import { z } from "zod"

import type { Config } from "@/config"
import { db } from "@/db"

import { validate } from "./validation"
</example>
</modules>

<naming>
- `camelCase` for variables, functions, and methods
- `PascalCase` for types, interfaces, classes, and enums
- `SCREAMING_SNAKE_CASE` for true constants (env vars, config keys, magic numbers)
- Prefix boolean variables with `is`, `has`, `should`, `can`
- Name functions after what they do: `getUser`, `parseConfig`, `validateInput`
- Name types after what they represent: `User`, `Config`, `ValidationResult`
</naming>

<async>
- Use `async`/`await` over raw promises and `.then()` chains
- Use `Promise.all` for independent concurrent operations
- Use `Promise.allSettled` when you need results from all promises regardless of failures
- Type async function returns as `Promise<T>`
- Handle promise rejections. do not leave unhandled promises.
</async>

<enums_and_constants>
- Prefer `as const` objects or union types over TypeScript enums. enums have runtime quirks and produce unexpected JavaScript.
- Use string unions for simple sets of known values

<example>
const Status = {
  Active: "active",
  Inactive: "inactive",
  Pending: "pending",
} as const
type Status = (typeof Status)[keyof typeof Status]

type Direction = "north" | "south" | "east" | "west"
</example>
</enums_and_constants>

<nullability>
- Use `T | null` for intentionally absent values. use `T | undefined` for optional parameters and object fields.
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safe access
- Prefer early returns to narrow away null/undefined at the top of functions
- Use non-null assertion (`!`) only when you have proof the value exists and TypeScript cannot infer it

<example>
function getDisplayName(user: User | null): string {
  if (!user) return "anonymous"
  return user.displayName ?? user.email
}
</example>
</nullability>

<zod>
- Use Zod for runtime validation at system boundaries (API inputs, config, env vars, file reads, JSON.parse)
- Derive TypeScript types from Zod schemas with `z.infer<typeof schema>` to keep runtime and compile-time types in sync
- Do not duplicate type definitions. the schema is the source of truth.

<example>
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "user", "viewer"]),
})
type User = z.infer<typeof UserSchema>

function parseUser(raw: unknown): User {
  return UserSchema.parse(raw)
}
</example>
</zod>

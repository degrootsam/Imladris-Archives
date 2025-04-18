---
title: "Typescript for dummies"
---

A friendly, step-by-step introduction to TypeScript—the typed superset of JavaScript that helps you write safer, more maintainable code.

---

## 1. What Is TypeScript?

- **Definition**: A superset of JavaScript that adds optional static types.
- **Compilation**: TypeScript files (`.ts`) compile to plain JavaScript (`.js`).
- **Ecosystem**: Backed by Microsoft, used by Angular, VS Code, and more.

### Why Types Matter

- Catch errors at compile time, **before** they reach production.
- Provide **self-documenting** code: types tell you what a function expects and returns.
- Enable powerful **IDE features** like autocomplete and refactoring.

---

## 2. Getting Started

### Prerequisites

- Basic knowledge of JavaScript (ES6+ features helpful).
- Node.js and npm installed.

### Installation

1. Open your terminal.
2. Run:
   ```bash
   npm install -g typescript
   ```
3. Verify installation:
   ```bash
   tsc --version
   ```

### Configuring a Project

1. In your project folder, initialize:
   ```bash
   tsc --init
   ```
2. This creates `tsconfig.json`. Key options:
   - `target`: JavaScript version output (e.g., `ES6`).
   - `module`: Module system (e.g., `commonjs`, `esnext`).
   - `strict`: Turn on all strict type-checking options.

---

## 3. Basic Types

| Type               | What it holds         | Example                                   |
| ------------------ | --------------------- | ----------------------------------------- |
| `boolean`          | `true`/`false`        | `let isDone: boolean = false;`            |
| `number`           | Any numeric value     | `let count: number = 42;`                 |
| `string`           | Text                  | `let name: string = 'Alice';`             |
| `array`            | List of items         | `let nums: number[] = [1,2,3];`           |
| `tuple`            | Fixed-length array    | `let pair: [string, number] = ['x', 10];` |
| `enum`             | Named constants       | `enum Color { Red, Green, Blue }`         |
| `any`              | Opt-out of type check | `let anything: any;`                      |
| `void`             | No value (functions)  | `function log(): void {}`                 |
| `null`/`undefined` | Self-explanatory      | `let u: undefined; let n: null;`          |

---

## 4. Functions

```ts
// 1. Annotate parameters and return type
function add(x: number, y: number): number {
  return x + y
}

// 2. Optional & default params
function greet(name: string = "Guest", age?: number): string {
  return `Hello, ${name}!`
}
```

- **Rest parameters**: `function sum(...nums: number[]): number {}`
- **Function types**:
  ```ts
  let myFunc: (a: number, b: number) => number
  ```

---

## 5. Interfaces & Types

### Interfaces

```ts
interface Person {
  name: string
  age: number
  speak?: () => void // optional
}

function introduce(p: Person) {
  console.log(`${p.name}, age ${p.age}`)
}
```

### Type Aliases

```ts
type ID = string | number
let userId: ID = "abc123"
```

- Use interfaces for object shapes.
- Use type aliases for unions, primitives, tuples.

---

## 6. Classes

```ts
class Animal {
  constructor(public name: string) {}
  move(distance: number = 0) {
    console.log(`${this.name} moved ${distance}m`)
  }
}

// Inheritance
class Dog extends Animal {
  bark() {
    console.log("Woof!")
  }
}
```

- **Access modifiers**: `public`, `private`, `protected`.
- **Readonly properties**: `readonly id: number`.
- **Abstract classes** and methods for shared contracts.

---

## 7. Generics

Make functions and classes work with any type:

```ts
function identity<T>(arg: T): T {
  return arg
}

let output = identity<string>("hello")
```

- Useful for reusable components and data structures.
- Can constrain generics: `<T extends { length: number }>`.

---

## 8. Modules

- Use ES module syntax:
  ```ts
  export function foo() {}
  import { foo } from "./foo"
  ```
- Keep code organized and encapsulated.
- Configure `tsconfig.json` `moduleResolution` for Node or bundler.

---

## 9. Working with JavaScript Libraries

- Many libs include **type definitions**.
- If not, install from DefinitelyTyped:
  ```bash
  npm install --save-dev @types/lodash
  ```

---

## 10. Tips for a Smooth Experience

1. **Enable `--strict`** in `tsconfig.json`.
2. Use **`noImplicitAny`** to avoid hidden `any` types.
3. Leverage IDE support (VS Code) for auto-fixing.
4. Add **linting** with ESLint & `@typescript-eslint`.
5. Gradually convert existing JS files by renaming to `.ts` and fixing errors.

---

## 11. Next Steps & Resources

- **Official Handbook**: https://www.typescriptlang.org/docs/handbook/intro.html
- **Playground**: Experiment in the browser: https://www.typescriptlang.org/play
- **Community**: TypeScript Discord, StackOverflow, GitHub discussions.

---

**Congratulations!** You now have the foundation to start using TypeScript. Happy coding!

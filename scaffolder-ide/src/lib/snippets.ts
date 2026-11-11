/**
 * snippets.ts
 *
 * Built-in snippet library. Each snippet is plain text with optional cursor
 * placeholders marked as `${0}`, `${1:default}` etc. — but for the in-app
 * library we keep them simple for now and rely on the editor's native
 * multi-cursor support for placement.
 */

export interface Snippet {
  id: string;
  title: string;
  language: string;       // "*" means any
  description: string;
  body: string;
}

export const SNIPPETS: Snippet[] = [
  {
    id: "ts-react-fc",
    title: "React Function Component",
    language: "typescript",
    description: "Typed React function component skeleton",
    body: `import React from "react";

interface Props {
  name: string;
}

export const MyComponent: React.FC<Props> = ({ name }) => {
  return <div>Hello, {name}!</div>;
};
`,
  },
  {
    id: "ts-usestate",
    title: "useState Hook",
    language: "typescript",
    description: "Typed useState declaration",
    body: `const [value, setValue] = useState<string>("");`,
  },
  {
    id: "ts-useeffect",
    title: "useEffect Hook",
    language: "typescript",
    description: "useEffect with cleanup",
    body: `useEffect(() => {
  const id = setInterval(() => {}, 1000);
  return () => clearInterval(id);
}, []);`,
  },
  {
    id: "py-main",
    title: "Python main() guard",
    language: "python",
    description: "Standard Python __main__ guard",
    body: `def main() -> int:
    return 0


if __name__ == "__main__":
    raise SystemExit(main())`,
  },
  {
    id: "py-dataclass",
    title: "Python Dataclass",
    language: "python",
    description: "Typed dataclass with defaults",
    body: `from dataclasses import dataclass


@dataclass
class User:
    name: str
    email: str
    age: int = 0`,
  },
  {
    id: "rust-struct",
    title: "Rust Struct + impl",
    language: "rust",
    description: "Rust struct with new() and impl block",
    body: `pub struct Counter {
    value: u64,
}

impl Counter {
    pub fn new() -> Self {
        Self { value: 0 }
    }

    pub fn inc(&mut self) -> u64 {
        self.value += 1;
        self.value
    }
}`,
  },
  {
    id: "rust-tests",
    title: "Rust #[test] block",
    language: "rust",
    description: "Standard Rust unit test",
    body: `#[test]
fn it_works() {
    assert_eq!(2 + 2, 4);
}`,
  },
  {
    id: "go-handler",
    title: "Go HTTP handler",
    language: "go",
    description: "Standard net/http handler",
    body: `func handler(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    _, _ = w.Write([]byte("ok"))
}`,
  },
  {
    id: "html5-boiler",
    title: "HTML5 Boilerplate",
    language: "html",
    description: "Minimal valid HTML5 document",
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
</head>
<body>
  <h1>Hello, world!</h1>
</body>
</html>`,
  },
  {
    id: "json-package",
    title: "package.json skeleton",
    language: "json",
    description: "Minimal Node.js package.json",
    body: `{
  "name": "my-package",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "echo \\"no tests\\" && exit 0"
  },
  "license": "MIT"
}`,
  },
  {
    id: "sql-select",
    title: "SQL SELECT with JOIN",
    language: "sql",
    description: "Standard SELECT with INNER JOIN",
    body: `SELECT u.id, u.name, COUNT(o.id) AS order_count
FROM users u
INNER JOIN orders o ON o.user_id = u.id
WHERE u.active = 1
GROUP BY u.id, u.name
ORDER BY order_count DESC
LIMIT 10;`,
  },
  {
    id: "md-readme",
    title: "Markdown README skeleton",
    language: "markdown",
    description: "Standard README structure",
    body: `# Project Name

> One-line description.

## Features

- Feature one
- Feature two

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`js
import { foo } from "project-name";
foo();
\`\`\`

## License

MIT`,
  },
  {
    id: "yaml-github-action",
    title: "GitHub Action workflow",
    language: "yaml",
    description: "Minimal CI workflow",
    body: `name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test`,
  },
  {
    id: "sh-script",
    title: "Bash script with set -euo",
    language: "shell",
    description: "Safe bash script header",
    body: `#!/usr/bin/env bash
set -euo pipefail
IFS=$'\\n\\t'

main() {
  echo "Hello, world!"
}

main "$@"`,
  },
];

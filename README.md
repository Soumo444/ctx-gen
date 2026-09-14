# Ctx Gen

Local Context Engine for AI coding assistants — scans your project and generates a clean, token-optimized project-context.md

## 🛠️ Tech Stack

- **Language:** Node.js (TypeScript)
- **Node dependencies:** 3

## 📁 Project Structure

```
ctx-gen/
├── bin/
│   └── ctx-gen.js
├── src/
│   ├── detectors/
│   │   ├── license.ts
│   │   └── projectType.ts
│   ├── parsers/
│   │   ├── codeSymbols.ts
│   │   ├── envExample.ts
│   │   ├── importGraph.ts
│   │   ├── keyFiles.ts
│   │   ├── packageJson.ts
│   │   ├── pythonDeps.ts
│   │   └── schema.ts
│   ├── utils/
│   │   └── treeUtils.ts
│   ├── cli.ts
│   ├── contextBuilder.ts
│   ├── docsGenerator.ts
│   ├── generator.ts
│   ├── ignoreRules.ts
│   ├── quickStart.ts
│   ├── scanner.ts
│   ├── tokenEstimator.ts
│   ├── treeBuilder.ts
│   ├── types.ts
│   └── watcher.ts
├── .ctxignore.example
├── .gitignore
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

## 🚀 Quick Start

**Install Node dependencies**
```bash
npm install
```

**Run in development mode**
```bash
npm run dev
```

**Build for production**
```bash
npm run build
```

## 📄 License

MIT

---
*README scaffolded by [ctx-gen](https://github.com/yourname/ctx-gen) `docs` — review, edit, and make it your own before publishing.*

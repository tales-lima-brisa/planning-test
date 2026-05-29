# 🎨 Tailwind CSS Setup

## Problema Atual

Você está usando Tailwind via CDN no `index.html`:

```html
<script src="https://cdn.tailwindcss.com"></script>
```

Isso gera o aviso:

```
cdn.tailwindcss.com should not be used in production
```

## ✅ Solução: Instalar Tailwind via PostCSS

### 1. Instalar dependências

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Isso cria:

- `tailwind.config.js`
- `postcss.config.js`

### 2. Configurar `tailwind.config.js`

```javascript
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          850: "#151F32",
          900: "#0F172A",
          950: "#020617",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
```

### 3. Criar arquivo `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 4. Importar no `src/index.tsx`

```typescript
import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

### 5. Remover do `index.html`

```html
<!-- REMOVER ESTAS LINHAS -->
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = { ... }
</script>
```

Deixar apenas:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgileVote</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
```

### 6. Testar

```bash
npm run dev
```

✅ Aviso desaparecerá e Tailwind funcionará corretamente!

## 💡 Diferenças

| CDN                  | PostCSS           |
| -------------------- | ----------------- |
| ❌ Não otimizado     | ✅ Otimizado      |
| ❌ Aviso em produção | ✅ Sem avisos     |
| ❌ Mais lento        | ✅ Mais rápido    |
| ✅ Fácil setup       | ✅ Melhor prática |

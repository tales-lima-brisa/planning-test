# 🔥 Firebase Realtime Database Setup

## Problema Comum

Se você está vendo este erro no console:

```
@firebase/database: FIREBASE WARNING: Firebase error.
Please ensure that you have the URL of your Firebase Realtime Database instance configured correctly.
```

Provavelmente é um problema de **Security Rules** bloqueando o acesso.

## ✅ Solução: Configurar Security Rules

### 1. Ir para Firebase Console

- Acesse: https://console.firebase.google.com/
- Selecione o projeto `planning-test-491d3`

### 2. Navegar até Realtime Database

- No menu esquerdo: **Build** → **Realtime Database**
- Clique na aba **Rules**

### 3. Substituir as regras (DESENVOLVIMENTO)

**⚠️ IMPORTANTE: Estas regras são apenas para DESENVOLVIMENTO. Nunca use em produção!**

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true,
        "users": {
          ".indexOn": ["id"]
        },
        "votes": {
          ".indexOn": ["userId"]
        }
      }
    }
  }
}
```

### 4. Clicar em "Publish"

- Confirmar as mudanças

### 5. Testar

```bash
npm run dev
```

Você deve ver:

```
[Firebase] Service initialized successfully ✅
[Firebase] Room created: ABC12 ✅
```

## 📋 Regras de Produção (Depois)

Para produção, use autenticação:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "root.child('rooms').child($roomId).child('users').hasChild(auth.uid)",
        ".write": "root.child('rooms').child($roomId).child('users').hasChild(auth.uid)",
        "users": {
          ".indexOn": ["id"]
        },
        "votes": {
          ".indexOn": ["userId"]
        }
      }
    }
  }
}
```

Mas primeiro você precisa habilitar **Authentication** (Google, Email, Anonymous, etc).

## 🆘 Se ainda não funcionar

1. **Verificar `.env`**:

   ```bash
   cat .env | grep DATABASE_URL
   ```

   Deve mostrar:

   ```
   VITE_FIREBASE_DATABASE_URL=https://planning-test-491d3-default-rtdb.firebaseio.com
   ```

2. **Verificar console do Firefox/Chrome**:
   - Pressione F12
   - Tab **Console**
   - Procure por logs `[Firebase]`

3. **Verificar se Realtime Database existe**:
   - Firebase Console → Realtime Database
   - Se não existir, clique em **Criar banco de dados**

## 📚 Links Úteis

- [Firebase Realtime Database Docs](https://firebase.google.com/docs/database)
- [Security Rules Guide](https://firebase.google.com/docs/database/security)
- [Firebase Console](https://console.firebase.google.com/)

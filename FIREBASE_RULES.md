# 🔑 Firebase Security Rules - Passo a Passo

## 🚨 Você está vendo este erro?

```
Firebase error. Please ensure that you have the URL of your Firebase Realtime Database instance configured correctly.
```

**Isso significa que as Security Rules estão BLOQUEANDO o acesso.** É o último passo para fazer funcionar!

## ✅ SOLUÇÃO (3 minutos)

### Passo 1: Abrir Firebase Console

1. Vá para: https://console.firebase.google.com/
2. Clique no projeto `planning-test-491d3`

### Passo 2: Acessar Rules

1. No menu esquerdo, clique em **Build**
2. Selecione **Realtime Database**
3. Clique na aba **Rules** (não "Data")

### Passo 3: Copiar Regras

Você verá algo assim:

```json
{
  "rules": {
    ".read": false,
    ".write": false
  }
}
```

**Substituir TUDO por:**

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

### Passo 4: Publicar

1. Clique em **Publish** (botão azul no canto inferior direito)
2. Confirme quando pedido

### Passo 5: Voltar para a App e Testar

```bash
npm run dev
```

Abra o console (F12) e você deve ver:

```
[Firebase] ✅ Room created successfully: ABC12
```

## 🎯 Pronto!

Agora você será redirecionado automaticamente para a sala! 🚀

---

## 🔒 Segurança

⚠️ **IMPORTANTE:** Essas regras (`".read": true, ".write": true`) são apenas para **DESENVOLVIMENTO**.

Para **PRODUÇÃO**, use autenticação (veja `FIREBASE_SETUP.md` para regras de produção).

## 🆘 Se não funcionar

Compartilha o console completo aqui. Procure por logs `[Firebase]` com ❌.

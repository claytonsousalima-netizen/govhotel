# Deploy — GovHotel no GitHub Pages

## Pré-requisitos

- Conta no [GitHub](https://github.com)
- Conta no [Supabase](https://supabase.com) (plano gratuito é suficiente)
- Git instalado na máquina

---

## Parte 1 — Configurar o Supabase

### 1.1 Criar o projeto

1. Acesse https://supabase.com/dashboard e clique em **New project**
2. Escolha nome, senha do banco e região (preferencialmente `South America (São Paulo)`)
3. Aguarde o projeto inicializar (~2 min)

### 1.2 Executar o schema do banco

1. No dashboard, vá em **SQL Editor**
2. Clique em **New query**
3. Cole o conteúdo de `supabase/schema.sql` e execute (**Run**)
4. Cole o conteúdo de `supabase/rls.sql` e execute (**Run**)

### 1.3 Criar o primeiro usuário admin_global

No SQL Editor, execute:

```sql
-- Substitua o email e o UUID gerado após o passo 1.4
INSERT INTO user_profiles (user_id, nome, email, perfil, ativo)
VALUES (
  'UUID-DO-AUTH-USER',   -- veja passo 1.4
  'Seu Nome',
  'seu@email.com',
  'admin_global',
  true
);
```

### 1.4 Criar o usuário no Supabase Auth

1. Vá em **Authentication → Users**
2. Clique em **Add user → Create new user**
3. Preencha o e-mail e uma senha temporária
4. Copie o **UUID** gerado e use no INSERT acima

### 1.5 Copiar as credenciais públicas

1. Vá em **Project Settings → API**
2. Copie os dois valores:
   - **Project URL** → será o `SUPABASE_URL`
   - **anon public** → será o `SUPABASE_KEY`

> ✅ A chave `anon public` é segura para o repositório público.  
> ❌ A chave `service_role` **nunca deve sair do servidor**.

---

## Parte 2 — Configurar o projeto local

### 2.1 Preencher as credenciais

Abra o arquivo `js/supabase-client.js` e substitua:

```js
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';   // ← Project URL
const SUPABASE_KEY = 'SUA_CHAVE_ANON_PUBLICA';            // ← anon public
```

### 2.2 (Opcional) Deploy da Edge Function de convite

Necessário apenas para criar novos usuários pelo sistema.
Se preferir criar usuários pelo Supabase Dashboard, pule esta etapa.

```bash
# Instale o Supabase CLI
npm install -g supabase

# Login
supabase login

# Link ao projeto
supabase link --project-ref SEU_PROJECT_REF

# Configure o secret da service_role (NUNCA coloque no frontend)
supabase secrets set SUPABASE_SERVICE_ROLE=sua_service_role_key

# Deploy da função
supabase functions deploy invite-user
```

O `SEU_PROJECT_REF` está na URL do dashboard: `https://supabase.com/dashboard/project/SEU_PROJECT_REF`

---

## Parte 3 — Publicar no GitHub Pages

### 3.1 Criar o repositório

```bash
# Na pasta do projeto
git init
git add .
git commit -m "feat: GovHotel inicial"
```

Acesse https://github.com/new e crie um repositório **público** com o nome desejado (ex: `govhotel`).

```bash
git remote add origin https://github.com/SEU_USUARIO/govhotel.git
git branch -M main
git push -u origin main
```

### 3.2 Ativar o GitHub Pages

1. No repositório, vá em **Settings → Pages**
2. Em **Source**, selecione **Deploy from a branch**
3. Selecione a branch `main` e pasta `/ (root)`
4. Clique em **Save**

Após ~1 minuto, o site estará disponível em:
```
https://SEU_USUARIO.github.io/govhotel/
```

### 3.3 Configurar o redirect URL no Supabase (para e-mails de convite)

1. No Supabase dashboard, vá em **Authentication → URL Configuration**
2. Em **Site URL**, coloque:
   ```
   https://SEU_USUARIO.github.io/govhotel
   ```
3. Em **Redirect URLs**, adicione:
   ```
   https://SEU_USUARIO.github.io/govhotel/**
   ```

---

## Parte 4 — Estrutura de arquivos publicados

```
govhotel/
├── index.html                          ← App principal (SPA)
├── js/
│   ├── supabase-client.js              ← URL + anon key (seguro)
│   ├── auth.js                         ← Login / sessão
│   ├── permissions.js                  ← Controle de acesso
│   ├── hotels.js                       ← Gestão de hotéis
│   ├── apartments.js                   ← Gestão de apartamentos
│   ├── maids.js                        ← Gestão de camareiras
│   └── users.js                        ← Gestão de usuários
└── supabase/
    ├── schema.sql                      ← Executar no SQL Editor
    ├── rls.sql                         ← Executar no SQL Editor
    └── functions/
        └── invite-user/
            └── index.ts               ← Deploy via Supabase CLI
```

> Os arquivos `supabase/` **não são servidos pelo GitHub Pages** — ficam no repositório apenas como documentação e para o Supabase CLI.

---

## Segurança — resumo

| Chave | Onde fica | Motivo |
|---|---|---|
| `anon public` | `js/supabase-client.js` (repositório público) | Projetada para ser pública; RLS protege os dados |
| `service_role` | Supabase Secrets (nunca no frontend) | Bypassa o RLS — expor equivale a abrir o banco inteiro |
| Senha do banco | Supabase (nunca no código) | Acesso direto ao PostgreSQL |

---

## Atualizações futuras

Para publicar uma nova versão:

```bash
git add .
git commit -m "feat: descrição da mudança"
git push
```

O GitHub Pages atualiza automaticamente em ~1 minuto após o push.

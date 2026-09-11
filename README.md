# Tratativas de Campo

App hospedado (Node.js + Supabase + Render) para lançar tratativas de não conformidades de campo, com:

- Foto do ocorrido
- Gravidade (Gravíssima / Grave / Leve) + código da NC opcional
- Supervisor e quem lançou
- Destinatário principal + até 4 e-mails em cópia
- Prazo para realizar e situação (Em andamento / Concluído / Vencido)
- Envio automático de e-mail com PDF em anexo quando o e-mail é preenchido
- Botões **"Foi feito"** e **"Não foi feito"** dentro do e-mail: o destinatário principal clica, confirma numa página simples, e o status é atualizado sozinho no sistema

## 1. Criar o banco no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (ou use um que já tenha, no mesmo esquema do Controle de Contas / Controle de Coletas).
2. Vá em **SQL Editor** e rode o conteúdo do arquivo `supabase-schema.sql` deste projeto.
3. Vá em **Project Settings > API** e copie:
   - **Project URL** → variável `SUPABASE_URL`
   - **service_role key** (não é a `anon` key) → variável `SUPABASE_SERVICE_KEY`

## 2. Configurar o envio de e-mail (API da Brevo, não SMTP)

**Importante:** o Render bloqueia portas SMTP (25, 465, 587) de saída no plano gratuito. Por isso o envio é feito pela API HTTP da Brevo (roda em HTTPS, porta 443, que não é bloqueada).

1. Crie uma conta grátis em [brevo.com](https://www.brevo.com) (300 e-mails/dia no plano free).
2. Vá em **Settings > Senders, Domains & Dedicated IPs** e verifique o e-mail que vai aparecer como remetente (a Brevo manda um e-mail de confirmação).
3. Vá em **Settings > SMTP & API > API Keys** e clique em **Generate a new API key**.
4. Use:
   - `BREVO_API_KEY=` a chave gerada
   - `FROM_EMAIL=` o e-mail que você verificou no passo 2
   - `FROM_NAME=` o nome que aparece como remetente (ex.: `Tratativas de Campo`)

## 3. Publicar no Render

1. Suba esta pasta para um repositório no GitHub (pode ser um novo, ex.: `SAHUVII/tratativas-de-campo`, ou dentro de um repositório existente).
2. No Render, crie um **Web Service** apontando para o repositório.
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Em **Environment**, cadastre as variáveis do arquivo `.env.example` com os valores reais:
   - `APP_USER`, `APP_PASS`, `SESSION_SECRET`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `BREVO_API_KEY`, `FROM_EMAIL`, `FROM_NAME`
   - `BASE_URL` → depois que o Render gerar a URL do serviço (ex.: `https://tratativas-de-campo.onrender.com`), volte aqui e preencha com ela. Essa variável é usada para montar os links de "Foi feito" / "Não foi feito" dentro do e-mail — sem ela certa, os links do e-mail não funcionam.
4. Clique em **Deploy**.

## 4. Usar

- Acesse a URL do Render, entre com o usuário e senha definidos em `APP_USER`/`APP_PASS`.
- Ao salvar uma tratativa com e-mail preenchido, o sistema já dispara o e-mail com o PDF em anexo e os botões de aprovação.
- A lista mostra a situação atual e, quando o destinatário já respondeu, mostra a confirmação e o comentário (se houver).

## Sobre lentidão no plano gratuito do Render

No plano free, o Render "desliga" o serviço depois de ~15 minutos sem uso e leva de 30 a 60 segundos para acordar na próxima requisição. Isso é normal do plano gratuito e é diferente do problema de e-mail — se o app estiver lento só na primeira ação depois de um tempo parado, é esse "acordar"; se estiver lento toda vez que você salva uma tratativa, o sintoma é outro (veja a seção de e-mail acima).

## Observações

- Os links de aprovar/reprovar são de uso único: depois que alguém confirma, tentar clicar de novo mostra uma página avisando que já foi respondido.
- Cada tratativa tem um token único, então esses links não podem ser adivinhados.
- Se quiser reenviar o e-mail de uma tratativa (por exemplo, se a pessoa perdeu a mensagem), use o botão "Reenviar e-mail" na lista.

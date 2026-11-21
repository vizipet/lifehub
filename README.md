# LifeHub — consultas sem demora

Aplicativo web (PWA) para encontrar médicos com CRM verificado e agendar consultas para você e seus dependentes.
Projeto acadêmico. Todos os dados de demonstração são fictícios.

## Como rodar (Windows, macOS ou Linux)

Pré-requisito: **Node.js 22 ou mais novo** ([nodejs.org](https://nodejs.org)). Não é preciso instalar banco de dados nem Docker:
o PostgreSQL vem embutido e roda só no seu computador.

```bash
npm run setup   # só na primeira vez: instala, cria o banco e carrega a demonstração
npm run dev     # liga banco, API e site
```

Abra **http://localhost:5173**. Para desligar, `Ctrl+C` no terminal.

### Contas de demonstração (senha `LifeHub2026`)

| Perfil | Login |
|---|---|
| Paciente (com 2 dependentes) | `mariana@lifehub.local` ou CPF `529.982.247-25` |
| Médica aprovada | `helena@lifehub.local` |
| Médico aguardando análise | `carlos@lifehub.local` |
| Administração | `admin@lifehub.local` |

Os e-mails do sistema (como o link de recuperação de senha) não saem para a internet: ficam em `backend/mailbox/` e aparecem no terminal.

Documentação da API (Swagger): http://localhost:3000/api/docs

## O que dá para fazer

- **Paciente:** cadastro com CPF e consentimentos da LGPD; busca por especialidade, nome, bairro, dia e modalidade, ordenada pelo **horário mais próximo**; agendamento para si ou para dependentes; cancelamento com motivo; campanhas de saúde; notificações; exportar os próprios dados e excluir a conta.
- **Médico:** cadastro com CRM e especialidade, local de atendimento, envio de documentos, serviços (presencial e teleconsulta), abertura de horários em lote, bloqueio de horários, agenda com concluir e cancelar.
- **Administração:** análise de médicos (com documentos), aprovação de clínicas, bloqueio de usuários, campanhas e registro de auditoria.

Aviso de emergência (192/UPA) em destaque: o LifeHub não é serviço de urgência.

## Segurança e LGPD

- **CPF** gravado criptografado (AES-256-GCM) e localizado por HMAC-SHA256. Nas telas aparece mascarado.
- **Senhas** com Argon2. Bloqueio de 15 minutos após 5 erros, limite de requisições no login, no cadastro e na recuperação de senha.
- **Sessões** de 15 minutos com renovação rotativa; bloquear um usuário encerra todas as sessões dele.
- **Documentos dos médicos** criptografados em disco; o admin acessa por um link temporário, e cada abertura fica na auditoria.
- **Permissões por perfil:** o paciente só vê os próprios dados e dependentes; o médico vê apenas nome e idade de quem agendou; o médico só mexe na própria agenda.
- **LGPD:** três aceites explícitos e não pré-marcados (termos, privacidade e dados de saúde), com versão registrada; declaração do responsável ao cadastrar dependentes; exportação completa dos dados; exclusão com anonimização imediata.
- Cabeçalhos de segurança (helmet), CSP no build de produção, validação estrita de entrada e API escutando só em `127.0.0.1`.

## Estrutura

```
backend/   API NestJS + Prisma (PostgreSQL)
frontend/  React + Vite + Tailwind (PWA)
scripts/   setup e dev (comandos da raiz)
```

Testes: `npm test` na raiz.

## Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run setup` | Prepara tudo (pode rodar de novo sem apagar dados) |
| `npm run dev` | Liga banco, API e site |
| `npm run reset-db` | Apaga o banco local (pede confirmação) |

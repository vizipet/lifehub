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
| Pediatra (atende o Lucas, dependente da Mariana) | `beatriz@lifehub.local` |
| Médico aguardando análise | `carlos@lifehub.local` |
| Administração | `admin@lifehub.local` |

Os outros médicos da demonstração também entram com a mesma senha: `rafael`, `andre`, `camila`, `bruno`, `laura` e `paulo` (todos `@lifehub.local`).

Os e-mails do sistema (como o link de recuperação de senha) não saem para a internet: ficam em `backend/mailbox/` e aparecem no terminal.

Documentação da API (Swagger): http://localhost:3000/api/docs

## O que dá para fazer

- **Paciente:** cadastro com CPF e consentimentos da LGPD; busca com **sugestões enquanto digita** (especialidades e médicos), filtros por dia e modalidade, ordenada pelo **horário mais próximo**; perfil do médico com foto, **mapa da clínica** e escolha do dia numa faixa deslizante; agendamento para si ou para dependentes; cancelamento com motivo; campanhas de saúde; notificações; exportar os próprios dados e excluir a conta.
- **Médico:** cadastro com CRM e especialidade; local de atendimento com **CNES**, **CEP que preenche o endereço** e envio do **alvará**; documentos de verificação; serviços (presencial e teleconsulta); abertura de horários em lote e bloqueio; agenda com concluir e cancelar; **conferência do vínculo** quando o paciente é dependente.
- **Administração:** análise de médicos (com documentos); aprovação de clínicas com conferência no CNES/DATASUS e no alvará; **alertas de dependentes**; bloqueio de usuários; campanhas; registro de auditoria de tudo o que os médicos fazem.

### Proteção de dependentes

Nenhum app consegue provar parentesco pela internet, então o LifeHub dificulta a fraude, guarda prova e põe uma pessoa para conferir:

1. **Declaração** do responsável "sob as penas da lei" (falsidade ideológica, art. 299 do Código Penal), registrada com data e hora.
2. **Conferência no atendimento:** o médico vê "Filho(a) de Mariana Costa" e só conclui depois de marcar "Vínculo conferido". Se não conferir, a consulta é cancelada, a administração recebe um alerta e a tela mostra o Conselho Tutelar e o Disque 100.
3. **CPF em outra conta** vira alerta (pai e mãe podem ter contas separadas, então não bloqueia).
4. **Muitas crianças em 24 horas** pela mesma conta vira alerta.

### Acessibilidade e conforto

- **Modo escuro automático** (segue o tema do celular), com contraste conferido pelo critério WCAG.
- **Botão A+** para aumentar a letra em dois níveis, salvo no aparelho.
- Navegação por teclado, leitor de tela e opção "reduzir movimento" respeitada.
- Carregamento com esqueleto (sem telas em branco) e animação só nos momentos importantes.

Aviso de emergência (192/UPA) em destaque: o LifeHub não é serviço de urgência.

## Segurança e LGPD

- **CPF** gravado criptografado (AES-256-GCM) e localizado por HMAC-SHA256. Nas telas aparece mascarado.
- **Senhas** com Argon2. Bloqueio de 15 minutos após 5 erros, limite de requisições no login, no cadastro e na recuperação de senha.
- **Sessões** de 15 minutos com renovação rotativa; bloquear um usuário encerra todas as sessões dele.
- **Documentos dos médicos e alvarás** criptografados em disco; o admin abre pelo painel, e cada abertura fica na auditoria.
- **Permissões por perfil:** o paciente só vê os próprios dados e dependentes; o médico vê apenas nome e idade de quem agendou (e, se for dependente, o nome do responsável, para conferir na recepção); o médico só mexe na própria agenda e nos locais pelos quais responde.
- **LGPD:** três aceites explícitos e não pré-marcados (termos, privacidade e dados de saúde), com versão registrada; declaração do responsável ao cadastrar dependentes; exportação completa dos dados; exclusão com anonimização imediata.
- **Sem rastreamento:** nenhum cookie de estatística ou publicidade; fontes e fotos servidas pelo próprio site. Os únicos serviços de fora são o ViaCEP (só o CEP é enviado) e o OpenStreetMap, que só carrega o mapa depois que a pessoa clica em "Mostrar mapa".
- Cabeçalhos de segurança (helmet), CSP no build de produção, validação estrita de entrada e API escutando só em `127.0.0.1`.
- Dependências sem vulnerabilidades conhecidas no que vai para o site (`npm audit --omit=dev`).

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
| `npm run stop-db` | Desliga o banco se ele ficou ligado (ex.: terminal fechado sem `Ctrl+C`) |

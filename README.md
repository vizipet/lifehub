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
- **Médico:** cadastro com **foto de perfil**, CRM e especialidade; local de atendimento com **CNES**, **CEP que preenche o endereço** e envio do **alvará**; documentos de verificação; serviços (presencial e teleconsulta); abertura de horários em lote e bloqueio; agenda com concluir e cancelar, histórico e cancelados; **conferência do vínculo** quando o paciente é dependente; notificações de consulta nova, cancelamento e decisões da administração (com o motivo).
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
- **Sem rastreamento:** nenhum cookie de estatística ou publicidade; fontes e fotos servidas pelo próprio site. Os serviços externos incluem ViaCEP (só o CEP é enviado), OpenStreetMap (carrega após clicar em "Mostrar mapa") e, quando habilitada para demonstração, a videochamada LiveKit. A demonstração de vídeo não deve usar dados de pacientes reais.
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


## Solução de problemas (Windows / PowerShell)

Use os comandos na raiz do repositório LifeHub, salvo indicação em contrário. Mantenha o banco local e os dados existentes. **Não use `npm run reset-db` para corrigir conexão:** esse comando apaga o banco. Não reinstale nem rode o setup novamente como primeira tentativa. Não compartilhe o conteúdo do `backend/.env`, tokens ou chaves de API em prints.

### Inicialização e atualização

Após atualizar o backend, encerre o terminal de `npm run dev` com Ctrl+C. Na raiz:

```powershell
git pull
cd backend
npm run build
cd ..
$env:HOST = '0.0.0.0'
$env:PORT = '3000'
npm run dev
```

Só avance se a compilação terminou sem erros. O host acima permite acesso à API pela rede; mantenha o padrão local quando não precisar disso. Se a atualização tiver novas migrações, aplique-as com o banco ligado usando `npx prisma migrate deploy` dentro de backend, seguindo as instruções da versão. Não altere a porta do banco por tentativa e erro.

### Celular Android: "Sem conexão com o LifeHub"

O aplicativo de demonstração via Expo Go usa `http://127.0.0.1:3000/api/v1` no celular, encaminhado por ADB ao notebook. Conecte um cabo USB de dados, habilite a depuração USB e autorize o computador no celular. No PowerShell, ajuste o caminho do ADB conforme sua instalação:

```powershell
$adb = "C:\platform-tools\platform-tools-latest-windows\platform-tools\adb.exe"
& $adb devices
& $adb reverse tcp:3000 tcp:3000
& $adb reverse tcp:8083 tcp:8083
& $adb reverse --list
curl.exe --max-time 5 -i http://127.0.0.1:3000/api/v1/professionals/me
```

O aparelho precisa constar como `device` (não `unauthorized` ou `offline`). A resposta HTTP 401 da última linha é esperada sem login: confirma que a API respondeu, mas não comprova acesso ao banco ou funcionamento da sessão. Se o ADB não detectar o dispositivo, verifique o cabo, a autorização USB e a depuração. Reaplique o reverse após reconectar o cabo.

Se necessário, encerre apenas o Metro com Ctrl+C. Na pasta do repositório lifehub-mobile (não na raiz do backend):

```powershell
npx expo start --go --port 8083 --clear
```

Abra novamente o projeto no Expo Go. Não é necessário reiniciar o banco só porque o celular perdeu a conexão.

### Site com tela preta, "Failed to fetch" ou ERR_NETWORK_ACCESS_DENIED

Use http://127.0.0.1:5173/login (em vez de localhost, especialmente se outro servidor ocupar IPv6). Ctrl+Shift+R recarrega sem cache. F12 > Console mostra os erros; um erro JavaScript como "ReferenceError ... is not defined" aponta para o arquivo e a linha que precisam ser inspecionados. Não confunda erros de código com falhas de rede.

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, OwningProcess
1..5 | ForEach-Object {
    curl.exe --max-time 5 -s -o NUL -w "HTTP %{http_code}\n" http://127.0.0.1:5173/api/v1/professionals/me
    Start-Sleep -Seconds 1
}
```

Cinco respostas 401 indicam que o proxy Vite encaminhou as requisições naquele momento. Se o navegador ainda falhar, teste uma janela anônima (Ctrl+Shift+N), faça login novamente e confira extensões/permissões de rede. Isso resolveu uma ocorrência, mas não prova a causa de todas as falhas intermitentes. HTTP 000 ou timeout exige conferir os terminais do servidor. Não desative o antivírus ou firewall indiscriminadamente.

### PostgreSQL: connect EACCES, porta ocupada ou pg_ctl "No such process"

Encerre a execução anterior do LifeHub com Ctrl+C. Na raiz:

```powershell
npm run stop-db
```

Tente iniciar novamente. Caso persista, confira a porta configurada em LIFEHUB_DB_PORT (15433 no ambiente de demonstração usado nos testes; pode variar):

```powershell
Get-NetTCPConnection -LocalPort 15433 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, OwningProcess
Get-CimInstance Win32_Process -Filter "Name = 'postgres.exe'" |
    Format-List ProcessId, ParentProcessId, ExecutablePath, CommandLine
netsh interface ipv4 show excludedportrange protocol=tcp
```

A mensagem "porta em uso" do script também pode representar uma falha de permissão ao tentar abrir a porta. Se não houver listener, verifique as exclusões de portas e os processos do PostgreSQL. "No such process" pode indicar PID antigo ou processo principal encerrado; não apague os arquivos de dados nem o postmaster.pid às cegas.

Se houver processo órfão do PostgreSQL embutido, confirme pelo caminho do executável que pertence exatamente ao LifeHub e que o processo principal não está ativo antes de encerrar somente esse processo identificado. Não reutilize PIDs antigos, não finalize todos os processos postgres.exe e não interrompa bancos de outros projetos. Em caso de dúvida, reinicie o Windows normalmente após salvar o trabalho. Só altere a porta se necessário, mantendo LIFEHUB_DB_PORT e DATABASE_URL consistentes. A pasta `backend/.data/postgres` contém os dados locais.

### Teleconsulta LiveKit (demonstração acadêmica)

No painel LiveKit Cloud, obtenha a URL WebSocket e uma chave de API. Guarde exclusivamente no arquivo local `backend/.env`:

```dotenv
LIVEKIT_DEMO_ENABLED=true
LIVEKIT_URL=wss://SEU-PROJETO.livekit.cloud
LIVEKIT_API_KEY=SUA_CHAVE
LIVEKIT_API_SECRET=SEU_SEGREDO
```

Reinicie o LifeHub depois de alterar o .env. O provedor Daily não é mais usado. A sala abre 15 minutos antes da consulta remota confirmada e a interface fecha ao final do horário. O backend emite tokens temporários restritos à sala e ao participante. Tokens não devem ser enviados por chat nem publicados. A expiração do token não força a desconexão de uma sessão externa já iniciada.

Se a sala não abrir, confira a configuração sem imprimir os segredos, o horário da consulta, a conta autenticada e a internet. Autorize câmera e microfone no dispositivo. Se a WebView do Expo Go falhar, use a opção de navegador. O teste isolado pelo LiveKit Meet funcionou com notebook e celular sem cartão; a integração completa deve ser validada novamente após alterações. Não contrate serviços pagos para a demonstração; confirme os limites do plano no painel.

Para dois celulares, a rede Wi-Fi precisa permitir o acesso ao notebook ou deve haver uma conexão alternativa. O painel web pode ser disponibilizado na LAN com `$env:LIFEHUB_LAN = 'true'` antes de `npm run dev`; confira o IP via `ipconfig` e acesse `http://IP-DO-NOTEBOOK:5173/login`. A origem HTTP por IP de rede não é um contexto seguro de câmera: use a alternativa de sala HTTPS no navegador. A rede da faculdade pode isolar dispositivos. Não exponha o backend publicamente. A API, o banco, as consultas e o e-mail local não dependem de internet, desde que os serviços e dependências estejam instalados; LiveKit, mapas e CEP dependem de serviços externos.


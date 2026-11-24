# LifeHub — consultas sem demora

Aplicativo web (PWA) e aplicativo Android de demonstração (Expo Go, repositório lifehub-mobile) para encontrar médicos com CRM verificado e agendar consultas para você e seus dependentes.
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
- **Médico:** cadastro com **foto de perfil**, CRM e especialidade; local de atendimento com **CNES**, **CEP que preenche o endereço** e envio do **alvará**; documentos de verificação; serviços (presencial e teleconsulta); abertura de horários em lote, bloqueio e exclusão de horários futuros sem histórico; agenda com concluir e cancelar, histórico e cancelados; **conferência do vínculo** quando o paciente é dependente; notificações de consulta nova, cancelamento e decisões da administração (com o motivo).
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
- Cabeçalhos de segurança (helmet), CSP no build de produção, validação estrita de entrada e API escutando em `127.0.0.1` por padrão (configurável em desenvolvimento).
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


## Guia de apresentação na faculdade (Windows + Android)

**Roteiro testado:** notebook com painel médico, Android com Expo Go via USB e teleconsulta aberta no Chrome do celular. O LiveKit funcionou com vídeo nos dois dispositivos, sem cadastrar cartão. A WebView recebeu vídeo, mas não conseguiu ativar a câmera e o microfone do Android mesmo com permissões concedidas. A opção **Abrir no navegador** funcionou; mantenha esse fluxo para a apresentação. O teste com dois celulares pela rede da faculdade ainda não foi realizado.

### 1. Antes de sair de casa

- Leve o notebook, carregador, celular carregado e cabo USB-C que transmita dados (não apenas carga).
- Deixe Node.js, dependências dos dois repositórios, Android Platform Tools (ADB) e Expo Go instalados. Não dependa de downloads na faculdade.
- Confirme que o banco local, as contas fictícias e a configuração LiveKit já existem. Não copie o .env para o celular, não publique chaves, não rode reset-db.
- Se o projeto está funcionando, não atualize dependências nem faça git pull de última hora. Para baixar apenas esta documentação, faça isso antes de sair, enquanto há internet, conferindo antes o git status e preservando alterações locais.
- As contas fictícias usam a senha LifeHub2026: paciente mariana@lifehub.local; médicos helena@lifehub.local e rafael@lifehub.local; administrador admin@lifehub.local.
- Confira data, hora e fuso do Windows e Android (Recife, UTC-03). Uma sala só abre 15 minutos antes do horário e deixa de aceitar entrada no horário de término.
- Guarde este README localmente; não dependa de abrir o GitHub na hora.

### 2. Escolha a configuração

| Cenário | Paciente | Médico | Internet |
|---|---|---|---|
| Plano A (recomendado, já testado em casa) | Expo Go via USB; Chrome para vídeo | Notebook no Chrome | Wi-Fi da faculdade para vídeo |
| Plano B (dois celulares) | Expo Go via USB | Outro celular no Chrome, usando IP do notebook | Todos com acesso à internet para vídeo |
| Plano C (Wi-Fi isola os aparelhos) | Expo Go via USB | Notebook; ou segundo Android via ADB se houver outro cabo/porta | Wi-Fi para vídeo |
| Plano D (sem internet) | Expo Go via USB | Notebook | Somente fluxo local; vídeo LiveKit indisponível |

O notebook sempre roda o PostgreSQL, a API e o frontend. USB/ADB é o caminho do aplicativo para a API e para o Metro; o Wi-Fi do celular fornece internet ao LiveKit. Conectar o cabo **não** compartilha automaticamente a internet do computador com o Android. Sem dados móveis, conecte os celulares ao Wi-Fi da faculdade. Não é necessário rotear o 5G do celular.

### 3. Conectar ao Wi-Fi da faculdade

1. No Windows, abra Configurações > Rede e Internet > Wi-Fi e escolha a rede da faculdade.
2. No Android, abra Configurações > Wi-Fi e escolha a mesma rede. Se houver portal de acesso, conclua o login em cada aparelho.
3. Abra https://meet.livekit.io/ no notebook e no celular para conferir se o site externo carrega. Isso não comprova que o tráfego de mídia esteja liberado; o teste de chamada é indispensável.
4. No notebook, execute:

~~~powershell
ipconfig
Test-NetConnection meet.livekit.io -Port 443
~~~

Na saída de ipconfig, procure o adaptador **Wi-Fi** conectado e anote o endereço IPv4, por exemplo 192.168.1.25 (exemplo, não copie literalmente). Não use o IP do adaptador virtual, VPN, gateway ou 127.0.0.1 como endereço de outro aparelho. O IP pode mudar ao trocar de rede.

### 4. Terminal A — ligar o servidor local

Abra o PowerShell. Os caminhos abaixo são os utilizados no notebook de demonstração; ajuste se a pasta tiver mudado.

~~~powershell
cd "C:\Users\dcpla\OneDrive\Documentos\Projeto-Faculdade"
$env:LIVEKIT_DEMO_ENABLED = 'true'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:LIFEHUB_LAN = 'false'
npm run dev
~~~

Mantenha o terminal aberto. Aguarde a confirmação do PostgreSQL, API e Vite. O endereço do painel no próprio notebook é http://127.0.0.1:5173/login. A documentação da API é http://127.0.0.1:3000/api/docs. O PostgreSQL deve permanecer local.

Para testar sem autenticação, em outro PowerShell:

~~~powershell
curl.exe --max-time 5 -i http://127.0.0.1:3000/api/v1/professionals/me
curl.exe --max-time 5 -i http://127.0.0.1:5173/api/v1/professionals/me
~~~

Espere HTTP 401 nos dois (requisição sem token). Depois faça login e confira a agenda para validar também o banco. Se a variante HOST=127.0.0.1 não funcionar via ADB no seu Windows, o procedimento usado nos testes anteriores foi HOST=0.0.0.0; para adotá-lo, pare o servidor, configure $env:HOST = '0.0.0.0' e execute npm run dev novamente. Isso expõe a escuta da API à rede: use apenas dados fictícios, não abra a porta 3000 no firewall e volte ao modo local depois.

### 5. Terminal B — conectar o Android via USB-C e iniciar Expo Go

1. No Android, abra Configurações > Sobre o telefone > Informações do software (o nome varia). Toque sete vezes em Número da versão/compilação até habilitar as opções de desenvolvedor.
2. Em Opções do desenvolvedor, ative Depuração USB. Conecte o cabo ao notebook, desbloqueie a tela, aceite a autorização RSA do seu computador. Se necessário, selecione Transferência de arquivos no menu USB.
3. Abra outro PowerShell:

~~~powershell
$adb = "C:\platform-tools\platform-tools-latest-windows\platform-tools\adb.exe"
& $adb devices -l
& $adb reverse tcp:3000 tcp:3000
& $adb reverse tcp:8083 tcp:8083
& $adb reverse --list

cd "C:\Users\dcpla\Downloads\LifeHub-Mobile-SDK58\LifeHub\mobile"
npx expo start --go --port 8083 --localhost
~~~

O aparelho precisa aparecer como device. As duas portas devem aparecer em reverse --list. Abra o Expo Go; no terminal do Expo pressione a para abrir no Android conectado. Alternativamente, informe exp://127.0.0.1:8083 no Expo Go se sua versão permitir a entrada manual de URL. Mantenha o cabo conectado. A porta 8083 é do Metro e 3000 é da API; se o Metro oferecer outra porta, prefira liberar a 8083 ou faça o reverse da porta efetivamente escolhida. Não confunda com a porta 5173 (site).

Se o Metro tentar buscar informações externas sem internet, tente npx expo start --go --port 8083 --localhost --offline, com as dependências e Expo Go já instalados. Não use --tunnel como primeira opção; exige internet e pode pedir dependências adicionais. A API do app atual é fixa em 127.0.0.1:3000: mudar apenas o modo LAN do Expo ou escanear um QR de Wi-Fi não muda essa API. Por isso o USB é o caminho recomendado.

### 6. Plano B — segundo celular como médico no Wi-Fi

Para que o segundo celular acesse o **site**, não é necessário instalar Expo Go. O frontend em desenvolvimento possui proxy /api/v1 para a API do notebook. Assim, não precisamos expor a porta 3000 nem mudar a URL da API para cada celular.

1. Pare somente o terminal A com Ctrl+C; mantenha o Metro aberto.
2. No terminal A:

~~~powershell
cd "C:\Users\dcpla\OneDrive\Documentos\Projeto-Faculdade"
$env:LIVEKIT_DEMO_ENABLED = 'true'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:LIFEHUB_LAN = 'true'
npm run dev
~~~

3. Em outro PowerShell, confira se o Vite escuta na rede:

~~~powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen |
    Select-Object LocalAddress, LocalPort, OwningProcess
ipconfig
~~~

Espera-se 0.0.0.0:5173 (ou escuta equivalente na rede). Anote o IPv4 do Wi-Fi. Se apareceu apenas 127.0.0.1, verifique se a variável LIFEHUB_LAN foi definida no mesmo terminal antes de iniciar.
4. No Chrome do segundo celular conectado à mesma rede, digite http://IP-DO-NOTEBOOK:5173/login, substituindo o IP pelo endereço real. Exemplo: http://192.168.1.25:5173/login.
5. Entre na conta do médico de demonstração. No celular do paciente, mantenha o USB com ADB e Expo Go. O mesmo banco é compartilhado entre ambos.

**Cuidado:** essa conexão LAN é HTTP sem criptografia. Use exclusivamente contas e dados fictícios numa rede autorizada. Não use senhas pessoais, CPF real ou documentos. Não abra o banco ou a porta 3000 para a rede. Não use encaminhamento público de portas. Em HTTP por IP, o navegador pode restringir câmera/microfone e APIs como crypto.randomUUID; o painel médico pode abrir a sala pelo botão de navegador HTTPS. Se a interface web não funcionar, volte ao notebook via 127.0.0.1, que é um contexto seguro para APIs do navegador.

### 7. Se o segundo celular não acessar o site

Primeiro, verifique no próprio notebook se http://127.0.0.1:5173/login funciona e se o endereço http://IP-DO-NOTEBOOK:5173/login abre. Se o primeiro funciona e o segundo não, revise a escuta do Vite, IP e firewall. Confirme que o celular está no Wi-Fi correto e não em rede de convidados isolada.

Se houver bloqueio de firewall e você tiver autorização para alterar o notebook, abra PowerShell como administrador. Crie uma exceção **temporária e restrita ao IP do segundo celular**, obtido nos detalhes do Wi-Fi do Android. Não desative o firewall:

~~~powershell
$ipCelular = Read-Host "IPv4 do celular do medico"
New-NetFirewallRule -DisplayName "LifeHub demo 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -RemoteAddress $ipCelular -Profile Any
~~~

Teste o acesso novamente. Ao acabar a apresentação, remova a regra no PowerShell administrador:

~~~powershell
Remove-NetFirewallRule -DisplayName "LifeHub demo 5173"
~~~

Se a rede da faculdade bloquear comunicação entre clientes (isolamento/AP isolation), a regra não resolve. Não tente contornar políticas da instituição. Use o Plano A (notebook como médico) ou uma alternativa autorizada abaixo.

### 8. Alternativas de rede

**Hotspot do Windows:** se permitido pela faculdade, vá a Configurações > Rede e Internet > Hotspot móvel. Escolha compartilhar a conexão Wi-Fi com outros dispositivos por Wi-Fi; configure nome e senha, ative, conecte os celulares e verifique o novo IPv4 do adaptador de hotspot no notebook com ipconfig. Repita a configuração LAN e o acesso pelo novo IP. Isso depende de o adaptador e a rede permitirem compartilhamento. Sem internet de origem, o hotspot não garante acesso ao LiveKit.

**Hotspot de outro celular:** se alguém tiver internet móvel e autorizar o uso, ative o hotspot nesse celular, conecte notebook e demais aparelhos à rede criada e repita os passos do Plano B. Não dependa disso se ninguém tiver dados móveis. Verifique franquia e qualidade da conexão antes.

**Dois Android por USB:** se houver segundo cabo de dados e porta USB, habilite depuração em ambos e liste & $adb devices -l. Use o serial mostrado para selecionar cada aparelho, substituindo SERIAL_PACIENTE e SERIAL_MEDICO abaixo pelos valores reais:

~~~powershell
& $adb -s SERIAL_PACIENTE reverse tcp:3000 tcp:3000
& $adb -s SERIAL_PACIENTE reverse tcp:8083 tcp:8083
& $adb -s SERIAL_MEDICO reverse tcp:5173 tcp:5173
~~~

No celular médico, abra http://127.0.0.1:5173/login no Chrome; no paciente, abra Expo Go normalmente. Se o comando a do Expo perguntar qual dispositivo usar, selecione o paciente. Esse método não depende da comunicação LAN entre aparelhos, mas ainda precisa de internet para a chamada. A configuração de dois cabos é uma alternativa prevista, ainda não testada neste ambiente.

### 9. Roteiro da teleconsulta

1. No painel médico, abra Serviços e confirme que existe uma teleconsulta ativa (30 minutos). Em Horários, escolha um intervalo futuro livre e sem sobreposição, de preferência com início entre 5 e 15 minutos depois da hora atual. Use a mesma data em De e Até.
2. Se houver conflito, o médico pode excluir pelo ícone de lixeira somente horários futuros livres/bloqueados sem histórico de consulta. Horário bloqueado também ocupa o intervalo. Não exclua consultas existentes para forçar a demonstração. Se necessário, utilize outro médico fictício.
3. No celular paciente, filtre por teleconsulta, selecione o médico e agende o horário para o titular fictício. Abra Minha agenda. No painel médico, atualize Atendimentos se necessário.
4. Quando faltar no máximo 15 minutos, toque Entrar na teleconsulta no painel médico. No Expo Go, toque Entrar na teleconsulta e depois **Abrir no navegador** (alternativa validada). Não copie links manualmente, pois cada participante recebe o próprio token.
5. Permita câmera e microfone no Chrome. No celular, se estiverem negados, vá a Configurações > Aplicativos > Chrome > Permissões; no próprio Chrome, confira as permissões do site meet.livekit.io. Feche outras chamadas que estejam usando a câmera.
6. Confirme que aparecem Médico e Paciente, teste imagem em ambos os sentidos e áudio. Se os dispositivos estiverem próximos, reduza o volume ou use fones para evitar microfonia.
7. Use Leave para sair da chamada nos dois aparelhos. Feche a sala no LifeHub. O médico pode registrar presença conforme a regra de horário do sistema. A saída da sala não conclui automaticamente a consulta.

Se o botão estiver desativado, confira o status confirmado, modalidade remota, horário e fuso. Se o intervalo terminou, crie outro horário; não altere o relógio do sistema. Se aparecer "Videochamada de demonstração ainda não configurada", confira as variáveis LIVEKIT_* no .env e reinicie o terminal A. Se abrir o Daily ou pedir pagamento, verifique se backend e mobile estão na versão LiveKit (V28 ou posterior); não cadastre cartão. Se a câmera não ativar no Expo Go, não perca tempo reinstalando: use Chrome. Se a sala conectar mas não transmitir mídia em nenhum dispositivo, teste a internet e as permissões; a rede pode bloquear tráfego de mídia mesmo quando HTTPS funciona.

### 10. Plano sem internet e encerramento

O backend, PostgreSQL, site local, login, agenda, agendamento, cancelamento e e-mail local podem funcionar sem internet quando já instalados e iniciados. Mapa/CEP podem falhar ou ficar incompletos. A teleconsulta com LiveKit Cloud precisa de internet; não a apresente como chamada offline. Mostre o agendamento de teleconsulta e explique a dependência da rede caso esteja indisponível.

Ao terminar, saia das chamadas, encerre Metro e servidor com Ctrl+C em seus respectivos terminais. Remova a regra temporária do firewall, se criada, e desfaça os encaminhamentos ADB utilizados (com -s SERIAL se houver mais de um aparelho):

~~~powershell
& $adb reverse --remove tcp:3000
& $adb reverse --remove tcp:8083
# Somente se tiver usado o reverse do site:
# & $adb reverse --remove tcp:5173
~~~

Desative o hotspot/depuração USB se não precisar mais. Nunca execute reset-db para encerrar a apresentação.

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

Se a sala não abrir, confira a configuração sem imprimir os segredos, o horário da consulta, a conta autenticada e a internet. Autorize câmera e microfone no dispositivo. Se a WebView do Expo Go falhar, use a opção de navegador. O teste isolado pelo LiveKit Meet e a integração do LifeHub (painel médico + Chrome no celular, aberto pelo aplicativo) funcionaram sem cartão. A WebView recebeu vídeo, mas não ativou câmera e microfone; use a alternativa pelo navegador. A rede da faculdade e o cenário com dois celulares ainda precisam de teste no local. Não contrate serviços pagos para a demonstração; confirme os limites do plano no painel.

Para dois celulares, a rede Wi-Fi precisa permitir o acesso ao notebook ou deve haver uma conexão alternativa. O painel web pode ser disponibilizado na LAN com `$env:LIFEHUB_LAN = 'true'` antes de `npm run dev`; confira o IP via `ipconfig` e acesse `http://IP-DO-NOTEBOOK:5173/login`. A origem HTTP por IP de rede não é um contexto seguro de câmera: use a alternativa de sala HTTPS no navegador. A rede da faculdade pode isolar dispositivos. Não exponha o backend publicamente. A API, o banco, as consultas e o e-mail local não dependem de internet, desde que os serviços e dependências estejam instalados; LiveKit, mapas e CEP dependem de serviços externos.


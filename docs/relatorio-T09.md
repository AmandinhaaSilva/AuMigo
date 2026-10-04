# Relatório T09 — animais e solicitações de adoção

Estado: implementação concluída e autoverificação aprovada. O Portal desktop/celular não foi usado, conforme a divisão de responsabilidade definida pelo Orquestrador.

## Resultado

- O catálogo público consulta somente animais com `published == true` e `adoptionStatus == available`, ordenados por `sortOrder`, e filtra sexo, porte e faixa etária no cliente.
- O detalhe resolve um ID seguro, usa Firestore/Storage e informa animal ausente, oculto ou indisponível sem fallback para Luna.
- A submissão pública usa o payload exato das Rules, normaliza telefone e UF, usa timestamps do servidor, honeypot, tempo mínimo, bloqueio durante envio e um ID por tentativa em `sessionStorage`.
- O painel continua protegido pela guarda T07/T08 e carrega o módulo T09 dinamicamente somente depois da autorização. Ele oferece CRUD de animais/mídia e tratamento/exclusão de solicitações dentro das transições permitidas.
- A troca de imagem segue upload novo, gravação do documento e somente então remoção do objeto anterior. Uma falha na limpeza final preserva o documento e informa o caminho órfão.
- `firestore.rules`, `storage.rules` e `firestore.indexes.json` não foram alterados: o contrato T06 já era compatível.

## Arquivos da tarefa

- `README.md`
- `docs/adocoes-local.md`
- `docs/relatorio-T09.md`
- `package.json`
- `scripts/fixtures/adoptions-t09.mjs`
- `scripts/verify-adoptions.mjs`
- `scripts/verify-admin-panel.mjs`
- `web/adocoes/index.html`
- `web/adocoes/detalhe/index.html`
- `web/admin/painel/index.html`
- `web/src/features/adoptions-catalog.js`
- `web/src/features/animal-detail.js`
- `web/src/features/admin-adoptions.js`
- `web/src/features/admin-panel.js`
- `web/src/services/adoption-attempt.js`
- `web/src/services/adoptions-data.js`
- `web/src/styles/site.css`

`package-lock.json` não mudou porque nenhuma dependência foi adicionada.

## Comandos e evidências

- `npm run build`: passou com Vite 8.3.2 e 45 módulos. A redução ante os 73 do baseline é esperada: os imports das 12 imagens estáticas saíram e as imagens agora vêm do Storage.
- `npm run verify:t09`: 18/18 cenários passaram, zero falhos; dados temporários removidos.
- `npm run test:rules`: 21/21 passaram (14 Firestore e 7 Storage). O estado local foi restaurado depois da limpeza interna da suíte.
- `npm run verify:auth`: 7/7 passaram.
- `npm run verify:panel`: uma primeira execução encontrou 9/10 porque o verificador T08 exigia exatamente quatro links. A asserção foi corrigida para exigir os quatro destinos T08 sem proibir os novos links T09; a execução final passou 10/10.
- `npm run fixtures:adoptions` foi executado duas vezes consecutivas e manteve os mesmos três IDs.
- Parse de `package.json`, `package-lock.json`, `firebase.json` e `firestore.indexes.json`: 4/4.
- `npm ls --depth=0`, `git diff --check` e `node --check` dos sete JS/MJS novos: passaram.
- Varredura do código T09: zero credenciais, destinos Firebase remotos, PHP/MySQL, cadastro público, fallback Luna ou URL local fixa nova no aplicativo.
- Hosting Emulator: `/adocoes`, `/adocoes/detalhe?animal=t09-luna` e `/admin/painel` responderam HTTP 200.

## Dados locais

A fixture deixa somente estes dados demonstrativos de T09:

- `animals/t09-luna` e sua imagem PNG;
- `animals/t09-thor` e sua imagem PNG;
- `animals/t09-jade` e sua imagem PNG.

Nenhuma `adoptionRequest` de teste permaneceu. `siteSettings/public` mantém a marca, o contato provisório e a saudação confirmados na revisão final. As contas locais continuam sendo `admin@aufriends.local` / `AuFriendsLocal!2026` e `usuario@aufriends.local` / `UsuarioLocal!2026`, proibidas fora de `demo-aufriends-local`.

## Revisão do Orquestrador

- O Portal Maestri confirmou catálogo, filtros, detalhe sem fallback, validação do formulário e envio público; a mesma tentativa ficou bloqueada após recarregar a página.
- O pedido fictício foi visualizado no painel, avançou por `pending → contacting → approved` e foi excluído. O painel também criou, editou e excluiu um animal com imagem gerada no navegador; as métricas voltaram a 3 animais e 0 solicitações.
- Desktop 1440×900 e celular 390×844 ficaram sem rolagem horizontal, imagens quebradas ou erros no console.
- A revisão encontrou uma regressão no botão “Limpar filtros”: o evento renderizava antes do reset nativo. `web/src/features/adoptions-catalog.js` passou a reagendar a renderização para a próxima tarefa; o cenário falho foi repetido e os três animais reapareceram.
- A saudação local ficou com codificação incorreta após a preservação de estado durante os testes de Rules. O documento foi salvo novamente pelo painel como `Olá! Quero finalizar meu pedido com a equipe AuFriends.` e conferido após nova navegação.
- Quatro objetos temporários antigos da suíte de Storage foram removidos por caminho exato. Permaneceram somente as três imagens da fixture `t09-luna`, `t09-thor` e `t09-jade`.
- Na versão final, `npm run build` passou com 45 módulos, `npm run verify:t09` repetiu 18/18 e as nove rotas responderam HTTP 200.

## Riscos e limitações

- A conferência visual desktop/celular permanece com o Orquestrador.
- O chunk Firebase compartilhado tem 572,24 kB e mantém o aviso de tamanho do baseline.
- Honeypot e tempo mínimo não substituem App Check/rate limit; esse risco segue para T13.
- O risco transitivo de `@grpc/grpc-js` permanece e nenhum `audit fix --force` foi executado.
- `npm ci` não foi repetido enquanto os emuladores controlados pelo Orquestrador mantinham módulos nativos abertos no Windows; lock/dependências foram conferidos por parse JSON, `npm ls` e build.

Nenhum commit, deploy, login remoto, reinício ou parada de serviço foi realizado. Permaneceram ativos em `127.0.0.1`: UI `4000`, hub `4400`, Hosting `5000`, Firestore `8080`, Auth `9099` e Storage `9199`.

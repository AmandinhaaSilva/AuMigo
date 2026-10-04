# AuFriends

Base local reproduzível do AuFriends para reconstruir o site legado sobre Firebase. A aplicação nova já possui nove páginas em Vite, regras testadas de Firestore/Storage, autenticação administrativa, painel protegido e os fluxos funcionais de adoção, doação, catálogo de produtos, carrinho local e finalização assistida pelo WhatsApp; o PHP recebido permanece apenas como referência histórica.

## Pré-requisitos

- Node.js 22.12 ou mais recente e npm 10 ou mais recente;
- JDK 21 LTS;
- Windows PowerShell para os exemplos abaixo.

O Firebase CLI 15 exige Java 21 para os emuladores. No Windows, instale o JDK usado nesta base com:

```powershell
winget install --exact --id Microsoft.OpenJDK.21 --accept-package-agreements --accept-source-agreements
```

Abra um terminal novo e confira:

```powershell
java -version
```

Se o terminal já estava aberto durante a instalação, recarregue o Java 21 apenas nessa sessão:

```powershell
$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

## Instalação e build

Na raiz do repositório:

```powershell
npm ci
npm run build
```

O build multipágina usa `web/` como fonte e gera somente arquivos estáticos em `dist/`.

No Windows, encerre `npm run emulators` antes de repetir `npm ci`. O processo do Emulator Suite mantém módulos nativos da CLI abertos e pode causar `EPERM` durante a limpeza de `node_modules`.

## Emuladores locais

Inicie Hosting, Authentication, Cloud Firestore e Cloud Storage com um único comando:

```powershell
npm run emulators
```

O script sempre recompila a aplicação e fixa o projeto fictício `demo-aufriends-local`; ele não usa credenciais nem acessa o projeto Firebase remoto configurado para produção.

Serviços locais:

| Serviço | URL |
| --- | --- |
| Página pelo Hosting Emulator | http://127.0.0.1:5000 |
| Emulator Suite UI | http://127.0.0.1:4000 |
| Authentication | http://127.0.0.1:9099 |
| Cloud Firestore | http://127.0.0.1:8080 |
| Cloud Storage | http://127.0.0.1:9199 |

As permissões de `firestore.rules` e `storage.rules` usam negação por padrão, liberam somente os fluxos públicos previstos e exigem um documento `admins/{uid}` ativo nas operações administrativas. A suíte atual cobre 14 cenários de Firestore e 7 de Storage:

```powershell
npm run test:rules
```

Com os emuladores ativos, aplique todo o baseline fictício com um único comando:

```powershell
npm run seed:emulators
```

O seed confirma projeto, Hub e portas de loopback antes de escrever. Ele faz upsert de duas contas Auth, um administrador ativo, configuração pública, três animais e sete produtos com dez mídias fixas. Rodar novamente não duplica IDs nem altera `createdAt`; documentos desconhecidos e submissões não são apagados. Os comandos específicos continuam disponíveis para manutenção e regressão:

```powershell
npm run fixtures:auth
npm run fixtures:adoptions
npm run fixtures:products
npm run verify:auth
npm run verify:panel
npm run verify:t09
npm run verify:t10
npm run verify:t11
npm run verify:t12
npm run verify:t17
```

As credenciais descartáveis e o procedimento estão em `docs/autenticacao-admin-local.md`. As fixtures são idempotentes, não leem o SQL antigo e recusam serviços fora dos emuladores locais esperados. O painel protegido, suas métricas e a configuração pública do site estão documentados em `docs/painel-admin-local.md`; adoções estão em `docs/adocoes-local.md`, doações em `docs/doacoes-local.md` e catálogo/carrinho em `docs/produtos-carrinho-local.md`.
O checkout T17 apenas abre uma mensagem conferível em `wa.me`, mantém o carrinho e está documentado em `docs/checkout-whatsapp-local.md`; não há pedido, pagamento ou reserva de estoque. A operação e as evidências do seed consolidado estão em `docs/relatorio-T12.md`.

## Configuração

O adaptador em `web/src/config/firebase-client.js` conecta `localhost` e `127.0.0.1` exclusivamente ao projeto `demo-aufriends-local` nos emuladores. Em uma origem HTTPS publicada, ele usa a configuração web do projeto remoto autorizado. Os padrões já permitem executar um clone limpo. `.env.example` documenta apenas valores fictícios e pode ser copiado para `.env.local` se for necessário mudar portas locais:

```powershell
Copy-Item .env.example .env.local
```

Deploys remotos devem sempre informar explicitamente `--project memberverse-sfhf9` e ocorrer somente com autorização do responsável. As decisões de arquitetura, coleções e segurança estão em `docs/arquitetura-firebase-aufriends.md` e `docs/modelo-firestore.md`.

## Aviso sobre dependências

Na validação de 03/10/2026, `npm audit --omit=dev` reportou quatro alertas altos herdados de `@grpc/grpc-js@1.9.16` pelo pacote `firebase@12.19.0`. Esse transporte de servidor não entra no bundle web gerado pelo Vite, e a correção automática proposta exige um downgrade principal do Firebase. Não execute `npm audit fix --force`: reavalie o alerta quando o SDK oficial atualizar a dependência e novamente na revisão de segurança T13.

## Ambiente remoto atual

O front-end de validação está em `https://memberverse-sfhf9.web.app`. Authentication e Firestore usam o projeto `memberverse-sfhf9`; as imagens administráveis ficam no bucket R2 `aufriends-media` e são servidas pelo Worker `aufriends-media-api`. O domínio definitivo e a migração do front-end para Vercel permanecem como etapa separada.

O procedimento de criação de administradores e troca/recuperação de senha está em `docs/operacao-admin-producao.md`. A senha temporária entra de forma mascarada por `stdin`, não é repassada aos subprocessos operacionais e nunca deve ser versionada.

As imagens da home usam WebP responsivo e preload. Depois da primeira renderização, o cliente aquece em baixa prioridade as imagens das demais páginas e do catálogo; mídias R2 usam caminhos versionados e cache imutável. Isso antecipa as próximas navegações sem bloquear o conteúdo inicial.

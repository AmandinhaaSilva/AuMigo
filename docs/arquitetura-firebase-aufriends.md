# T03 — Arquitetura Firebase do AuFriends

Status: decisão aprovada para orientar T04, T05 e T06

Base analisada: `24d2fef574cc8b40658e49ed0b1876467191933c` (`main`)

Data: 03/10/2026

## Problema e contexto

O baseline é um site multipágina em PHP, HTML, CSS e JavaScript, com includes e sessões PHP, acesso MySQL direto, páginas públicas em grande parte estáticas, painel administrativo incompleto e carrinho em `localStorage`. O destino é Firebase Hosting, que não executa PHP. Portanto, a menor mudança estrutural suficiente é manter o site multipágina e seu HTML/CSS/identidade visual, substituir apenas renderização e persistência por JavaScript modular e serviços Firebase e eliminar o backend PHP/MySQL.

Restrições confirmadas:

- banco e usuários começam vazios; não há SQL, dados, senhas ou contas a migrar;
- visitantes não criam conta nem fazem login;
- somente administradores autenticam e gerenciam conteúdo e solicitações;
- adoção e doação são submissões de contato, não transações financeiras;
- carrinho continua local e finaliza no WhatsApp; pagamento e Pix acontecem fora do site;
- publicação, projeto remoto, região, domínio e billing ainda dependem de autorização;
- o visual existente é baseline: reutilizar CSS, assets e composição; não introduzir framework visual nem redesenhar telas.

## Decisão

Construir uma aplicação web estática multipágina (MPA) com Vite, JavaScript ES modules e Firebase Web SDK modular instalado por npm. O build gera `dist/`, único diretório publicado no Firebase Hosting. Não adotar React, Vue, SSR, App Hosting nem uma SPA: não há necessidade funcional que compense reescrever rotas e marcação existentes.

O navegador fala diretamente com Authentication, Cloud Firestore e Cloud Storage. Firestore Rules e Storage Rules são a fronteira de autorização e validação; esconder botões ou proteger rotas no cliente é apenas UX. Firebase App Check reduz abuso em ambientes remotos. Cloud Functions fica fora da primeira versão.

| Componente | Responsabilidade | Fronteira |
| --- | --- | --- |
| Firebase Hosting | servir HTML, CSS, JS, fontes e assets do build | somente arquivos estáticos de `dist/` |
| Cliente público | listar animais/produtos, enviar adoção/doação, manter carrinho e abrir WhatsApp | lê apenas dados publicados; cria apenas submissões válidas; não lê submissões |
| Cliente administrativo | login, CRUD de catálogo/mídia, leitura e tratamento de submissões | toda operação depende de Auth **e** autorização nas Rules |
| Firebase Authentication | login, persistência, logout e recuperação de senha de administradores | não existe cadastro/login público |
| Cloud Firestore | conteúdo, submissões, autorização administrativa e configuração pública | nega por padrão; contratos abaixo |
| Cloud Storage | imagens administráveis de animais e produtos | leitura pública nas pastas de mídia; escrita só de administrador |
| App Check | atestar o cliente web e reduzir automação oportunista | não inicializar no modo emulador; monitorar antes de impor em staging/produção |
| Controle privilegiado | criar/desativar contas e entradas de `admins` | Console/ambiente Admin SDK autorizado, nunca o navegador |

Estrutura-alvo mínima:

```text
web/
  index.html
  sobre/index.html
  doacoes/index.html
  adocoes/index.html
  adocoes/detalhe/index.html
  loja/index.html
  carrinho/index.html
  admin/index.html
  src/
    components/        # cabeçalho, rodapé, cards e mensagens compartilhados
    config/            # inicialização Firebase e seleção local/remota
    services/          # auth, firestore, storage e app-check
    repositories/      # contrato de acesso por coleção
    features/          # adoção, doação, catálogo, carrinho e painel
    styles/            # CSS existente, ajustado sem troca de identidade
  assets/
scripts/               # seed somente de emuladores e verificações
tests/rules/            # testes Firestore/Storage no Emulator Suite
dist/                   # build descartável; não é fonte
```

As URLs antigas devem receber redirects ou equivalentes com `cleanUrls`; caminhos novos não devem conter `.php`, acentos ou referências locais absolutas.

## Decisão explícita sobre Cloud Functions

**Não inicializar nem implantar Cloud Functions em T04–T06.** CRUD administrativo é seguro com Auth + Rules; submissões públicas cabem em `create` direto e validado; carrinho/WhatsApp é inteiramente local. Functions acrescentaria runtime, deploy, observabilidade e superfície de falha sem ação privilegiada necessária hoje.

Reavaliar uma Function HTTP/callable somente se ocorrer ao menos um destes fatos: spam verificado pelo App Check continuar gerando custo/moderação material; surgir exigência de rate limit forte, notificação com segredo, transformação/limpeza automática de mídia, integração externa ou pagamento. Nesse caso, a Function recebe App Check, valida novamente o payload e aplica limite/deduplicação no servidor. Se for criada, usar `southamerica-east1`, limites de instância e orçamento próprios. Functions de bloqueio de Auth não entram no escopo atual.

## Ambientes, região, configuração e segredos

| Ambiente | Projeto/recursos | Dados | Deploy |
| --- | --- | --- | --- |
| local | `demo-aufriends-local`; Hosting, Auth, Firestore e Storage em emuladores | fixtures fictícias e descartáveis | `firebase emulators:start --project demo-aufriends-local`; nunca usa projeto remoto |
| staging | projeto Firebase independente | somente dados e administradores de teste | alias explícito `staging`; preview channels, se usados, somente aqui |
| produção | projeto Firebase independente | dados reais mínimos | alias explícito `production`, autorização manual e smoke test |

Não compartilhar Auth, Firestore ou Storage entre staging e produção. Não manter alias remoto `default`; scripts de deploy exigem `--project staging` ou `--project production`. O mesmo commit é compilado por modo e promovido após validação.

Escolha regional para os projetos remotos: **Firestore Standard e bucket em `southamerica-east1` (São Paulo)**, próximos ao público brasileiro. A escolha deve ser confirmada imediatamente antes do provisionamento porque a localização de cada recurso não muda depois. Ela prioriza latência e localização sobre o nível “Always Free” de Storage, disponível apenas em regiões específicas dos EUA. Se o proprietário optar formalmente por custo mínimo em vez disso, `us-central1` é a alternativa; não misturar regiões por acidente. Hosting permanece global.

Configuração do navegador por modo de build (`.env.local`, `.env.staging`, `.env.production`) com chaves `VITE_FIREBASE_*` e `VITE_APP_CHECK_SITE_KEY`. O objeto de configuração Firebase e a site key do App Check identificam o projeto e **não são segredos**; Rules e App Check protegem os recursos. Mesmo assim, separar os valores evita que staging escreva em produção. Manter `.env.example` sem IDs reais quando estes ainda não existirem.

Segredos reais — service account, credenciais Admin SDK, tokens de CI, debug token do App Check e senhas — nunca entram no Git, em `VITE_*`, no HTML, Firestore ou logs. Usar login interativo local ou identidade curta do CI/secret store. O número do WhatsApp é configuração pública no Firestore, não segredo. Nenhuma credencial remota é necessária para emuladores.

## Contrato de dados

Convenções: IDs automáticos aleatórios para submissões; IDs estáveis no seed; campos em `camelCase`; valores monetários em centavos inteiros; `serverTimestamp` para timestamps; `schemaVersion: 1` em todos os documentos de domínio. Strings são normalizadas no cliente e novamente limitadas nas Rules. Estados internos permanecem em inglês e a interface os traduz.

### Coleções e campos

| Documento | Campos obrigatórios e limites | Acesso |
| --- | --- | --- |
| `animals/{animalId}` | `name` 1–80, `species` (`dog`,`cat`,`other`), `breed` 0–80, `ageMonths` inteiro 0–360, `sex` (`male`,`female`), `size` (`small`,`medium`,`large`), `color` 0–60, `description` 1–2000, `adoptionStatus` (`available`,`in_process`,`adopted`), `published` boolean, `sortOrder` inteiro, `imagePath`, `imageAlt` 1–140, `createdAt`, `updatedAt`, `updatedBy` | público lê somente `published == true`; administrador cria/edita/remove |
| `adoptionRequests/{requestId}` | `animalId`, `fullName` 2–120, `email` 5–254, `phoneE164` 10–16, `city` 2–100, `state` 2, `message` 0–1500, `privacyConsent == true`, `status == pending` na criação, `adminNotes` 0–2000, `handledBy` nulo na criação, `createdAt == request.time`, `updatedAt == request.time` | público somente cria; administrador lista, lê e altera tratamento |
| `donations/{donationId}` | `fullName` 2–120, `email` 5–254, `phoneE164` vazio ou 10–16, `type` (`money`,`food`,`hygiene`,`clothing`,`blanket`,`other`), `amountOrQuantity` 1–160, `deliveryMethod` (`dropoff`,`pickup`,`arrange`), `message` 0–1500, `privacyConsent == true`, `status == received` na criação, `adminNotes` 0–2000, `handledBy` nulo, `createdAt == request.time`, `updatedAt == request.time` | público somente cria; administrador lista, lê e altera tratamento |
| `products/{productId}` | `name` 1–120, `description` 1–1500, `category` (`food`,`treats`,`accessories`,`hygiene`,`clothing`,`toys`), `priceCents` inteiro >= 0, `compareAtPriceCents` inteiro >= 0 ou nulo, `badge` 0–40, `active` boolean, `sortOrder` inteiro, `imagePath`, `imageAlt` 1–140, `createdAt`, `updatedAt`, `updatedBy` | público lê somente `active == true`; administrador cria/edita/remove |
| `admins/{uid}` | `displayName` 1–120, `email` 5–254, `active` boolean, `createdAt`, `updatedAt` | somente administrador ativo lê; toda escrita do Web SDK é negada e ocorre pelo controle privilegiado |
| `siteSettings/public` | `brandName` 1–80, `whatsappDigits` somente 10–15 dígitos, `whatsappGreeting` 1–300, `updatedAt`, `updatedBy` | leitura pública; escrita somente de administrador |

Não criar coleções de usuários/clientes, carrinhos, pedidos, pagamentos, Pix ou dados bancários. Doações registram intenção e contato; não guardar comprovante. Adoções não pedem CPF nem endereço completo. Política de retenção deve ser aprovada antes de produção; até lá, não automatizar TTL e permitir exclusão administrativa dos contatos encerrados.

### Estados e transições

- animal: `available` → `in_process` → `adopted`; administrador pode reabrir para `available` quando necessário;
- adoção: `pending` → `contacting` → `approved` ou `rejected`; reabertura administrativa volta a `contacting`;
- doação: `received` → `contacting` → `completed`; reabertura administrativa volta a `contacting`;
- produto: `active` controla publicação; não existe estoque transacional nesta versão.

Rules validam enumeração e campos permitidos. Nas submissões, o público não escolhe outro estado. Em updates administrativos, `updatedAt` deve ser `request.time` e `handledBy` deve ser o UID autenticado quando houver tratamento.

### Consultas e índices

| Uso | Consulta | Índice composto versionado |
| --- | --- | --- |
| animais públicos | `published == true`, `adoptionStatus == available`, `orderBy(sortOrder)` | `published ASC, adoptionStatus ASC, sortOrder ASC` |
| produtos públicos | `active == true`, `orderBy(sortOrder)` | `active ASC, sortOrder ASC` |
| adoções no painel | `status == X`, `orderBy(createdAt, desc)` | `status ASC, createdAt DESC` |
| doações no painel | `status == X`, `orderBy(createdAt, desc)` | `status ASC, createdAt DESC` |

Filtros visuais de sexo, porte, idade, categoria e preço permanecem no cliente sobre o conjunto público pequeno, evitando uma combinação de índices. Detalhe de animal usa `get` por ID e só abre se publicado. Listas administrativas sem filtro usam `orderBy(updatedAt/createdAt, desc)`, atendido por índice de campo único. As consultas públicas precisam incluir as mesmas condições exigidas pelas Rules; Rules não filtram resultados.

## Authentication e autorização administrativa

Usar Firebase Authentication com Email/Password apenas na tela `/admin`. Não criar tela nem chamada de cadastro público. Contas remotas são pré-provisionadas pelo operador autorizado; a conta local vem do seed. Habilitar recuperação de senha, proteção contra enumeração de e-mail e mensagens de erro genéricas.

Não tratar a ausência de tela de cadastro como uma fronteira de segurança. Mesmo que uma conta Auth não provisionada seja criada por acesso direto ao endpoint público do provedor, ela não recebe privilégios porque não possui `admins/{uid}` ativo. T07 e T13 devem testar explicitamente esse cenário e o operador deve remover contas não reconhecidas; se no futuro for requisito impedir tecnicamente a criação dessas contas, será necessária uma decisão adicional de identidade/backend, sem enfraquecer as Rules atuais.

Autenticação sozinha não concede acesso. A função de Rules `isAdmin()` exige `request.auth != null` e `admins/{uid}.active == true`. Firestore Rules usa `get()`; Storage Rules usa `firestore.get()` para a mesma fonte. A consulta cruzada do Storage deve ser habilitada e testada, e conta como leitura Firestore. O guard de rota verifica Auth e o registro ativo para melhorar UX, mas as Rules continuam soberanas.

Nem o próprio administrador altera `admins` pelo navegador. Provisionamento/desativação é um procedimento de controle: criar/desativar a conta no Auth e criar/atualizar o documento de mesmo UID por Console ou script Admin SDK autorizado. Senhas nunca vão para Firestore. Custom claims foram descartadas na primeira versão porque exigiriam mais um fluxo privilegiado, sincronização de token e duas fontes de verdade; podem substituir o lookup se escala/custo de Rules justificar.

## Submissões públicas e abuso proporcional

`adoptionRequests` e `donations` permitem apenas `create` anônimo; `get`, `list`, `update` e `delete` públicos são negados. Rules aplicam allowlist de campos, tipos, tamanhos, estados iniciais e timestamps; adoção também confirma que o animal referenciado existe, está publicado e disponível. O cliente usa um ID por tentativa guardado na sessão, desabilita reenvio durante a chamada, adiciona honeypot invisível e rejeita envio rápido demais. Esses controles melhoram UX e barram automação trivial, mas não são apresentados como rate limit seguro.

Em staging e produção, registrar App Check com reCAPTCHA Enterprise, observar métricas e só então impor em Firestore e Storage para não bloquear tráfego legítimo. O modo emulador não inicializa App Check nem troca token com serviço remoto; o debug provider fica restrito a um teste explicitamente autorizado contra staging e seu token nunca é versionado. Não coletar IP ou fingerprint no Firestore. Se App Check + Rules não forem suficientes, aplicar o gatilho de Functions descrito acima; Firestore Rules não implementa limite por IP/tempo.

## Cloud Storage e mídia

Usar caminhos `public/animals/{animalId}/{uuid}.webp` e `public/products/{productId}/{uuid}.webp`. Guardar no Firestore somente `imagePath` e texto alternativo, não nome local nem credencial. Leitura é pública porque o conteúdo é catálogo público; upload, substituição e exclusão exigem administrador ativo.

Storage Rules aceitam somente JPEG, PNG ou WebP, no máximo 5 MiB, rejeitam SVG e outros tipos e limitam o nome gerado. O cliente redimensiona para no máximo 1600 px e prefere WebP antes do upload. Na troca: enviar arquivo novo, atualizar o documento e só então apagar o antigo; se a última etapa falhar, registrar órfão para limpeza manual. Não há upload público de foto, comprovante ou anexo e não há resize/cleanup automático na primeira versão.

## Seed fictício e reproduzível

T12 implementa `scripts/seed-emulators.mjs` e fixtures versionadas com IDs fixos para duas contas locais, um administrador ativo, a configuração pública, três animais e sete produtos com suas dez mídias. Solicitações de adoção e doações permanecem vazias no baseline para serem demonstradas pelos formulários reais. O Admin SDK é usado somente nas operações privilegiadas de Auth/autorização; conteúdo e mídia passam pelos clientes conectados aos emuladores e pelas Rules aceitas. O comando faz upsert dos IDs conhecidos, preserva documentos desconhecidos e pode rodar duas vezes sem duplicar nem alterar `createdAt`.

Antes de escrever, o seed recusa credenciais/configuração externa, projetos diferentes de `demo-aufriends-local` e hosts divergentes; consulta o Hub e a configuração da Emulator Suite para confirmar Auth, Firestore e Storage nas portas de loopback oficiais. Não lê SQL, arquivos de senha ou usuários antigos. As duas senhas de demonstração são fictícias, documentadas como locais e nunca reutilizadas em staging/produção.

## Carrinho e checkout por WhatsApp

Persistir `aufriends.cart.v1` no `localStorage` com `{ productId, quantity }`; nome e preço vêm do catálogo e os cálculos usam `priceCents`, nunca ponto flutuante. Antes de finalizar, reler os produtos ativos envolvidos, recomputar subtotais/total e refletir eventual alteração de preço ou indisponibilidade.

Gerar `https://wa.me/{whatsappDigits}?text={encodeURIComponent(mensagem)}` com saudação, itens, quantidades, valores unitários, subtotais, total e pedido para combinar entrega e Pix. Carrinho vazio não abre link. Não criar pedido no Firestore, coletar pagamento ou expor chave Pix. Abrir o WhatsApp antes de oferecer limpar o carrinho; nunca apagar automaticamente ao clicar.

## Custos, conta e billing

Cloud Storage for Firebase exige plano Blaze desde 03/02/2026, inclusive para o bucket padrão. Logo, staging e produção com upload administrativo exigem conta de billing autorizada; não há publicação parcial fingindo que Storage funcionará no Spark. O Blaze mantém cotas sem custo em vários serviços, mas cobra excedentes; o bucket em São Paulo segue preços normais de Cloud Storage e não o “Always Free” regional dos EUA.

Firestore cobra leituras, escritas, deletes, índices, armazenamento e tráfego; listeners devem ser usados só onde atualização em tempo real agrega valor. Lookup de `admins` nas Rules também pode gerar leitura. App Check/reCAPTCHA Enterprise tem cota própria. Functions não gera custo nesta versão porque não será implantada.

Antes do primeiro recurso remoto: confirmar conta proprietária, dois responsáveis de recuperação, região, e-mails administrativos e um orçamento mensal aprovado. Configurar alertas em 50%, 80% e 100%, além de acompanhar uso por produto. Alertas de orçamento **não interrompem** Firestore/Storage/Hosting; o responsável precisa reagir. Publicação e ativação de billing continuam bloqueadas até autorização específica.

Referências operacionais oficiais:

- [ambientes separados por projeto](https://firebase.google.com/docs/projects/dev-workflows/general-best-practices)
- [regiões e imutabilidade do Firestore](https://firebase.google.com/docs/firestore/locations)
- [regiões e imutabilidade do Storage](https://firebase.google.com/docs/storage/locations)
- [exigência Blaze do Cloud Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- [preços e cotas do Firestore](https://firebase.google.com/docs/firestore/pricing)
- [App Check para Web](https://firebase.google.com/docs/app-check/web/recaptcha-provider)
- [alertas e limites de orçamento](https://firebase.google.com/docs/projects/billing/budget-alerts)

## Responsabilidades e sequência de execução

1. **T04 — base reproduzível:** instalar JDK LTS compatível; criar `package.json`/lock, Vite, `firebase.json`, portas, scripts e adaptador de ambiente; iniciar Hosting/Auth/Firestore/Storage Emulator com `demo-aufriends-local`. Não inicializar Functions nem projeto remoto.
2. **Estabilizar a base:** T04 entrega esses arquivos antes de T05/T06. Depois, evitar edição concorrente: T05 fica em `web/**`; T06 fica em `firestore.rules`, `firestore.indexes.json`, `storage.rules` e `tests/rules/**`. Alterações posteriores em `package.json` ou `firebase.json` voltam ao responsável da base.
3. **T05 — aplicação estática:** converter PHP/includes em HTML e componentes JS, ligar módulos/repositórios, corrigir links/assets/gitlink acidental e preservar CSS/layout. O build não inclui PHP, SQL ou caminhos locais.
4. **T06 — dados e segurança:** implementar exatamente as coleções, consultas, índices e Rules deste documento; testar matriz pública/admin/negação e Storage. Qualquer mudança de contrato volta ao Orquestrador antes de divergir.
5. **Depois da base estável:** T07–T12 e T17 implementam fluxos e seed. T13 revisa segurança. T14 valida regressão. T15 cria staging e produção somente com conta e autorização.

## Rollback

- local: reverter os commits de T04–T06; dados de emulador são descartáveis e repovoados pelo seed;
- staging: validar primeiro e apagar/recriar apenas fixtures; nunca copiar dados de produção;
- Hosting: registrar a release e voltar à versão anterior pelo histórico de releases;
- Rules/índices: manter versionados e redeployar o conjunto anterior compatível; não voltar só o cliente se as Rules antigas forem incompatíveis;
- dados: evoluir schema de forma aditiva. Antes de mudança destrutiva futura, criar export autorizado e testado; não há migração ou rollback de SQL nesta entrega;
- mídia: nomes imutáveis e troca em duas etapas mantêm a imagem anterior até o documento apontar para a nova.

Se o proprietário recusar Blaze, a alternativa é publicar imagens fixas no Hosting e remover upload administrativo; isso reduz o requisito e precisa de decisão do usuário, não de adaptação silenciosa.

## Critérios verificáveis para liberar execução

### T04

- clone limpo executa `npm ci`, `npm run build` e inicia os quatro emuladores após instalar o JDK documentado;
- app local usa `demo-aufriends-local`; teste prova que nenhuma chamada alcança staging/produção;
- `firebase.json` não contém Functions e não existe credencial no repositório;
- comandos de deploy remoto exigem alias explícito e permanecem não executados.

### T05

- `dist/` contém somente artefatos estáticos e todas as rotas/assets abrem pelo Hosting Emulator;
- não restam chamadas PHP/MySQL, `.php` em navegação publicada nem caminhos absolutos locais;
- comparação no Portal Maestri confirma cabeçalho, páginas essenciais, cores, tipografia, cards, responsividade e carrinho sem regressão visual relevante.

### T06

- testes de Rules cobrem: leitura pública publicada/negada, submissão válida/inválida, impossibilidade de ler ou alterar submissão pública, autenticado não administrador, administrador inativo/ativo, CRUD administrativo e upload válido/inválido;
- consultas acima executam no emulador com `firestore.indexes.json` versionado;
- default deny cobre coleções e caminhos não declarados;
- nenhum dado, usuário ou arquivo SQL legado é lido ou migrado.

### T12

- seed roda duas vezes com mesma contagem/IDs, cria Auth/Firestore/Storage fictícios coerentes e aborta fora dos emuladores.

## Riscos residuais

- App Check reduz, mas não elimina, spam; Rules não fazem rate limit. Mitigação e gatilho de escalada estão definidos.
- autorização por `admins` adiciona leitura de Rules e exige operação coerente entre Auth e Firestore; baixo volume atual torna o custo aceitável.
- região e billing são irreversíveis/operacionais e continuam bloqueados até autorização.
- sem Functions, limpeza de mídia órfã e notificações são manuais; aceitável para a primeira entrega.
- dados de contato exigem política de retenção antes da produção; não ampliar os campos sem nova decisão.

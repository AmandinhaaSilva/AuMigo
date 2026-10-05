# Modelo Firestore e Storage do AuFriends

Status: contrato local implementado em T06

Projeto de teste: `demo-aufriends-local`

Este documento descreve o modelo aplicado por `firestore.rules`, `storage.rules` e pelos quatro índices compostos versionados. Ele não cria seed, usuários ou dados e não autoriza acesso a projeto Firebase remoto.

## Convenções

- Todos os documentos de domínio usam `schemaVersion: 1`.
- Campos usam `camelCase`; valores monetários são inteiros em centavos.
- Criações pelo cliente usam `serverTimestamp()` para `createdAt` e `updatedAt`; atualizações administrativas usam `serverTimestamp()` em `updatedAt`.
- `updatedBy` e `handledBy` recebem o UID autenticado quando aplicáveis.
- IDs de animais e produtos aceitam somente letras ASCII, números, `_` e `-`, com 1 a 128 caracteres.
- Solicitações e doações usam IDs aleatórios gerados pelo cliente. IDs fixos ficam reservados a fixtures futuras.
- Rules negam por padrão qualquer coleção, documento, subcoleção ou arquivo não descrito aqui.
- Não existem coleções de clientes, carrinhos, pedidos, pagamentos, Pix ou dados bancários.

## Autorização administrativa

Autenticação isolada não concede privilégio. `isAdmin()` exige simultaneamente:

1. `request.auth` presente;
2. documento `admins/{uid}` existente;
3. `admins/{uid}.active == true`.

O Web SDK nunca cria, altera ou remove documentos de `admins`. Provisionamento e desativação pertencem a um procedimento privilegiado futuro, fora do navegador. Administradores ativos podem ler a coleção para gestão; usuários apenas autenticados e administradores inativos continuam com acesso público.

## Coleções

### `animals/{animalId}`

| Campo | Tipo e validação |
| --- | --- |
| `schemaVersion` | inteiro igual a `1` |
| `name` | string, 1–80 |
| `species` | `dog`, `cat` ou `other` |
| `breed` | string, 0–80 |
| `ageMonths` | inteiro, 0–360 |
| `sex` | `male` ou `female` |
| `size` | `small`, `medium` ou `large` |
| `color` | string, 0–60 |
| `description` | string, 1–2000 |
| `adoptionStatus` | `available`, `in_process` ou `adopted` |
| `published` | boolean |
| `sortOrder` | inteiro |
| `imagePath` | `public/animals/{animalId}/{uuid}.{jpg|jpeg|png|webp}` |
| `imageAlt` | string, 1–140 |
| `createdAt` | timestamp imutável após criação |
| `updatedAt` | timestamp igual ao tempo da escrita |
| `updatedBy` | UID do administrador ativo |

Leitura pública exige `published == true`. Administrador ativo pode criar, editar, excluir e ler itens ocultos. Transições permitidas: `available → in_process → adopted`; `in_process` e `adopted` podem reabrir para `available`. Permanecer no mesmo estado também é válido.

### `products/{productId}`

| Campo | Tipo e validação |
| --- | --- |
| `schemaVersion` | inteiro igual a `1` |
| `name` | string, 1–120 |
| `description` | string, 1–1500 |
| `category` | `food`, `treats`, `accessories`, `hygiene`, `clothing` ou `toys` |
| `priceCents` | inteiro maior ou igual a zero |
| `compareAtPriceCents` | inteiro maior ou igual a zero, ou `null` |
| `badge` | string, 0–40 |
| `active` | boolean |
| `sortOrder` | inteiro |
| `imagePath` | `public/products/{productId}/{uuid}.{jpg|jpeg|png|webp}` |
| `imageAlt` | string, 1–140 |
| `createdAt` | timestamp imutável após criação |
| `updatedAt` | timestamp igual ao tempo da escrita |
| `updatedBy` | UID do administrador ativo |

Leitura pública exige `active == true`. Administrador ativo possui CRUD do catálogo.

### `adoptionRequests/{requestId}`

| Campo | Tipo e validação |
| --- | --- |
| `schemaVersion` | inteiro igual a `1` |
| `animalId` | ID seguro de animal existente, publicado e disponível no envio |
| `fullName` | string, 2–120 |
| `email` | string, 5–254, formato básico `local@dominio.tld` |
| `phoneE164` | 10–15 dígitos, com `+` opcional |
| `city` | string, 2–100 |
| `state` | duas letras ASCII maiúsculas |
| `message` | string, 0–1500 |
| `privacyConsent` | obrigatoriamente `true` |
| `status` | `pending`, `contacting`, `approved` ou `rejected` |
| `adminNotes` | string, 0–2000; obrigatoriamente vazia na criação pública |
| `handledBy` | `null` na criação; UID do administrador no tratamento |
| `createdAt` | timestamp igual ao tempo da criação |
| `updatedAt` | timestamp igual ao tempo da escrita |

O público somente cria um payload exato no estado `pending`; não pode ler, listar, editar ou excluir submissões. Administrador ativo lê, trata e exclui. Em updates pelo Web SDK somente `status`, `adminNotes`, `handledBy` e `updatedAt` podem mudar.

Transições: `pending → contacting → approved|rejected`; `approved` e `rejected` podem reabrir para `contacting`.

### `donations/{donationId}`

| Campo | Tipo e validação |
| --- | --- |
| `schemaVersion` | inteiro igual a `1` |
| `fullName` | string, 2–120 |
| `email` | string, 5–254, formato básico `local@dominio.tld` |
| `phoneE164` | vazio ou 10–15 dígitos, com `+` opcional |
| `type` | `money`, `food`, `hygiene`, `clothing`, `blanket` ou `other` |
| `amountOrQuantity` | string, 1–160 |
| `deliveryMethod` | `dropoff`, `pickup` ou `arrange` |
| `message` | string, 0–1500 |
| `privacyConsent` | obrigatoriamente `true` |
| `status` | `received`, `contacting` ou `completed` |
| `adminNotes` | string, 0–2000; obrigatoriamente vazia na criação pública |
| `handledBy` | `null` na criação; UID do administrador no tratamento |
| `createdAt` | timestamp igual ao tempo da criação |
| `updatedAt` | timestamp igual ao tempo da escrita |

O público somente cria um payload exato no estado `received`; não lê nem altera submissões. Administrador ativo lê, trata e exclui. Em updates pelo Web SDK somente `status`, `adminNotes`, `handledBy` e `updatedAt` podem mudar.

Transições: `received → contacting → completed`; `completed` pode reabrir para `contacting`.

### `admins/{uid}`

| Campo | Tipo esperado no provisionamento privilegiado |
| --- | --- |
| `schemaVersion` | inteiro igual a `1` |
| `displayName` | string, 1–120 |
| `email` | string, 5–254 |
| `active` | boolean |
| `createdAt` | timestamp |
| `updatedAt` | timestamp |
| `createdBy` | UID do administrador que enviou o convite; obrigatório em convites pelo painel |
| `updatedBy` | UID do administrador que enviou o convite; obrigatório em convites pelo painel |

Somente administrador ativo lê. Um administrador ativo pode criar pelo Web SDK exclusivamente um novo documento ativo, com esquema exato, timestamps do servidor e `createdBy`/`updatedBy` iguais ao próprio UID. O painel cria a conta Auth em uma instância secundária e envia recuperação de senha sem substituir a sessão atual. Atualizar ou excluir documentos de `admins` pelo Web SDK continua negado, inclusive para o próprio administrador; revogação permanece uma operação privilegiada.

### `siteSettings/public`

| Campo | Tipo e validação |
| --- | --- |
| `schemaVersion` | inteiro igual a `1` |
| `brandName` | string, 1–80 |
| `whatsappDigits` | string com 10–15 dígitos, sem `+` |
| `whatsappGreeting` | string, 1–300 |
| `updatedAt` | timestamp igual ao tempo da escrita |
| `updatedBy` | UID do administrador ativo |

Leitura é pública. Administrador ativo pode criar, atualizar ou excluir o documento. Outros documentos sob `siteSettings` permanecem negados.

## Consultas e índices

Rules não filtram resultados. Consultas públicas precisam conter as mesmas condições exigidas para leitura.

| Uso | Consulta | Índice composto |
| --- | --- | --- |
| Animais públicos | `published == true`, `adoptionStatus == available`, `orderBy(sortOrder)` | `published ASC, adoptionStatus ASC, sortOrder ASC` |
| Produtos públicos | `active == true`, `orderBy(sortOrder)` | `active ASC, sortOrder ASC` |
| Adoções administrativas | `status == X`, `orderBy(createdAt, desc)` | `status ASC, createdAt DESC` |
| Doações administrativas | `status == X`, `orderBy(createdAt, desc)` | `status ASC, createdAt DESC` |

Filtros visuais adicionais permanecem no cliente sobre o conjunto público. Acesso a um animal específico usa leitura pelo ID e ainda exige `published == true` para visitantes.

## Cloud Storage

Caminhos permitidos:

- `public/animals/{animalId}/{uuid}.{jpg|jpeg|png|webp}`;
- `public/products/{productId}/{uuid}.{jpg|jpeg|png|webp}`.

O UUID deve ser minúsculo, versão 4 e variante RFC 4122. A leitura desses dois caminhos é pública. Criar, substituir ou excluir exige administrador ativo verificado em `admins/{uid}` pelo Firestore.

Uploads aceitam somente `image/jpeg`, `image/png` ou `image/webp`, com tamanho maior que zero e de no máximo 5 MiB. SVG, nomes não gerados, subdiretórios extras, caminhos privados e arquivos acima do limite são negados. Qualquer outro caminho fica sob default deny.

## Testes locais

Com a suíte `demo-aufriends-local` ativa nos ports oficiais:

```powershell
npm run test:rules:firestore
npm run test:rules:storage
npm run test:rules
```

Os testes usam somente `127.0.0.1:8080` e `127.0.0.1:9199`, limpam os dados fictícios entre cenários e não acessam SQL, credenciais ou projetos remotos.

## Riscos e continuidade

- Rules validam forma e autorização, mas não implementam rate limit; App Check e revisão de abuso permanecem para T13.
- Leituras de `admins/{uid}` feitas por Storage Rules contam como acesso Firestore em ambiente remoto.
- Retenção e exclusão de dados pessoais precisam de decisão antes de produção.
- O risco transitivo de `@grpc/grpc-js` registrado em T04 permanece; nenhum `audit fix --force` foi executado.

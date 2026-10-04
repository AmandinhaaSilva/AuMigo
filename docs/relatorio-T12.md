# Relatório T12 — seed fictício reproduzível

Data local: 03/10/2026

Projeto: `demo-aufriends-local`

Base: workspace T17 aceito, sobre `24d2fef574cc8b40658e49ed0b1876467191933c`

## Estado

T12 foi implementada, autoverificada e aceita pelo Orquestrador. O comando abaixo consolida as fixtures aceitas sem substituir os comandos específicos:

```powershell
npm run seed:emulators
```

O resultado esperado é:

- duas contas Auth locais com UIDs fixos: administrador e usuário não administrador;
- `admins/local-admin-aufriends` ativo;
- `siteSettings/public` com `AuFriends`, `5517991529090` e a saudação aceita pelo checkout;
- três animais e sete produtos nos IDs aceitos;
- três mídias de animais e sete mídias de produtos nos caminhos fixos;
- zero documentos criados em `adoptionRequests` e `donations`.

## Segurança e comportamento

Um preflight compartilhado é obrigatório antes de qualquer escrita. Ele:

1. recusa `GOOGLE_APPLICATION_CREDENTIALS` e `FIREBASE_CONFIG`;
2. recusa IDs de projeto diferentes de `demo-aufriends-local`;
3. recusa variáveis de Auth, Firestore, Storage ou Hub fora dos endpoints oficiais;
4. consulta somente o Hub `127.0.0.1:4400` e a configuração da UI `127.0.0.1:4000`;
5. confirma Auth `:9099`, Firestore `:8080`, Storage `:9199` e o projeto fictício antes de entregar um token interno às fixtures.

O seed faz upsert somente dos IDs baseline. Ele não enumera e não apaga documentos desconhecidos, não limpa coleções e não remove caminhos antigos de mídia. Se o documento conhecido do usuário não administrador já existir em `admins`, o seed apenas o desativa; não cria esse documento no estado aceito. Os comandos antigos mantêm o comportamento anterior e continuam executáveis.

Reexecuções preservam `createdAt` de Auth, administrador, animais e produtos. `updatedAt` de configuração/animais/produtos e os metadados de upload são renovados para refletir a aplicação mais recente; o documento administrativo mantém o timestamp local determinístico. Os bytes e caminhos das dez mídias permanecem idênticos aos assets versionados.

Nenhum script lê SQL, banco legado, senha antiga ou usuário legado. As únicas senhas presentes são as duas credenciais fictícias locais já documentadas, usadas exclusivamente pelo Auth Emulator.

## Arquivos

- `scripts/fixtures/local-emulator-environment.mjs` — preflight central e configuração local;
- `scripts/fixtures/admin-auth.mjs` — fixture T07 exportável e comando legado preservado;
- `scripts/fixtures/adoptions-t09.mjs` — dados/função T09 exportáveis;
- `scripts/fixtures/products-t11.mjs` — função T11 ligada ao preflight central;
- `scripts/fixtures/site-settings.mjs` — baseline público T12;
- `scripts/seed-emulators.mjs` — orquestração do comando único;
- `scripts/verify-seed-emulators.mjs` — verificador T12;
- `package.json` — scripts `seed:emulators` e `verify:t12`;
- `README.md` — operação local consolidada;
- `docs/arquitetura-firebase-aufriends.md` — contrato do seed reconciliado com a implementação final;
- `docs/relatorio-T12.md` — este relatório.

## Cenários T12

Foram planejados, executados e aprovados 14/14 cenários; 0 falhos e 0 bloqueados:

1. projeto, Hub e endpoints oficiais;
2. estado inicial sem submissões e sentinela desconhecida;
3. primeira execução;
4. segunda execução e ausência de duplicação;
5. duas contas Auth, credenciais e criação estável;
6. administrador ativo e `createdAt` estável;
7. configuração pública exata;
8. três animais e `createdAt` estável;
9. sete produtos e `createdAt` estável;
10. dez mídias comparadas byte a byte com SHA-256 dos assets;
11. submissões vazias e sentinela desconhecida preservada;
12. recusa segura de credencial, configuração, projeto e host remotos;
13. preservação dos comandos legados e ausência de reset, SQL e deploy;
14. limpeza da sentinela e restauração do estado aceito.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `npm run seed:emulators` — execução 1 | PASSOU |
| `npm run seed:emulators` — execução 2 | PASSOU |
| `npm run build` | PASSOU; Vite 8.3.2, 55 módulos |
| `npm run verify:t12` | PASSOU; 14/14, 0 falhos; repetido após os comandos legados |
| `npm run fixtures:auth` | PASSOU |
| `npm run fixtures:adoptions` | PASSOU |
| `npm run fixtures:products` | PASSOU |
| `npm run verify:auth` | PASSOU; 7/7 |
| `npm run verify:panel` | PASSOU; 10/10 |
| `npm run verify:t09` | PASSOU; 18/18 |
| `npm run verify:t11` | PASSOU; 17/17 |
| `npm run verify:t17` | PASSOU; 12/12 |
| Portal Maestri desktop 1440×900 | PASSOU; 3 animais, 7 produtos, métricas 3/7/0/0, configuração pública correta e console vazio |

As regressões diretamente afetadas totalizaram 64/64. T10 não foi repetida porque o seed não lê nem escreve `donations`; T12 confirmou a coleção vazia antes e depois das execuções. A suíte Rules não foi repetida porque Rules e índices não mudaram.

Os registros `PERMISSION_DENIED` nas regressões são evidência esperada dos cenários negativos.

## Revisão funcional do Orquestrador

- `npm run seed:emulators` foi repetido duas vezes na versão final; ambas as execuções confirmaram previamente projeto, Hub e portas locais e concluíram 2 contas, administrador baseline, configuração, 3 animais, 7 produtos e 10 mídias.
- A repetição independente de `verify:t12` aprovou 14/14 cenários, incluindo `createdAt` estável, hashes das mídias, quatro recusas de ambiente remoto, sentinela desconhecida preservada e limpeza final.
- Build e regressões foram repetidos: 55 módulos, Auth 7/7, painel 10/10, T09 18/18, T11 17/17 e T17 12/12.
- No Portal, `/adocoes` exibiu Luna, Thor e Jade com três imagens válidas; `/loja` exibiu os sete produtos e sete imagens; nenhuma das páginas apresentou overflow horizontal.
- O painel autenticado mostrou métricas 3 animais, 7 produtos, 0 pedidos de adoção e 0 doações. Marca, número `5517991529090` e saudação do WhatsApp coincidiram com o baseline.
- O console permaneceu vazio. A sessão administrativa foi encerrada e o Portal desktop foi deixado na página inicial.

## Integridade protegida

```text
firestore.rules          65c02ca639c317a69315794b65158a3ee2193362
storage.rules            89d886311e40cce1936ad5ba3472568ddc04f437
firestore.indexes.json   014d89fdc0f24ceb23aabd59e0109bb1d228be03
package-lock.json        282d092dae9bf566ba41dfab4eba75a5859910e7
```

Não houve alteração de dependência, lock, Rules, índices, configuração remota, commit ou deploy.

## Estado final e limites

Estado confirmado ao final: 2 usuários Auth, 1 administrador ativo, `siteSettings/public` correto, 3 animais, 7 produtos, 10 mídias fixas, 0 solicitações e 0 doações. A sentinela do verificador foi removida.

UI `:4000`, Hub `:4400`, Logging `:4500`, Hosting `:5000`, Firestore `:8080`, Auth `:9099` e Storage `:9199` permaneceram ativos em `127.0.0.1`; nenhum processo foi reiniciado ou encerrado.

O seed é deliberadamente um upsert, não um reset. Se um ambiente local já contiver documentos ou mídias adicionais, eles serão preservados e as contagens totais poderão exceder o baseline. Continua existente o aviso do build para o chunk Firebase acima de 500 kB.

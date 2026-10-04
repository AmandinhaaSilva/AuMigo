# Relatório T10 — Doações públicas e tratamento administrativo

## Estado e versão

T10 foi implementada e autoverificada sobre `24d2fef574cc8b40658e49ed0b1876467191933c` mais o workspace local aceito até T09, incluindo a correção posterior do reset dos filtros de adoção. Não houve commit, deploy, login em projeto remoto, reinício ou encerramento de serviço.

A implementação foi entregue pelo Ponte e depois submetida à validação independente do Orquestrador, registrada ao final deste relatório.

## Implementação

- `/doacoes` envia uma intenção sem autenticação com o payload contratual exato, timestamps do servidor, telefone opcional normalizado e enums versionados.
- Honeypot, espera mínima de 1,5 segundo, bloqueio durante a escrita e identificador persistido em `sessionStorage` evitam automação trivial e repetição acidental da mesma tentativa.
- A confirmação não devolve nome, e-mail, telefone ou outros dados pessoais.
- O painel protegido importa o módulo de doações somente depois da guarda administrativa, lista e filtra `received`, `contacting` e `completed`, permite as transições das Rules, salva notas com `handledBy` igual ao UID ativo, exclui mediante confirmação e solicita a atualização das métricas.
- O verificador usa documentos com UUID, não cria fixture persistente e remove os IDs efêmeros no bloco `finally`.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` e `package-lock.json` não foram alterados em T10. A implementação é compatível com o contrato existente.

## Arquivos T10

- `web/doacoes/index.html`
- `web/admin/painel/index.html`
- `web/src/features/donations-form.js`
- `web/src/features/admin-donations.js`
- `web/src/features/admin-panel.js`
- `web/src/services/donation-attempt.js`
- `web/src/services/donations-data.js`
- `web/src/styles/site.css`
- `scripts/verify-donations.mjs`
- `package.json`
- `docs/doacoes-local.md`
- `docs/relatorio-T10.md`
- `README.md`

## Comandos e resultados

| Comando/verificação | Resultado |
| --- | --- |
| `npm run build` | PASSOU; Vite 8.3.2, 49 módulos transformados |
| `npm run verify:t10` | PASSOU; 14/14 cenários, 0 falhos, limpeza concluída |
| `npm run verify:t09` | PASSOU; 18/18 cenários, 0 falhos, dados fixos preservados |
| `npm run verify:auth` | PASSOU; 7/7 cenários |
| `npm run verify:panel` | PASSOU; 10/10 cenários, configuração restaurada |
| `node --check` nos seis módulos/scripts T10 | PASSOU; 6/6 |
| parse de `package.json`, lock, `firebase.json` e índices | PASSOU; 4/4 JSON válidos |
| `npm ls --depth=0` | PASSOU; árvore instalada consistente |
| `git diff --check` | PASSOU; sem erro de whitespace; somente aviso LF/CRLF do README |
| varredura de segredos/destinos remotos no escopo T10 | PASSOU; nenhuma ocorrência |
| HTTP pelo Hosting Emulator | PASSOU; `/doacoes` e `/admin/painel` responderam 200 e contêm os marcadores funcionais |
| estado final do Firestore Emulator | PASSOU; 0 doações, 3 animais T09, 0 solicitações e `siteSettings/public` preservado |

A suíte de Rules não foi repetida porque limpa o estado compartilhado. A evidência vigente é 21/21, reutilizada conforme a orientação T10, e os arquivos de Rules/índices não mudaram.

### Denominador T10 (14 cenários)

1. normalização do telefone, honeypot e intervalo mínimo;
2. persistência e bloqueio do ID da tentativa na sessão;
3. HTML com enums, antispam e formulário funcional;
4. criação pública com payload exato e timestamps;
5. sobrescrita pública da mesma tentativa negada;
6. entrada inválida sem escrita;
7. leitura, edição e exclusão públicas negadas;
8. usuário autenticado não administrador negado;
9. listagem administrativa e filtro `received`;
10. `received → contacting`, nota e responsável;
11. `contacting → completed` e filtro `completed`;
12. mesmo estado, salto negado e `completed → contacting`, incluindo filtros;
13. exclusão administrativa;
14. limpeza dos registros efêmeros.

Os logs `PERMISSION_DENIED` observados correspondem aos cenários negativos esperados.

## Dados e serviços

Nenhum dado pessoal persistente foi criado. O verificador usou registros fictícios com prefixos `t10-donation-` e `t10-invalid-`, ambos ausentes ao final. Os serviços permaneceram ativos em loopback: UI `4000`, Hub `4400`, Hosting `5000`, Firestore `8080`, Auth `9099` e Storage `9199`.

## Riscos e limitações

- O honeypot e a espera no cliente não substituem rate limit ou App Check; essa defesa continua destinada à T13.
- O bundle compartilhado do Firebase tem 572,24 kB minificado e mantém o aviso de chunk acima de 500 kB; não bloqueia o fluxo.
- O risco de `npm audit` já documentado foi preservado e nenhum `fix --force` foi executado.
- Rate limit/App Check, otimização do chunk Firebase e revisão de dependências permanecem para T13/publicação; não bloquearam o fluxo local.

## Revisão do Orquestrador

A versão final foi recompilada e os verificadores foram repetidos pelo Orquestrador: build com 49 módulos, T10 14/14, T09 18/18, Auth 7/7 e painel 10/10. A evidência de Rules permanece 21/21 porque os arquivos de regras e índices não mudaram.

No Portal Maestri, em desktop 1440×900 e celular 390×844, foram confirmados:

- formulário público sem login, validação obrigatória e ausência de rolagem horizontal ou imagens quebradas;
- envio real com payload contratual, telefone convertido para `+5517999992222` e confirmação sem repetir dados pessoais;
- bloqueio da mesma tentativa após recarga da sessão;
- métrica administrativa igual a 1, filtros vazios e preenchidos e exposição correta dos dados no painel protegido;
- ciclo `received → contacting → completed → contacting`, persistência de notas e responsável administrativo;
- confirmação antes da exclusão, remoção do registro e retorno da métrica para 0;
- logout administrativo e console do Portal sem erros.

O estado final foi conferido diretamente nos emuladores: 0 doações, 3 animais da fixture T09, 0 solicitações de adoção, `siteSettings/public` preservado e somente as 3 mídias esperadas da fixture T09. O Portal Firebase Local foi deixado aberto na página inicial em `http://127.0.0.1:5000/`.

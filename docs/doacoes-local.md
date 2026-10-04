# Doações locais (T10)

O fluxo de doações registra somente uma intenção de contato no Firestore do projeto fictício `demo-aufriends-local`. Visitantes não criam conta e não podem ler, editar ou excluir o que enviaram. O site não processa pagamento, Pix, comprovante, anexo ou upload.

## Executar localmente

Com os emuladores já ativos, garanta as contas administrativas fictícias e rode o verificador:

```powershell
npm run fixtures:auth
npm run verify:t10
```

As credenciais descartáveis permanecem em `docs/autenticacao-admin-local.md`. T10 não possui fixture persistente: o verificador cria documentos com IDs exclusivos e remove todos no bloco de limpeza, inclusive quando um cenário falha.

Rotas locais:

- formulário público: `http://127.0.0.1:5000/doacoes`;
- login administrativo: `http://127.0.0.1:5000/admin`;
- painel protegido e tratamento: `http://127.0.0.1:5000/admin/painel#doacoes-admin`.

## Contrato e comportamento

O formulário normaliza o telefone opcional, usa os enums versionados para tipo e entrega e grava somente o payload definido em `docs/modelo-firestore.md`. A criação sempre usa `status: received`, notas vazias, responsável nulo e timestamps do servidor.

Um honeypot, o intervalo mínimo de 1,5 segundo e um ID por tentativa em `sessionStorage` reduzem automação trivial e reenvio acidental. Depois de uma resposta de sucesso, a mesma sessão não gera outra escrita. Esses controles não são rate limit e não substituem a revisão de App Check em T13.

No painel, somente administrador autenticado com `admins/{uid}.active == true` lista ou trata os registros. A interface altera exclusivamente `status`, `adminNotes`, `handledBy` e `updatedAt`, com as transições:

- `received → contacting`;
- `contacting → completed`;
- `completed → contacting`;
- permanência no mesmo estado.

A exclusão exige confirmação. Nenhum dado de doação é enviado a Storage, exibido publicamente ou incluído na mensagem de sucesso.

## Verificação

`npm run verify:t10` usa o Web SDK contra Auth e Firestore Emulator em loopback. Ele cobre normalização, proteções do formulário, payload exato, entrada inválida, duplicidade, negações pública/não admin, consultas administrativas, notas, responsável, transições e exclusão. A suíte de Rules 21/21 não deve ser repetida durante T10 porque ela limpa o estado compartilhado; a evidência T06/T09 continua aplicável, pois Rules e índices não mudaram.

A inspeção visual desktop/celular continua sob responsabilidade do Orquestrador. Os scripts de T10 não iniciam, reiniciam ou encerram emuladores.
